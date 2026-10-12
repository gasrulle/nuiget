# RUN — autonomous execution protocol for the nUIget 2.0 plan

This file is the complete instruction set for a Claude Code session that implements
`2026-10-11-nuiget-2.0-execution-plan.md` ("the plan") without a human in the loop. It is written for
Claude Opus 5.5 running with Claude Fable 5.1 as `/advisor`. The owner starts a session, pastes one line,
and the session works through open items until it reaches a stop condition. A new session re-reads this
file and `STATUS.md` and continues where the last one stopped; nothing from a previous session's
conversation is needed, because all state is in the repository.

The one-line prompt the owner uses:

```text
Read docs/plans/RUN.md and follow it exactly until a stop condition is reached.
```

## 0. Landing model

- All 2.0 work happens on **one long-lived branch, `labs/2.0`**, created from `main`. CI runs on every push
  to `labs/**`. Items are committed and pushed to it one at a time; each phase boundary is tagged
  `labs/2.0-<phase>-done` for navigation.
- `main` is protected and stays releasable as 1.18.x. A session never pushes to `main`, never merges a pull
  request, never enables auto-merge, never uses `--admin` or `--force`. The only pull request is the release
  one at the end (plan item P8.3), which the owner merges.
- If `main` receives other commits while the work is in progress (dependency bumps, hotfixes), the session
  merges `origin/main` into `labs/2.0` at the start of the session (§2); conflicts are resolved as part of the
  current item and verified by the full gate run.

## 1. Preconditions (check all; stop and report if any fails)

1. `git status --short` is empty and `git fetch origin` succeeds.
2. `node --version` → v24.x; `npm --version` → 11.x; `dotnet --list-sdks` lists a 10.0.x SDK.
3. `node_modules` exists; otherwise run `npm ci`.
4. `docs/plans/STATUS.md` exists. Read it fully. Read the plan's §1 (decisions), §2 (execution model), §3
   (salvage gate) and §4 (environment) **every session**; they are short and binding.
5. Assume the advisor is configured by the owner. If the transcript never shows an `Advising` line, continue
   anyway: the plan's L1 mechanism (the `architecture-advisor` subagent) does not depend on it.

## 2. Get onto the work branch

1. If `origin/labs/2.0` exists: `git switch -c labs/2.0 origin/labs/2.0` (or `git switch labs/2.0 && git pull
   --ff-only` when it already exists locally). Otherwise create it: `git switch -c labs/2.0 origin/main` and
   `git push -u origin labs/2.0`.
2. If `origin/main` has commits that are not on the branch (`git log --oneline labs/2.0..origin/main` is not
   empty): `git merge --no-edit origin/main`. If the merge conflicts, resolve, run the full gate list
   (plan §2.2 step 5), commit the merge and push before starting any item. If the merge touches
   `.mcp.json`, `.claude/hooks/**` or `.claude/skills/**` and the sandbox refuses to write them, stop and ask
   the owner to merge `main` into `labs/2.0` manually.
3. If the branch's last CI run is red (`gh run list --branch labs/2.0 --limit 1`), fix that first as part of
   the item that caused it (the last `done` row); do not start a new item on a red branch.

## 3. Pick the next item

The next item is the **first row in `STATUS.md` whose status is `open`** (the file is in execution order,
including the P0 ordering rule). Skip rows whose Notes say "owner decides" unless the owner changed the status
to `open` explicitly. Before starting it:

- Set the row to `in-progress` with today's date; commit that change together with the item's work, never
  separately.
- Read the item's full row in the plan (§5), the ADR(s) it names, and for salvage items the quarry
  directory's `STATUS.md` (then verify it against the quarry tree; it is stale).

Never start an item whose predecessor is `in-progress` or `blocked`. Never run two items at once.

## 4. Execute the item

Follow the plan's §2.2 ritual literally: baseline gates before editing, only the item's files (§2.1), gates
after editing in the stated order, docs duties, the directory's `STATUS.md` rewritten from the §2.5 template,
then commit. The item's own **Gate** column is the acceptance test; the item is not done until every gate
command produces the stated result.

Rules that override anything you would otherwise do:

- A missing neighbour module is **never stubbed**. If the item cannot compile without a module that a later
  item creates, mark the item `blocked` with the reason and stop.
- Frozen files (`src/protocol/**`, `src/core/contracts.ts`, `docs/adr/**`) are edited only by items that name
  them, using the sentinel procedure in plan D6. Any other need to touch them is a stop-and-ask.
- Every ⚑ item and every stop-and-ask trigger (plan §2.3) means: launch the `architecture-advisor` subagent
  with the §2.4 brief, paste its answer into the directory's `STATUS.md`, then act on it. If the answer says
  the owner must decide, mark the item `blocked` and stop.
  The subagent cannot read outside the repository: for salvage items paste the quarry excerpts (path:line and
  text) into the brief. Consultations may take more than ten minutes; run them in the background.
- Tests are never deleted, skipped or weakened except where the item names them by line or title.
- If a gate is still red after two fix attempts, mark the item `blocked` with the pasted output and stop.

## 5. Land the item

1. Commit with the `git-commit` skill: Conventional Commits, body cites the item ID, finding IDs and ADRs
   (example: `feat(core/ops): OperationQueue v2 (P2.1, ADR-003, Y2, Y3)`), trailer
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The commit includes the tracker row set to
   `done`, the directory `STATUS.md`, CHANGELOG and ARCHITECTURE changes. Put the commit's own SHA in the
   tracker row's Commit column in the **next** item's commit.
2. `git push origin labs/2.0` (never `--force`).
3. Wait for CI on that push: `gh run list --branch labs/2.0 --limit 1 --json databaseId,headSha,status` until
   a run for the pushed SHA appears, then `gh run watch <id> --exit-status`. Green → next item. Red →
   `gh run view <id> --log-failed`, fix forward in a new commit that cites the same item, push, wait again;
   after two red runs mark the item `blocked` and stop. Never start the next item on a red branch.

## 6. Phase boundaries

When the last item of a phase is `done` and CI is green:

1. Run the phase gate line from the plan (the bold **P# gate** paragraph) and paste the results into
   `STATUS.md` under a `## Phase gates` section at the bottom of the file.
2. Launch the `architecture-advisor` subagent with the brief `PHASE REVIEW <phase>`, the commit list
   (`git log --oneline <previous phase tag>..HEAD`, or `origin/main..HEAD` for P0) and the gate output; ask for
   defects that must be fixed before the next phase. Paste the answer into the same section. Fix anything it
   marks as blocking as an extra item `<phase>.fix-n` appended to the tracker, then re-run the gate.
3. Commit, push, wait for green CI, then tag: `git tag labs/2.0-<phase>-done && git push origin
   labs/2.0-<phase>-done`.
4. Continue with the next phase's first item. Exception: after P3 (which ends with item P3.6, the re-based
   estimate) **stop** so the owner can read the estimate before the large phases begin.

## 7. Stop conditions (end the turn with a report)

Stop, write the report in §8, and end the turn when any of these holds:

- An item became `blocked` (reason in its row).
- The next open item is owner-only: P0.14 while marked "owner decides", P7.4 (manual accessibility pass),
  P8.3 (publishing: open the release pull request `labs/2.0` → `main` with `gh pr create`, then stop; the
  owner merges and publishes).
- P3.6 or P7.6 (acceptance cut) just completed.
- A permission prompt was denied, a toolchain check failed, or a `main` merge needs the owner (§2.2).
- The session's context was compacted twice (re-read this file and `STATUS.md` after each compaction; after
  the second, finish the current item, land it, and stop so a fresh session continues).

Otherwise continue to the next item. Do not pause to ask whether to continue.

## 8. Report format (last message of the session)

```text
Branch: labs/2.0 @ <sha>
Items closed this session: <IDs with SHAs>
Items in progress/blocked: <ID: one-line reason>
Gates run: <command → result, one per line; SKIPPED entries with reasons>
CI: <run ids and conclusions>
Advisor consultations: <item: question → decision>
Next open item: <ID>   Owner action needed: <none | decide … | run … | merge release PR #n>
```

## 9. Owner-side setup (once) and routine

- In the implementing session: `/model claude-opus-5-5`, then `/advisor claude-fable-5-1` (the advisor choice
  persists in `~/.claude/settings.json`).
- Permission mode: the repo's `.claude/settings.json` pre-approves the build, test, git branch/push and
  GitHub CLI commands this protocol uses (`git switch`, `git push -u origin labs/*`, `gh run`, `gh pr create`,
  `gh pr list`, `gh pr view`). Publishing, force-push, direct pushes to `main` and merging stay with the owner.
  Run the session in the app's auto-accept mode; if a command still prompts, approve it once per pattern.
- Routine: start a session on the repository, paste the one-line prompt, leave it. When it stops, read the
  last line of its report; if it names an action, do it; then start a new session and paste the same line.
  State is on disk; nothing is lost between sessions. Progress is visible at any time in
  `docs/plans/STATUS.md` on the `labs/2.0` branch.

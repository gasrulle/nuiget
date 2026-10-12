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

- `main` is protected: changes reach it only through pull requests that the **owner** reviews and merges.
  A session never pushes to `main`, never merges a pull request, never enables auto-merge, never uses
  `--admin` or `--force`.
- Each plan phase has one branch, `labs/2.0-<phase>` (for example `labs/2.0-P0`). CI runs on every push to
  `labs/**`. Items are committed and pushed to the phase branch one at a time.
- When the last item of a phase is done and its gate passes, the session opens one pull request from the
  phase branch to `main` and stops. The next phase starts only after the owner has merged that pull request.

## 1. Preconditions (check all; stop and report if any fails)

1. `git status --short` is empty and `git fetch origin` succeeds.
2. `node --version` → v24.x; `npm --version` → 11.x; `dotnet --list-sdks` lists a 10.0.x SDK.
3. `node_modules` exists; otherwise run `npm ci`.
4. `docs/plans/STATUS.md` exists. Read it fully. Read the plan's §1 (decisions), §2 (execution model), §3
   (salvage gate) and §4 (environment) **every session**; they are short and binding.
5. Assume the advisor is configured by the owner. If the transcript never shows an `Advising` line, continue
   anyway: the plan's L1 mechanism (the `architecture-advisor` subagent) does not depend on it.

## 2. Find the current phase and branch

1. The current phase is the phase of the first `open` row in `STATUS.md` (the file is in execution order,
   including the P0 ordering rule). Let it be `<phase>` and the branch name `labs/2.0-<phase>`.
2. If a previous phase has a pull request that is not merged yet (`gh pr list --base main --state open
   --search "labs/2.0-"`), stop: the owner must merge it first (report the PR number).
3. If `origin/labs/2.0-<phase>` exists: `git switch -c labs/2.0-<phase> origin/labs/2.0-<phase>` (or
   `git switch` to it if it already exists locally and `git pull --ff-only`).
   Otherwise create it from `main`: `git switch -c labs/2.0-<phase> origin/main`.
4. If the branch's CI is red (`gh run list --branch labs/2.0-<phase> --limit 1`), fix that first as part of the
   item that caused it (its row is the last `done` row); do not start a new item on a red branch.

## 3. Pick the next item

The next item is the **first row in `STATUS.md` whose status is `open`**. Skip rows whose Notes say "owner
decides" unless the owner changed the status to `open` explicitly. Before starting it:

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
- Tests are never deleted, skipped or weakened except where the item names them by line or title.
- If a gate is still red after two fix attempts, mark the item `blocked` with the pasted output and stop.

## 5. Land the item on the phase branch

1. Commit with the `git-commit` skill: Conventional Commits, body cites the item ID, finding IDs and ADRs
   (example: `feat(core/ops): OperationQueue v2 (P2.1, ADR-003, Y2, Y3)`), trailer
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The commit includes the tracker row set to
   `done`, the directory `STATUS.md`, CHANGELOG and ARCHITECTURE changes. Put the commit's own SHA in the
   tracker row's Commit column in the **next** item's commit.
2. `git push -u origin labs/2.0-<phase>` (never `--force`).
3. Wait for CI on that push: `gh run list --branch labs/2.0-<phase> --limit 1 --json databaseId,headSha,status`
   until a run for the pushed SHA appears, then `gh run watch <id> --exit-status`. Green → next item. Red →
   `gh run view <id> --log-failed`, fix forward in a new commit that cites the same item, push, wait again;
   after two red runs mark the item `blocked` and stop. Never start the next item on a red branch.

## 6. Phase boundaries

When the last item of a phase is `done` and CI is green:

1. Run the phase gate line from the plan (the bold **P# gate** paragraph) and paste the results into
   `STATUS.md` under a `## Phase gates` section at the bottom of the file.
2. Launch the `architecture-advisor` subagent with the brief `PHASE REVIEW <phase>`, the commit list
   (`git log --oneline origin/main..HEAD`) and the gate output; ask for defects that must be fixed before the
   phase can merge. Paste the answer into the same section. Fix anything it marks as blocking as an extra item
   `<phase>.fix-n` appended to the tracker, then re-run the gate.
3. Commit, push, wait for green CI, then open the pull request:
   `gh pr create --base main --head labs/2.0-<phase> --title "<phase>: <phase title from the plan>" --body-file <file>`
   where the body lists the items closed, the gate output, the advisor review verdict, and ends with
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
4. **Stop** (§7). The owner reviews and merges. The next session detects the merge (§2) and starts the next
   phase from the new `main`.

At the end of P3 the report must include item P3.6's re-based estimate so the owner can read it before
merging.

## 7. Stop conditions (end the turn with a report)

Stop, write the report in §8, and end the turn when any of these holds:

- A phase pull request was just opened, or a previous phase's pull request is still unmerged.
- An item became `blocked` (reason in its row).
- The next open item is owner-only: P0.14 while marked "owner decides", P7.4 (manual accessibility pass),
  P8.3 (publishing; prepare everything up to the VSIX artifact, then stop).
- P7.6 (acceptance cut) just completed.
- A permission prompt was denied, a toolchain check failed, or `origin/main` changed while a phase branch was
  in progress (another writer; the owner decides).
- The session's context was compacted twice (re-read this file and `STATUS.md` after each compaction; after
  the second, finish the current item, land it, and stop so a fresh session continues).

Otherwise continue to the next item. Do not pause to ask whether to continue.

## 8. Report format (last message of the session)

```text
Phase / branch: <phase> / labs/2.0-<phase>
Items closed this session: <IDs with SHAs>
Items in progress/blocked: <ID: one-line reason>
Gates run: <command → result, one per line; SKIPPED entries with reasons>
CI: <run ids and conclusions>
Advisor consultations: <item: question → decision>
Next open item: <ID>   Owner action needed: <none | merge PR #n | decide … | run …>
```

## 9. Owner-side setup (once) and routine

- In the implementing session: `/model claude-opus-5-5`, then `/advisor claude-fable-5-1` (the advisor choice
  persists in `~/.claude/settings.json`).
- Permission mode: the repo's `.claude/settings.json` pre-approves the build, test, git branch/push and
  GitHub CLI commands this protocol uses (`git switch`, `git push -u origin labs/*`, `gh run`, `gh pr create`,
  `gh pr list`, `gh pr view`). Publishing, force-push, direct pushes to `main` and merging stay with the owner.
  Run the session in the app's auto-accept mode; if a command still prompts, approve it once per pattern.
- Routine: start a session on `main`, paste the one-line prompt, leave it. When it stops, read the last lines of
  its report: if it says `merge PR #n`, review and merge that pull request on GitHub; if it names another
  action, do it; then start a new session and paste the same line. State is on disk; nothing is lost between
  sessions.

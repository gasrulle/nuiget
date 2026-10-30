# RUN-ux — autonomous execution protocol for the nUIget UX plan

This file is the complete instruction set for a Claude Code session that implements the UX plan without a human in
the loop. It is written for Claude Opus 5.5 running with Claude Fable 5.1 as `/advisor`. The owner starts a session,
pastes one line, and the session works through open items until it reaches a stop condition. A new session re-reads
this file and the tracker and continues where the last one stopped; nothing from a previous session's conversation is
needed, because all state is in the repository. It is `docs/plans/RUN.md` (the 2.0 protocol, history) with every
fixed value made a parameter and the rules of the UX plan added.

The one-line prompt the owner uses:

```text
Read docs/plans/RUN-ux.md and follow it exactly until a stop condition is reached.
```

## Parameters

| Name | Value |
|---|---|
| PLAN | `docs/plans/2026-10-23-nuiget-ux-execution-plan.md` ("the plan") |
| TRACKER | `docs/plans/STATUS-ux.md` |
| BRANCH | `labs/ux`, created from `origin/main` (never from `labs/2.0`) |
| BASE | `origin/main`, merged into BRANCH at every session start |
| REVIEW RANGE | `origin/main..HEAD` for P0; `labs/ux-<previous phase>-done..HEAD` afterwards |
| TAGS | `labs/ux-<phase>-done` (`labs/ux-P0-done`, …, `labs/ux-P5.3-done` for a feature mini-phase) |
| ITEM ID IN TEXT | `UX-<ID>` in commit messages, ledger rows and handoff notes (plan D57) |
| HANDOFF NOTE | the `STATUS.md` of the item's one source directory, else `docs/plans/handoff/<ITEM>.md` (plan §2.5) |
| CAPTURES | `captures/<run-id>/` inside the repository (gitignored, excluded from the VSIX); cited by run id and sha256 |
| VS CODE PIN | `1.140.0` (`--code_version`, plan D35) |
| UI STORAGE | `/tmp/nuiget-ui` (`--storage /tmp/nuiget-ui`; `--extensions_dir /tmp/nuiget-ui/extensions` is added by P0.7, until then ExTester uses `~/.vscode/extensions`) |
| ADVISORS | `architecture-advisor` (⚑, contracts, universal triggers), `design-advisor` (⚑-design, design triggers) |
| SENTINELS | `.claude/.contract-change` (frozen contracts, plan D6), `.claude/.test-retire` (test retirement, plan D29) |
| SAVED WORKFLOWS | `design-judge`, `precommit-review`, `phase-review` (`.claude/workflows/`) |
| OWNER-ONLY FILES | `.claude/settings.json`, `.claude/settings.local.json`, `.claude/launch.json`, `.mcp.json` |

## 0. Landing model

- All UX work happens on **one long-lived branch, BRANCH**. CI runs on every push to `labs/**`. Items are committed
  and pushed one at a time; each phase boundary is tagged with TAGS.
- `main` is protected. A session never pushes to `main`, never merges or closes a pull request, never enables
  auto-merge, never uses `--admin`, `--force` or `--no-verify`. The only pull request is the release one at the end
  (plan P7.5), which the owner squash-merges and publishes.
- `main` keeps moving (Dependabot): the session merges BASE into BRANCH at its start (§2); conflicts are resolved as
  part of the current item and verified by the full gate list.
- The owner has opted in to the session running exactly the SAVED WORKFLOWS by name, with the arguments of §4, without
  asking. They are the only multi-agent steps; never author another workflow (ultracode is off).

## 1. Preconditions (check all; stop and report if any fails)

1. `git fetch origin` succeeds, and `git status --porcelain --untracked-files=all` (never plain `--short`, which hides
   untracked files in tracked directories) is one of:
   - empty;
   - changes within the files of the tracker's `in-progress` row (resume it, §3);
   - exactly ` M .claude/settings.json` and `?? .claude/launch.json` while row P0.0 is `owner action`: the owner applied
     the settings patch. Commit them first, as row P0.0, together with the tracker row set to `done` and its Notes and
     nothing else: `git add .claude/settings.json .claude/launch.json docs/plans/STATUS-ux.md`, then the `git-commit`
     skill with `chore(claude): apply the owner's settings patch (UX-P0.0)`; push. Until that commit never run
     `git stash`, `git reset` or `git checkout -- .`: they would revert the owner's change.
   Anything else is a stop: report the paths.
2. `node --version` → v24.x; `npm --version` → 11.x; `dotnet --list-sdks` lists a 10.0.x SDK; `gh --version` → 2.x.
   Then `code-server --version` → `1.142.0` (needed only for the optional browser pass and P0.28; a failure is
   recorded in the report, not a stop, unless the next item is P0.28).
3. `node_modules` exists; otherwise run `npm ci`.
4. Read TRACKER fully. Read the plan's §1 (decisions), §2 (execution model), §3 (branch model) and §4 (environment)
   **every session**; they are binding. Until plan item P0.3 lands (it runs right after P0.1, before P0.2),
   `CLAUDE.md` still carries the section "2.0 execution protocol", which loads as overriding instructions: this file
   and the plan supersede it, and nothing in it (`labs/2.0`, `RUN.md`, `docs/plans/STATUS.md`) is followed.
5. Assume the advisor is configured by the owner. If the transcript never shows an `Advising` line, continue anyway:
   the plan's L1 mechanism (the ADVISORS subagents) does not depend on it.

## 2. Get onto the work branch

1. If `origin/labs/ux` exists: `git switch labs/ux && git pull --ff-only` (or `git switch -c labs/ux origin/labs/ux`
   when it does not exist locally). Otherwise create it: `git switch -c labs/ux origin/main` and
   `git push -u origin labs/ux`.
2. If `git log --oneline labs/ux..origin/main` is not empty: `git merge --no-edit origin/main`. If the merge
   conflicts, resolve, run the full gate list (plan §2.2 step 5), commit the merge and push before starting any item.
   If the merge touches an OWNER-ONLY FILE, `scripts/hooks/**` or `.claude/skills/**` and the guard or the sandbox
   refuses to write it, stop and ask the owner to merge `main` into BRANCH.
3. If the branch's last CI run is red (`gh run list --branch labs/ux --limit 1`), fix that first as part of the item
   that caused it (the last `done` row); never start a new item on a red branch.

## 3. Pick the next item

1. **Resume first.** If a row is `in-progress`, that is the item. Read the item's HANDOFF NOTE;
   a note is valid only with a commit SHA and pasted gate output. Verify its claims against the tree (`ls`, `grep`,
   `git diff --stat`), run the baseline gates (plan §2.2 step 3) on the tree as it is, and continue the item from the
   note's "Exact next step". Never discard uncommitted work of the item; never trust a note you have not verified.
2. Otherwise the next item is the **first row whose status is `open`**, in table order, passing over:
   - rows whose status is `owner action`, `skipped`, `done`;
   - rows whose Notes say `after <ID>` while row `<ID>` is not `done` (P0.28 `after P0.0`); they do not block later
     rows.
3. Never start an item while another row is `in-progress` or while an earlier row (other than a passed-over one) is
   `blocked`. Never run two items at once.
4. Set the row to `in-progress` with today's date; commit that change together with the item's work, never separately.
5. Read the item's full row in the plan's §5, the ADRs and decisions it names (ADR-010–013 for UI items), the rule ids
   it cites in `docs/design/design-system.md`, the artboards and `<state>.spec.json` files of its states under
   `docs/design/artboards/`, and the §8.1 rows of `docs/ux/interaction-model.md` it will render.

## 4. Execute the item

Follow the plan's §2.2 ritual literally: baseline gates before editing, only the item's files (plan §2.1), gates after
editing in the stated order, docs duties, the HANDOFF NOTE rewritten from the plan's §2.5 template, then commit. The
item's own **Gate** column is the acceptance test; for every item that changes `src/webview/**`, host rendering or a
capture state it includes **G-UI** (plan §2.8). During P0 a G-UI step whose tool a later P0 item provides is written
`SKIPPED: <tool> lands in <item>` (plan §2.8 lists them). The item is not done until every gate command produces the
stated result.

Rules that override anything you would otherwise do:

- A missing neighbour module is **never stubbed**. If the item cannot compile without a module a later item creates,
  mark it `blocked` with the reason and stop.
- **Frozen contracts** (`src/protocol/**`, `src/core/contracts.ts`, `docs/adr/**`) change only in items that name
  them: the advisor's approval pasted into the HANDOFF NOTE; create `.claude/.contract-change` (content `UX-<ID>`); edit with
  the Edit or Write tool only (a shell redirect or here-document goes around the guard); for a protocol change run
  `npm run docs:protocol` and add the keys to the records of `src/protocol/guards.ts`; delete the sentinel; then
  commit. Any other need to touch them is a stop-and-ask.
- **OWNER-ONLY FILES** are never edited. When a gate needs a new allow rule or launch entry: write the unified diff
  to `patches/<name>.patch`, add an `owner action` row after the current one naming the one apply command, record it in
  the report, and continue with work that does not need it (or stop if the item does).
- **Tests** are never deleted, skipped or weakened except where the item names them by title (rewrite in place) or
  through `.claude/.test-retire`: after a pasted design-advisor ruling, write the exact paths the item names, one per
  line; delete or rename exactly those; delete the sentinel; then commit (`git commit` is denied while it exists).
- **Consultation.** Every ⚑ item and every universal trigger (plan §2.3) → `architecture-advisor`; every ⚑-design item
  and every design trigger (plan §2.3, triggers 1–6) → `design-advisor`. Launch the subagent with the plan's §2.4 brief
  (a design brief adds RULES, ARTBOARD, CAPTURES, MEASUREMENTS, JUDGE), in the background (a consultation can exceed
  ten minutes), paste its answer verbatim into the HANDOFF NOTE, then act on it. `OWNER MUST DECIDE` → mark
  the item `blocked` and stop. The subagents cannot read outside the repository: paste the excerpts they rely on and
  cite captures under CAPTURES.
- If a gate is still red after two fix attempts, park the work and stop: `git stash push --include-untracked -m
  'UX-<ID> wip'`, then `git stash show -p --include-untracked 'stash@{0}' > captures/wip/<ID>.patch` (gitignored WIP,
  never evidence); set the row to `blocked` with the pasted output and the patch path in its Notes; commit that tracker
  change alone and push. The next session re-applies the work (`git stash pop`, or `git apply captures/wip/<ID>.patch`
  when the stash is gone) once the blocker is resolved.
- `gh api` is used for GET requests only (until P0.2 lands no permission rule enforces it; after it the guard does).
- Bundle sizes: after any change under `src/core/**`, `src/host/**`, `src/extension.ts` or a webview, run
  `node esbuild.mjs --production --analyze` and paste the three sizes; a crossing is a stop-and-ask with the delta.

### 4.1 Evidence: numbers, never impressions

This replaces `RUN.md`'s visual-evidence rule. **A session never certifies a capture by looking at it.** After CI is
green on the item's push:

1. `gh run download <run-id> -n ui-screenshots -D captures/<run-id>` and `gh run download <run-id> -n ui-log -D
   captures/<run-id>` (and the `ui-screenshots-<theme>`, `ui-screenshots-floor` and `ui-screenshots-macos` artifacts at a phase gate).
2. `shasum -a 256 captures/<run-id>/*.png` → keep the hashes; every PNG a decision cites is named with its run id and
   sha256. A local capture (macOS, DPR 2) is never evidence for pixels and never updates a golden.
3. Paste into the HANDOFF NOTE under "Visual evidence": the `[measure]` lines of the item's states (hard and
   flipped rules), the `[diff]` lines with the reason for any state above tolerance, the `[axe]` and `[keys]` lines,
   and the `design-judge` result (§4.3).
4. A golden is updated only from CAPTURES of a green CI run, in the item's commit, with the reason in the HANDOFF NOTE; a
   golden changed to make a diff pass without a CSS reason is design trigger 1.

### 4.2 The `hard`/`pending` flip rule

Every rule in `src/test/ui/v2/measure.ts` is, per state group, `hard` or `pending: <ID>`. Only the item named in a
`pending` status flips it to `hard`, in the commit that makes it green, and updates its row in the tracker's "Pending
measurement rules" table. Never flip a rule in another item, never set a `hard` rule back to `pending`, never change a
tolerance (written once in the helper) to go green: each is design trigger 1. The run's `ui-output.txt` prints the
pending list at its end; G-UI step 2 greps it for the item's ID (expected 0).

### 4.3 The judge step (G-UI step 4)

Call the `Workflow` tool by name `design-judge` with `args`:

```json
{ "item": "<ID>", "runId": "<run-id>", "rubric": "docs/design/judge-rubric.md",
  "measurements": "captures/<run-id>/ui-output.txt",
  "states": [ { "name": "<state>", "png": "captures/<run-id>/<state>.<theme>.<width>.png",
                "artboardPng": "docs/design/artboards/<state>.<theme>.<width>.png",
                "spec": "docs/design/artboards/<state>.spec.json", "sha256": "<hex>" } ] }
```

- One entry per state the item touched (theme and width of its Tier A capture); at most 6 states per call (4 agents per
  state, ≤ 25 agents per run); more states → several calls, results merged. The README listing item (P6.5) passes
  `"mode": "listing"` with `artboardPng` and `spec` null. The P0.19 negative-control run uses screen mode with the
  committed artboards of the five states the ledger names (`main-installed-single`, `main-installed-all`,
  `main-transitive-expanded`, `main-updates`, `main-installed-details`). Only `main-installed-single` has one at
  P0 (round 1's composition A, corrected, rendered and specified by P0.27a as
  `main-installed-single.dark-modern.932.png` and `main-installed-single.dark-modern-classic.932.png` with
  `main-installed-single.spec.json`, the same file names as their captures); the others are
  recorded `pending artboard` and judged by the first item that commits their artboard.
- The result is `{ standing, refuted, singleJudge, incomplete, perState, counts }`. **An `incomplete` state is re-run,
  never clean.** Zero `incomplete` states is required; zero `standing` findings of severity `blocking` is required once
  the plan's D37 date is recorded in the tracker; before that every `standing` finding is fixed or carries a pasted
  design-advisor ruling. `singleJudge` findings are informational.
- Write `docs/plans/judge-log/<ID>.json` in the format of `docs/design/judge-rubric.md` §9: every standing finding with
  a disposition (`fixed`, `refuted-by-measurement`, `accepted-as-design` with the ruling). Never edit the rubric.
- If P0.1 recorded that the workflow does not resolve, use the fallback of plan §2.9: one `design-advisor`
  consultation per batch of at most six states with the same paths and the rubric, answering in the judge's JSON shape;
  the judge log records the panel as `fallback`; never stop for it.

### 4.4 Pre-commit review

Before the commit of every ⚑, ⚑-design or contract item, and of any item whose staged diff exceeds 400 changed lines
counted without handoff notes, the tracker, docs and deleted drafts
(`git diff --cached --shortstat -- . ':(exclude)*.md' ':(exclude)docs/*' ':(exclude)*.draft'`), call
`precommit-review` with `args` `{ "range": "--cached", "item": "<ID>" }`. Fix every `blocking` finding before
committing, or consult the advisor the item names and paste the ruling; an `incomplete` review is re-run, never
committed on. **Fallback** when P0.1 recorded no `Workflow` tool: one `architecture-advisor` consultation with
`git diff --cached` pasted and the question "review this staged change for correctness against the item row and the
rules, test integrity and documentation duties; list blocking findings with file and line"; its blocking findings are
handled the same way. Never stop for the missing tool.

### 4.5 The optional browser pass

Only when the item's named states cannot show the behaviour (hover, drag, motion, a dialog sequence) or when the judge
and the measurements disagree: follow `docs/plans/browser-loop.md` (`node scripts/browser-loop.mjs` with its steps `prepare`, `wait`, `theme` and
`stop`, the `nuiget-web` launch entry, `code-server` 1.142.0). It is informational: it never certifies anything, the
ExTester captures are the gate of record, and the session records the judge's output, never its own impression. Until
the loop's probe step 9 proves a way to save a pane screenshot as a file, the judge scores ExTester captures only and
the pass yields notes for a new named state, not evidence.

### 4.6 Docs duties specific to the UX plan

- CHANGELOG under the audience rule (plan D40): a change the user cannot notice gets no entry; harness items add none.
- Every hook an item starts rendering moves from interaction model §8.1 into the §8 tables in the same change.
- Gotcha rows that backtick a path land only once the path exists (`npm run docs:check`).

## 5. Land the item

1. Commit with the `git-commit` skill: Conventional Commits; the body cites `UX-<ID>`, finding, rule and ADR IDs
   (example: `feat(webview/primitives): Toolbar end slot and symmetric insets (UX-P2.5, V2, V41, DS-INSET-2,
   ADR-010)`); trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The commit includes the tracker row
   set to `done`, the HANDOFF NOTE, CHANGELOG and ARCHITECTURE changes. Put the commit's own SHA in the row's
   Commit column in the **next** item's commit. Before committing check `git status --porcelain --untracked-files=all`
   and add files by explicit path.
2. `git push origin labs/ux` (never `--force`).
3. Wait for CI on that push: `gh run list --branch labs/ux --limit 1 --json databaseId,headSha,status` until a run for
   the pushed SHA appears, then `gh run watch <id> --exit-status`. Green → §4.1 for UI items, then the next item.
   Red → `gh run view <id> --log-failed`; the known environmental failures of the gotcha table ("A red CI run is not
   always a code failure") are handled as it says; otherwise fix forward in a new commit citing the same item, push,
   wait again; after two red runs mark the item `blocked` and stop. Never start the next item on a red branch.

## 6. Phase boundaries

When the last row of a phase (or of a P5.x feature mini-phase) is `done` and CI is green:

1. Run the plan's bold **P# gate** line. At every phase boundary P0–P7 (not after a P5.x mini-phase) also dispatch
   the full matrix, the 1.90.0 floor lane and the macOS lane:
   `gh workflow run ci.yml --ref labs/ux -f tier=B`, wait for it (`gh run watch <id> --exit-status`) and download its
   artifacts into CAPTURES. The P0 gate also needs the UI job green twice on one SHA (`gh run rerun <id>` once, the
   flake budget) with identical `[measure]` output. Paste the results into the tracker under `## Phase gates`.
2. Call `phase-review` with `args` `{ "phase": "<phase>", "range": "<REVIEW RANGE>", "gateOutput": "<pasted gate
   output>" }`. Paste `advisors.architecture.answer` and `advisors.design.answer` verbatim and the
   `judgeDispositionRate` under `## Phase gates`; turn every `blocking` entry into a row `<phase>.fix-n` appended after
   the phase's last row; `INCOMPLETE` is re-run, never a pass. If P0.1 recorded that the workflows do not resolve,
   launch both advisors directly with the brief `PHASE REVIEW <phase>`, the commit list and the gate output.
3. Fix the `fix-n` rows, re-run the gate, commit, push, wait for green CI, then tag: `git tag labs/ux-<phase>-done &&
   git push origin labs/ux-<phase>-done`.
4. Continue with the next phase's first open row.

## 7. Stop conditions (end the turn with a report)

Stop, write the report in §8, and end the turn when any of these holds:

- An item became `blocked` (reason in its row), including an advisor's `OWNER MUST DECIDE`.
- **A before/after page awaits the owner's answer:** P2.10 (`slice-1`) or P7.4 (`release`) was just committed. The
  owner answers "better" or "not better" per state; a "not better" becomes a failing harness rule, then a fix row.
- **A design decision awaits the owner's pick:** a design-advisor ruling names a fork for the owner's round (rounds 1
  and 2 precede the plan; nothing else asks the owner for taste).
- **The next row the work depends on is an owner-action row** (a row added for a patch the session wrote).
  P0.0 does not stop the session: rows that do not need it continue, and P0.28 waits.
- P2.11 re-based the plan above 150 % of its total: the owner cuts features.
- The release pull request is open (P7.5): the owner replaces the `main` ruleset's required check `E2E (1.85.0)` with
  `E2E (1.90.0)` (the floor raise, plan D54), then merges and publishes.
- A permission prompt was denied, a toolchain check failed, or a `main` merge needs the owner (§2.2).
- The session's context was compacted twice (re-read this file and the tracker after each compaction; after the
  second, finish the current item, land it, and stop so a fresh session continues).

Otherwise continue to the next item. Do not pause to ask whether to continue.

## 8. Report format (last message of the session)

```text
Branch: labs/ux @ <sha>
Items closed this session: <IDs with SHAs>
Items in progress/blocked: <ID: one-line reason>
Gates run: <command → result, one per line; SKIPPED entries with reasons>
CI: <run ids and conclusions>
Captures cited: <captures/<run-id>/… with sha256, or none>
Rules flipped to hard: <rule@state-group: item, or none>
Judge: <item: standing/refuted/incomplete counts, or none>
Advisor consultations: <item: question → decision>
Tools: code-server --version → <result>
Next open item: <ID>   Start the next session at effort: <High|xhigh>   Owner action needed: <none | …>
```

The effort is `xhigh` while the next open item is a P0 row, `High` otherwise. "Owner action needed" names the exact
action: the patch to apply with its command, the before/after page to answer with its path, the decision with its
alternatives, or the release PR to merge.

## 9. Owner-side setup (once) and routine

- Once: `/model claude-opus-5-5`, then `/advisor claude-fable-5-1` (the advisor choice persists in
  `~/.claude/settings.json`). Apply `patches/settings-and-launch.patch` on `labs/ux` before the first session
  (`git -C ~/github/nuiget apply patches/settings-and-launch.patch`).
- Each session: a new session on the repository folder, worktree unchecked, Opus 5.5, permission mode Auto, ultracode
  **off**; effort as the last report's final line says (`xhigh` for P0, `High` afterwards). Paste the one-line prompt
  and leave it. When it stops, read the last line of its report; if it names an action, do it; then start a new
  session and paste the same line.
- The owner has opted in to the session running the saved workflows `design-judge`, `precommit-review` and
  `phase-review` by name without asking; the session never runs any other workflow.
- Progress is visible at any time in `docs/plans/STATUS-ux.md` on `labs/ux`. Publishing, force-push, pushes to
  `main`, merging and closing pull requests stay with the owner.

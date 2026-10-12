# Claude Code instructions

The agent guidance for this repository lives in `.github/` and is shared with GitHub Copilot. Treat it as written for you.

@.github/copilot-instructions.md

Path-scoped instructions from `.github/instructions/` load through `.claude/rules/`, skills from `.github/skills/` through `.claude/skills/`, and the agents in `.github/agents/` are available as subagents in `.claude/agents/`.

## 2.0 execution protocol

nUIget 2.0 is built on the `labs/2.0` branch by following `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`
("the plan"). `docs/plans/RUN.md` is the full protocol for an unattended session and `docs/plans/STATUS.md` is
the tracker. This section is the short form; when they disagree, the plan and `RUN.md` win.

- **Start of a session:** read `RUN.md`, the tracker, and the plan's §1 to §4. Check `node --version`,
  `npm --version` and `dotnet --list-sdks`; if a tool is missing, stop and report. Never download a toolchain.
- **One item at a time.** The next item is the first `open` row of the tracker. Edit only the item's files
  (plan §2.1); anything else is a stop-and-ask.
- **Fixed order per item:** baseline gates (`npx tsc --noEmit`, `npx eslint src`, `npx vitest run`) green
  before editing; do the item; gates again plus `npm test`, `npm run bench` and the item's own gate; docs
  duties; rewrite the directory's `STATUS.md` from the plan's §2.5 template; commit with the `git-commit`
  skill citing item, finding and ADR IDs; push to `labs/2.0`; wait for green CI before the next item.
- **Never** stub a missing neighbour module, commit red, delete, skip or weaken a test the item does not name,
  push to `main`, merge a pull request, or use `--force`, `--admin` or `--no-verify`.
- **Frozen contracts:** `src/protocol/**`, `src/core/contracts.ts` and `docs/adr/**` change only in an item
  that names them, behind the `.claude/.contract-change` sentinel (plan D6).
- **Explicit consultation:** for every item marked ⚑, every stop-and-ask trigger (plan §2.3) and every phase
  boundary, launch the `architecture-advisor` subagent with the plan's §2.4 brief, paste its answer verbatim
  into the directory's `STATUS.md`, then act on it. If it answers `OWNER MUST DECIDE`, mark the item `blocked`
  and stop.
- **Ambient advisor:** when an advisor is configured for the session, consult it before substantive work,
  when an error recurs, before declaring an item done, and before weakening any test.
- **Stop** when an item is blocked, when a gate is still red after two fix attempts, when the next item is the
  owner's, or when a permission prompt is denied. End with the report format in `RUN.md` §8.

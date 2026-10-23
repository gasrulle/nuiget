<!--
Target: CLAUDE.md. Replace the section "## 2.0 execution protocol" (from its heading to the end of the file) with
everything below this comment. Applied by the UX plan's P0 protocol item, after the plan, RUN-ux.md and STATUS-ux.md
are on labs/ux. Gate of that item: grep -rn 'RUN.md\|labs/2.0\|docs/plans/STATUS.md' CLAUDE.md
.github/copilot-instructions.md scripts/hooks/guard.mjs .claude/agents lists nothing that is not a historical
reference. The plan's file name below assumes the plan is dated 2026-10-23; change it if the plan's date differs.
-->
## UX execution protocol

The UX overhaul is built on the `labs/ux` branch, created from `origin/main`, by following
`docs/plans/2026-10-23-nuiget-ux-execution-plan.md` ("the plan"). `docs/plans/RUN-ux.md` is the full protocol for an
unattended session and `docs/plans/STATUS-ux.md` is the tracker. This section is the short form; when they disagree,
the plan and `RUN-ux.md` win. The 2.0 plan, its run protocol and its tracker are history: read them for context, never
follow or edit them.

- **Start of a session:** read `RUN-ux.md`, the tracker, and the plan's §1 to §4. Check `node --version`,
  `npm --version`, `dotnet --list-sdks` and `code-server --version`; if a tool is missing, stop and report. Never
  download a toolchain. Merge `origin/main` into `labs/ux` before the first item (`RUN-ux.md` §2).
- **One item at a time.** The next item is the tracker's `in-progress` row, otherwise its first `open` row. An
  `in-progress` item is resumed, not refused: verify its `STATUS.md` note against the tree (a note is valid only with a
  commit SHA and pasted gate output) and continue. Edit only the item's files (plan §2.1); anything else is a
  stop-and-ask.
- **Fixed order per item:** baseline gates (`npx tsc --noEmit`, `npm run check-types`, `npx eslint src`,
  `npx vitest run`) green before editing; do the item; gates again plus `npm test`, `npm run bench` and the item's own
  gate. A UI item's gate adds: the CSS lint gate green with no baseline entry left for the item's files; every `hard`
  measurement green and the item's `pending` rules flipped to `hard`; the self-regression diff within tolerance or
  explained; the `design-judge` output pasted (zero blocking findings once the plan's hardness rule is met, every
  finding fixed or ruled on before); axe 0 and the keyboard path of the interaction model's §5 walked; the Tier A
  captures of the states it touched. Then the docs duties (the CHANGELOG audience rule included); rewrite the
  directory's `STATUS.md` from the plan's §2.5 template; commit with the `git-commit` skill citing item, finding, rule
  and ADR IDs; push to `labs/ux`; wait for green CI before the next item.
- **Captures are judged by numbers.** Never certify a capture by looking at it: paste the measurement, diff and
  `design-judge` outputs. CI captures are downloaded into `captures/<run-id>/` inside the repository (gitignored; the
  one ignored path a decision may cite, by run id and sha256).
- **Never** stub a missing neighbour module, commit red, delete, skip or weaken a test the item does not name, flip a
  `pending` measurement in an item it does not name, widen a tolerance or replace a golden to make a gate pass, edit
  the judge rubric an item is judged by, author an ad-hoc workflow, push to `main`, merge a pull request, or use
  `--force`, `--admin` or `--no-verify`.
- **Frozen files:** `src/protocol/**`, `src/core/contracts.ts` and `docs/adr/**` change only in an item that names
  them, behind the `.claude/.contract-change` sentinel (D6, kept by the plan). `.claude/settings.json`,
  `.claude/settings.local.json`, `.claude/launch.json` and `.mcp.json` are never edited by a session: hand the owner a
  patch and the one command that applies it. A test file is deleted or renamed only through the `.claude/.test-retire`
  sentinel, which lists exactly the paths the item names (ADR-010).
- **Explicit consultation, two advisors.** `architecture-advisor`: every item marked ⚑, every universal stop-and-ask
  trigger (plan §2.3) and every contract item. `design-advisor`: every item marked ⚑-design and every design
  stop-and-ask trigger below. Both at every phase boundary. Launch the subagent with the plan's §2.4 brief (a design
  brief adds `RULES`, `ARTBOARD`, `CAPTURES`, `MEASUREMENTS` and `JUDGE`), paste its answer verbatim into the
  directory's `STATUS.md`, then act on it. If it answers `OWNER MUST DECIDE`, mark the item `blocked` and stop.
- **Design stop-and-ask triggers:** (1) a self-regression diff above tolerance, or a red measurement you would resolve
  by changing the test, the tolerance or the golden instead of the CSS; (2) any token added, renamed or re-valued in
  `tokens.css`; (3) any lint hit you want added to the baseline; (4) any `design-judge` finding the item will not fix;
  (5) any diff to an exported `*Props` type under `src/webview/shared/primitives/`; (6) a rule id of
  `docs/design/design-system.md` that the item's named states exercise and no helper in `src/test/ui/v2/measure.ts`
  asserts (checked by a grep of the rule id).
- **Saved workflows only.** The owner has opted in to exactly three workflows under `.claude/workflows/`:
  `design-judge`, `precommit-review` and `phase-review`. Run them by name with the `args` of `RUN-ux.md` §4, without
  asking; never author another.
- **Ambient advisor:** when an advisor is configured for the session, consult it before substantive work, when an
  error recurs, before declaring an item done, and before weakening any test.
- **Stop** when an item is blocked, when a gate is still red after two fix attempts, when the next row is the owner's
  (an owner action, a design round awaiting the owner's pick, a before/after page awaiting the owner's answer), when a
  permission prompt is denied, or after the second context compaction (land the current item first). End with the
  report format in `RUN-ux.md` §8; its last line names the next open item, the effort to start the next session at,
  and any owner action.

<!--
Target: .github/copilot-instructions.md (imported by CLAUDE.md). Applied by the UX plan's P0 protocol item. Each block
below names where it goes. The rows of the "## 2.0 gotchas" table are read by `npm run docs:check`
(scripts/check-docs-drift.mjs): every backticked path under src/, scripts/, docs/ or .github/ must exist when the row
lands, every backticked group/name must be a message of src/protocol/messages.ts, and every backticked nuiget.* name
must be in package.json. Keep the section heading "## 2.0 gotchas" unchanged: docs:check finds the table by it.
The plan's file name assumes the plan is dated 2026-10-23.
-->

## 1. Agent Guidelines: replaces the bullet "**2.0 plan in progress:**"

The old bullet names the 2.0 branch, run protocol and tracker and fails the P0 protocol item's grep gate.

```markdown
- **UX plan in progress:** `docs/plans/2026-10-23-nuiget-ux-execution-plan.md` is the execution plan for the UX overhaul, run on the `labs/ux` branch under `docs/plans/RUN-ux.md` with one tracker row per item in `docs/plans/STATUS-ux.md`. Work one item at a time, cite item, finding, rule and ADR IDs in commits, and read the plan's §1–§4 before starting. The 2.0 plan and its protocol are history. `ARCHITECTURE.md` describes the 2.0 tree; verify its claims against code before relying on them.
```

## 2. "## 2.0 gotchas" table: replaces the row "Frozen contracts"

```markdown
| Frozen contracts | `src/protocol/**`, `src/core/contracts.ts` and `docs/adr/**` change only in the items that name them, behind the `.claude/.contract-change` sentinel (D6, kept by the UX plan). The procedure: the advisor's approval pasted into `STATUS.md`; create the sentinel; edit with the Edit or Write tool only (a shell redirect or here-document goes around the guard); for a protocol change regenerate `docs/protocol.md` (`npm run docs:protocol`) and add the new keys to the records of `src/protocol/guards.ts`; delete the sentinel; then commit (`git commit` is denied while it exists). Never widen a contract to fix a type error, and never widen the guard or the frozen set to make an item easier. |
```

## 3. "## 2.0 gotchas" table: replaces the row "Missing neighbour module"

The old row names the 2.0 tracker and fails the grep gate.

```markdown
| Missing neighbour module | Never stub a module that a later item creates so `tsc` passes. Mark the item `blocked` in `docs/plans/STATUS-ux.md` and stop. |
```

## 4. "## 2.0 gotchas" table: new row after "Frozen contracts"

```markdown
| Settings files are frozen | A session never edits `.claude/settings.json`, `.claude/settings.local.json`, `.claude/launch.json` or `.mcp.json`, with or without the contract sentinel; the guard denies it (`scripts/hooks/guard.mjs`). When a gate or a tool needs a new allow rule or launch entry, write the patch to `patches/<name>.patch` with the one command that applies it, add an owner-action row to `docs/plans/STATUS-ux.md` naming it, and continue with work that does not need it (RUN-ux.md §4). A new gate runs as `node scripts/<name>.mjs` or an existing `npm run` script, never as an `npx` tool that is not pre-approved. |
```

## 5. "## 2.0 gotchas" table: new row after "Settings files are frozen"

```markdown
| Test retirement | The guard denies deleting or renaming a `*.test.ts(x)` file (`rm`, `mv`, `unlink`, `git rm`, `git mv`). A rebuild rewrites its tests in place and names the titles it replaces (ADR-010). Only when a file must go: after the `design-advisor` ruling is pasted, write the exact paths the item names, one per line, into the gitignored sentinel `.claude/.test-retire`; delete or rename exactly those paths; delete the sentinel; then commit (`git commit` is denied while it exists). Never list a path the item does not name, and never retire a test because it fails. |
```

## 6. "## 2.0 gotchas" table: new row, in the group of UI-test rows (after "A test outside the `v2` suites runs nowhere")

Lands with the P0 harness item that creates `src/test/ui/v2/measure.ts`, not before: docs:check fails for a
backticked path that does not exist yet.

```markdown
| A `pending` measurement flipped early | A rule in `src/test/ui/v2/measure.ts` is `hard` (asserted; red fails CI) or `pending: <item id>` (run and printed as `[measure] <name>: <value> (pending <item>)`, never asserted). Only the item named in the status flips it to `hard`, in its own gate; never flip a rule in another item, never set a `hard` rule back to `pending` to go green, and never change a tolerance (written once in the helper) or a golden instead of the CSS without a `design-advisor` ruling. `npm run test:ui` prints the pending list at the end of every run. A Design System rule id that an item's named states exercise and no helper asserts is a design stop-and-ask. |
```

## 7. "### CHANGELOG.md Rules": new bullet, first in the list

```markdown
- **Write for the user, not the repository.** `CHANGELOG.md` is the Marketplace's Changelog tab. An entry says what the user can now do, or what stopped going wrong, in the user's words; a change the user cannot notice gets no entry. Never name an item, finding, rule or ADR id, a source path, a module, a test or an internal name (bus, store, slice, Catalog, harness). The test for every entry: would someone who has never opened the repository understand it and care? For example, "2.0 webview message bus and store — `src/webview/shared/bus` … every request has exactly one outcome …" becomes no entry, or "Lists no longer show stale data after a change".
```

## 8. "### CHANGELOG.md Rules": replaces the bullet "Never edit or modify content under previously released version sections"

The owner's ruling of 2026-10-17 (UX brief §0): the `## [2.0.0]` section counts as unreleased until it is published.

```markdown
- Never edit or modify content under a published version's section. `## [2.0.0]` counts as unreleased until the owner publishes it and may be rewritten until then; every 1.x section stays byte-identical. Only `## [Unreleased]` and, until its publication, `## [2.0.0]` may be changed.
```

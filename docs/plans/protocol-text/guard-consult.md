<!--
Target: scripts/hooks/guard.mjs, the `CONSULT` constant (line 11 at e4d6e97). Applied by the UX plan's P0 protocol
item. guard.test.mjs asserts only that a frozen-path denial matches /architecture-advisor/, which the new text keeps.
-->

## The new `CONSULT` constant

```js
const CONSULT =
    'Launch the `architecture-advisor` subagent, or the `design-advisor` subagent for a design question, with the ' +
    "brief from the UX plan's §2.4 (docs/plans/RUN-ux.md names the plan) and paste its answer verbatim into the " +
    "directory's STATUS.md before going on.";
```

It is appended to every denial the guard gives for a reason an advisor can rule on (a frozen path, a focused or
skipped test, `--no-verify`, a force-push, a test-file deletion), so it names both advisors and leaves the choice to
the question.

## Lines that change with it in the same P0 hook item

These are not the `CONSULT` string, but the grep gate and the new mechanisms reach them:

- The file's first line, "PreToolUse guard for Claude Code sessions working on the nUIget 2.0 plan (plan §2.3, layer
  L2)", becomes "PreToolUse guard for Claude Code sessions working on the nUIget plans (plan §2.3, layer L2)".
- The sentinel denial of `git commit` ends "(plan D6)"; it stays, since the UX plan keeps D6.
- The test-file denial "Test files are never deleted or renamed unless the plan item names them." becomes "Test files
  are deleted or renamed only through the .claude/.test-retire sentinel, which lists exactly the paths the plan item
  names (ADR-010)." and gains the sentinel check: a path listed in `.claude/.test-retire` may be deleted or renamed,
  and `git commit` is denied while that file exists.
- The four settings files (`.claude/settings.json`, `.claude/settings.local.json`, `.claude/launch.json`, `.mcp.json`)
  need their own predicate, not an entry in `isFrozen`: `checkFileEdit` lets the contract sentinel unlock every
  `isFrozen` path (`isFrozen(relativePath) && !sentinelPresent`), and these files must stay denied with the sentinel
  present. Their message: "<path> is the owner's configuration. Hand the owner a patch and the one command that
  applies it; a session never edits its own permissions." The guard checks Edit, Write and Bash: a shell write into
  these files (a redirect, `sed -i`, `tee`, `cp`, `rm`, `git checkout`/`restore`), a `git apply` or `patch` without
  `--check`/`--stat` whose headers touch them, and a non-GET `gh api` are denied as well; `git add` and `git commit`
  of the owner's applied change stay allowed.

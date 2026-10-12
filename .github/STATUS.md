# STATUS — .github (agent resources and repo-level items)   commit 583ef41 (parent of the P0.5 commit)   2026-10-12T08:00:00Z

git status --short: ` M .claude/settings.json`, ` M .gitignore`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md`,
` M .github/STATUS.md`, `?? scripts/` (`scripts/hooks/guard.mjs`, `guard.test.mjs`, `index.js`); all belong to the P0.5 commit

Item: **P0.5 L2 guard hooks**. This file is the handoff note for plan items without a `src/` directory of
their own (repo-level configuration, agent resources, CI). The P0.9 note it replaces is in commit `583ef41`.

## Verified by running

```text
baseline npx tsc --noEmit   → exit 0, no output
baseline npx eslint src     → exit 0, no output
baseline npx vitest run     → Test Files 40 passed (40) · Tests 1491 passed (1491)
node --test scripts/hooks   → tests 26 · suites 6 · pass 26 · fail 0                       (item gate)
node --test "scripts/hooks/*.test.mjs" → tests 26 · pass 26 · fail 0  (same tests through the glob form)
node -e JSON.parse(.claude/settings.json) → valid; 64 allow rules and 9 deny rules unchanged; hooks.PreToolUse
                              = matcher "Edit|Write|Bash", command node "$CLAUDE_PROJECT_DIR/scripts/hooks/guard.mjs",
                              timeout 10, onFailure "block"
npx tsc --noEmit            → exit 0, no output
npx eslint src              → exit 0, no output
npx eslint scripts          → exit 0, no output (informational; scripts/ joins the lint gate in P0.7)
npm test                    → Test Files 40 passed (40) · Tests 1491 passed (1491)
npm run bench               → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npx vsce ls | grep -c '^scripts/' → 0 (.vscodeignore:6 already excludes scripts/**)
npm run package:vsix        → SKIPPED: no host, service or esbuild change (plan §2.2 step 5)
npm run test:ui             → SKIPPED: no source change; not in the plan §2.2 gate list for this item
```

Live probes in the session that installed the hook (the hook was picked up without a restart). Each line is
the tool call and the result the harness returned:

```text
1. Bash: git commit --dry-run --no-verify -m "P0.5 probe: must never be created"
   → PreToolUse:Bash hook error: nUIget guard: Commits must run their hooks; do not skip verification. Launch
     the `architecture-advisor` subagent with the brief from plan §2.4 and record its answer in the directory's
     STATUS.md before going on.
2. Write: docs/adr/zz-p05-probe.md, sentinel absent
   → PreToolUse:Write hook error: nUIget guard: docs/adr/zz-p05-probe.md is a frozen contract path (plan D6).
     It changes only in a plan item that names it, while the sentinel .claude/.contract-change exists. Launch
     the `architecture-advisor` subagent with the brief from plan §2.4 and record its answer in the directory's
     STATUS.md before going on.
3. Write: src/test/zz-p05-probe.test.ts containing a focused test
   → PreToolUse:Write hook error: nUIget guard: This change adds a focused or skipped test to
     src/test/zz-p05-probe.test.ts. Tests are never skipped or narrowed as a workaround; a platform or
     environment predicate with skipIf is allowed. Launch the `architecture-advisor` subagent ...
4. Bash: echo "P0.5" > .claude/.contract-change   → created; git check-ignore: .gitignore:55 matches it
5. Write: docs/adr/zz-p05-probe.md, sentinel present → File created successfully
6. Bash: git commit --dry-run -m "..." , sentinel present
   → PreToolUse:Bash hook error: nUIget guard: The sentinel .claude/.contract-change exists. Finish the
     contract change, delete the sentinel, then commit (plan D6).
7. Bash: rm docs/adr/zz-p05-probe.md .claude/.contract-change → git status --short docs/adr: 0 changes;
   .claude/ holds agents, rules, settings.json, skills
8. After adding onFailure "block": probe 1 repeated → same denial; ordinary commands still run
```

Probe 2 and 5 together are the item gate "editing a frozen path is blocked without the sentinel and allowed
with it". `src/core/contracts.ts` does not exist until P1.1a, so the live probe used a file under `docs/adr/`;
the unit test `denies Edit and Write to src/core/contracts.ts without the sentinel` covers that exact path.

## Done (tested)

- `scripts/hooks/guard.mjs`: `decide(input, projectDir)` plus a stdin wrapper. Rules (plan §2.3 L2):
  Edit/Write to `src/protocol/**`, `src/core/contracts.ts`, `docs/adr/**` denied unless
  `.claude/.contract-change` exists; an Edit or Write that adds a match of the regex `\.(only|skip)\(` to a
  test source denied (`skipIf` does not match); `git commit` with the skip-verification flag (long or short
  form) denied; `git push` with a force flag or a `+refspec` denied; any `git commit` denied while the
  sentinel exists; `rm`, `mv`, `unlink`, `git rm`, `git mv` of a `*.test.ts(x)` argument denied. Every denial
  names the `architecture-advisor` consultation. The guard prints a deny decision or nothing; it never
  prints an allow decision.
- `scripts/hooks/guard.test.mjs`: 26 `node:test` cases, including the spawned-process contract.
- `.claude/settings.json`: one `PreToolUse` entry; permissions untouched.
- `.gitignore`: `.claude/.contract-change`.

## Done (untested)

- Windows: the path handling normalises separators and the suite has no platform-specific assertion, but it
  has run on macOS only. CI gains a Windows leg in P0.8.

## Not started

- P0.6: build switch (`esbuild.mjs --v2`, placeholders, launch configuration).

## Deviations from contract/ADR (file:line each)

- `scripts/hooks/guard.mjs:17,39`: the focus/skip rule applies to test sources only (`*.test.*`, `*.spec.*`,
  `*.bench.*`, `src/test/**`), not repository-wide as the item text can be read. A production call such as
  `reader.skip(4)` would otherwise be denied. The test `ignores files that are not tests` records the choice.
- `scripts/hooks/index.js`: not named by the item. Node 22 and newer load a directory argument of `--test` as
  a module instead of scanning it, so the literal gate command `node --test scripts/hooks` fails without an
  entry file. The two-line file imports the test module; the glob form runs the same 26 tests.
- `scripts/hooks/guard.test.mjs` uses `node:test`, as the item's gate requires, although
  `.github/instructions/nodejs-javascript-vitest.instructions.md` says to use Vitest. Vitest's backend
  project does not include `scripts/`.
- `.claude/settings.json:94`: `onFailure: "block"`. If `node` leaves the hook's PATH, or the script is missing
  on a checkout that has this settings file, every Edit, Write and Bash call is refused until the owner
  fixes PATH or the settings. This is intended: an unguarded session is worse than a stopped one.
- Known holes, not fixed (candidates for the P0.13 ledger):
  - Shell rewrites of frozen paths pass: the guard sees Edit and Write, not `python3 - <<EOF`, `sed -i`, `cp`
    or redirection. This session used that pattern for ADR-000 in P0.9, before the hook existed.
  - `git rm -r src/protocol` and similar directory removals pass; only `*.test.ts(x)` arguments are checked.
  - `*.test.mjs` (the guard's own test) is not in the delete/rename pattern.
  - A flag hidden inside quotes or a variable is not seen. The guard stops an honest shortcut, it is not a
    security boundary.
- GitHub Copilot has no equivalent: hooks are a Claude Code mechanism, so the L2 layer exists only there.

## Advisor decisions (date, item, question, answer verbatim)

No stop-and-ask trigger fired and the item is not ⚑, so the L1 `architecture-advisor` was not consulted. The
ambient session advisor (plan §2.3 L3) was consulted twice; its replies are not available as quotable text, so
the decisions taken are recorded:

- 2026-10-12, P0.5, design before writing → pure `decide()` with a thin wrapper; deny as
  `hookSpecificOutput.permissionDecision: "deny"` with exit 0 and never an allow decision; resolve paths
  against `CLAUDE_PROJECT_DIR`; build test fixtures by concatenation so the guard does not block its own test
  file; leave the settings change for last because the P0.4 allowlist change had to be committed by the owner.
- 2026-10-12, P0.5, after the live probes → set `onFailure: "block"` now that `node` is proven to resolve in the
  hook's shell, and repeat one probe; record the scope of the focus/skip rule, the entry file and the known
  holes as deviations; keep the handoff note in `.github/STATUS.md`.

## Exact next step (one item ID)

P0.6

# STATUS — src/core/session (and src/core/queries/scopes.ts)   commit 2f903e7 (parent of the P1.7 commit)   2026-10-12T13:52:22Z

git status --short src/core/session src/core/queries src/core/contracts.ts: `?? src/core/session/`,
`?? src/core/queries/`, ` M src/core/contracts.ts` (all belong to the P1.7 commit, together with
` M CHANGELOG.md`, ` M ARCHITECTURE.md`, ` M docs/plans/STATUS.md` and ` M docs/plans/findings-ledger.md`)

Item: **P1.7 `src/core/session/**` and `src/core/queries/scopes.ts`**. This note also covers `scopes.ts` and its
test; the directory `src/core/queries` gets its own note in P1.8, when `QueryCoordinator` arrives.

The quarry has one note for this area, `src/core/queries/STATUS.md` ("state core"). Checked against its tree:
its claims for the session store (30 tests) and for `scopes.ts` (29 cases) hold; it says `tsc` and ESLint
were not run again after the last edits, and `QueryCoordinator.ts` has uncommitted changes and no test, which
is P1.8's concern. The quarry's `src/core/queries/index.ts` and `QueryCoordinator.ts` were not copied.

## Verified by running

```text
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0, no output
baseline npx vitest run      → Test Files 58 passed (58) · Tests 1923 passed | 1 skipped (1924)
copy from the quarry tree    → cmp: five files identical to the quarry working tree (SessionStore.ts,
                               SessionStore.test.ts, session/index.ts, scopes.ts, scopes.test.ts)
unmodified copy              → npm run check-types exit 2: scopes.test.ts(12,27) error TS2554, Expected 1
                               arguments, but got 0 (resourceKeys.sources() without the project directory
                               that P1.1b made required) · npx eslint exit 0 · Tests 59 passed (59)
The gates below ran with DOTNET_ROOT set to the SDK directory and NUIGET_SDK_TESTS=1 (N48).
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output
npm run lint                 → exit 0
npx vitest run --project backend src/core/session src/core/queries → Test Files 2 passed (2) ·
                               Tests 62 passed (62)                                         (item gate, ≥ 59)
npm test                     → Test Files 60 passed (60) · Tests 1986 passed (1986)
npx vitest run --coverage    → exit 0 · All files 74.96 % statements, 64.57 % branches, 70.08 % functions,
                               76.51 % lines · src/core/session 100 % lines · src/core/queries 100 % lines ·
                               src/core/** 1093 of 1108 lines, 98.65 % (floor 85 %)
npm run docs:protocol:check  → exit 0; docs/protocol.md unchanged
npm run bench                → Test Files 16 passed (16) · Tests 101 passed | 1 skipped (102)
npm run package:vsix         → exit 0 · Tests 1985 passed | 1 skipped (that script ran without
                               NUIGET_SDK_TESTS) · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 528.51 KB)
npm run check:vsix           → check:vsix: OK
contract diff                → git diff -- src/core/contracts.ts, lines that are not comment lines: none
grep "called by the coordinator" src/core/contracts.ts → no match
grep Thenable, vscode, child_process in the copied code files → no match
ls .claude/.contract-change  → No such file or directory (removed right after the one contract edit)
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P1.7
```

## Done (tested)

- `src/core/session/SessionStore.ts` and `index.ts`: `DefaultSessionStore`, `isAllProjects`, `firstProject`,
  `SESSION_STORAGE_KEYS`, `SESSION_DEFAULTS`. Unchanged except for the JSDoc on `reconcile`. 30 tests.
- `src/core/queries/scopes.ts`: `scopeMatchesKey(scope, key, platform = process.platform)` and `mergeScopes`.
  Project paths are compared after `normalizeProjectPath` (`scopes.ts:65-76`); scopes and keys keep the paths
  they were given. 32 cases in `scopes.test.ts`: the 29 of the quarry and three new tests,
  `matchesProjectPaths: win32 paths differing in case and separators match`,
  `normalizes redundant separators and dot segments on every platform` and
  `reaches the source list of every project directory through the sources scope only`.
- The two tables of ADR-002 are asserted row by row by the quarry's tests: the five scope rows in
  `describe('scopeMatchesKey')`, the merge rows in the `it.each` table of `describe('mergeScopes')`, and
  `never reaches fewer keys than either input (union property)`. No row was missing.

## Done (untested)

- `src/core/contracts.ts:66-72`: the JSDoc of `SessionStore.reconcile`. A comment; the file is excluded from
  coverage.
- Nothing calls the session store or `scopes.ts` yet: `QueryCoordinator` (P1.8) and the composition root
  (P2.10) are the first users.

## Not started

- `src/core/queries/index.ts` and `QueryCoordinator.ts` with its test: P1.8, which also needs its own approval
  and sentinel for `InvalidationEvent` (tracker row of P1.8).
- The host that calls `reconcile`: P2.10. The tracker row of P2.10 carries the note from the ruling below.

## Deviations from contract/ADR (file:line each)

- `src/core/contracts.ts:66-72` changed under the advisor approval below (decision D6). The approval was
  pasted into `docs/plans/STATUS.md` first, the sentinel created after it with the content `P1.7`, and removed
  as soon as that one edit was made. No signature and no other line of the file changed.
- `src/core/queries/scopes.test.ts:12`: `resourceKeys.sources()` became `resourceKeys.sources('/ws/app')`. The
  quarry test passed at runtime with the key `sources:undefined`; the type checker of the 2.0 test program
  found it. Its assertions are unchanged.
- The ruling's example writes a scope as `{ kind: 'project', paths: [...] }`. The field of the frozen
  `InvalidationScope` is `projectPaths`; the code and the tests use that.
- The ruling describes `matchesProjectPaths(projectPaths, path, platform)`. The function of the quarry takes
  the parsed key, not a path; it keeps that shape and gained `platform` as its third parameter.
- `mergeScopes` removes duplicate paths by exact text (`scopes.ts:116-118`, `unionPaths`). Two spellings of
  one Windows path can therefore both stay in a merged scope. Matching normalizes, so the result is the same;
  stored paths are not normalized, as the ruling says.
- Not changed, not named by the item: `DefaultSessionStore` compares the selected project with the project
  list by exact text (`SessionStore.ts:127`). Both values come from discovery or from the store's own state.
- `CHANGELOG.md`: one headline under `### Changed`, as the ruling says; the earlier items of this phase used
  `### Added`.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-12, P1.7, stop-and-ask before any edit (recorded first in `docs/plans/STATUS.md`). Question: the item
asks for a "contract note that the host calls `reconcile` on project change", while the frozen contract said
"called by the coordinator" and P1.7 is not marked as a sentinel item; where does the note go, with the exact
text, and how should `scopeMatchesKey` take the platform? Answer, verbatim:

```text
DECISION: Option 3, narrowed: the JSDoc at `src/core/contracts.ts:66` is replaced under this answer as the recorded advisor approval (sentinel content `P1.7`, no signature change, no other line of the file), and `DefaultSessionStore.reconcile` gets a two-sentence implementation JSDoc that points at the contract instead of repeating the caller rule. ADR-001 is not touched. `scopeMatchesKey(scope, key, platform = process.platform)` is right; thread `platform` into `matchesProjectPaths` and normalize both sides of the comparison only.

WHY: The brief is correct about the tree: `src/core/contracts.ts:66` reads "(called by the coordinator)", `docs/adr/001-session-store.md:35` says `reconcile(projects, sources)` "runs whenever the project or source list changes", the P2.10 row (plan line 234) puts "`session.reconcile` on project change" in the composition root, nothing under `src/` or `docs/` names the coordinator as a caller, and no frozen file has changed since P1.1b (`git log dd1ed73..HEAD -- src/core/contracts.ts src/protocol docs/adr` is empty). The row's words "contract note" name the contract: in this plan "contract" is `src/core/contracts.ts` (D6, plan line 50; RUN.md:75), so P1.7 is an item that names the file under D6's operative clause "change only in the items that name them", and the P0 phase review (docs/plans/STATUS.md:141,146-148) already ruled that D6's parenthetical list is not exhaustive and that an advisor answer pasted into `docs/plans/STATUS.md` is the recorded approval under the alternative clause; the P1.8 tracker row (docs/plans/STATUS.md:33) is the precedent for an item that edits `contracts.ts` under its own approval and sentinel without being listed in D6. Leaving the stale words would cost more than fixing them: P1.8 copies `QueryCoordinator.ts` next and P2.10 wires the root; whichever reads "(called by the coordinator)" hits the ADR-mismatch trigger again and needs another sentinel, which is the P1.1b review's own argument (docs/plans/STATUS.md:341) and the advisor file's tiebreak (least work lost). The note also carries the contract side of C-state-core-5 ("source validation against previous project", findings-ledger.md:383, assigned to P1.7): the quarry's store validates the selected source against the last reconciled list (`SessionStore.ts:52-56,61-63`), and because sources resolve per project directory (ADR-005; `SourceProvider.listSources(projectDir)`, `contracts.ts:272-273`; `resourceKeys.sources(projectDir)`), a change of the selected project is a change of the enabled source list, which is why the host must reconcile on project change; the JSDoc states that reasoning explicitly rather than asserting a selection rule ADR-001 does not literally contain. The optional `platform` parameter follows `src/core/util/paths.ts:13,19,33`, leaves every existing call of `scopeMatchesKey(scope, key)` valid (P1.8's copy of `QueryCoordinator.ts` needs no edit), and does not touch `InvalidationScope` or `ResourceKey` in `src/protocol/domain.ts` or the two tables ADR-002 says `scopes.ts` must equal.

DO:
1. Paste this answer verbatim under `## Advisor decisions` in `docs/plans/STATUS.md` as `### P1.7 — stop-and-ask: contract note on reconcile (2026-10-12)`, set the P1.7 tracker row to `in-progress`, and add this note to the row: "`src/core/contracts.ts:66`: the JSDoc of `SessionStore.reconcile` is corrected under the advisor approval of 2026-10-12 (sentinel `P1.7`); no signature changes." Order per N42 (docs/plans/STATUS.md:160-162): tracker first, sentinel second. `src/core/session/STATUS.md` is not a frozen path, so it may be written at any point; paste this answer there too.
2. Create `.claude/.contract-change` with content exactly `P1.7` (the guard tests existence only, `scripts/hooks/guard.mjs:9,205`; the file is gitignored, `.gitignore:55`).
3. Copy `src/core/session/**` and `src/core/queries/scopes.ts` (+ both test files) from the quarry working tree with `cp`, record `cmp` results in the session `STATUS.md`, and run the baseline gates on the unmodified copy as P1.6 did.
4. In `src/core/contracts.ts`, replace line 66 only. Current text:
       /** Re-validate the snapshot against the current project/source lists (called by the coordinator). */
   Replacement (same four-space indentation; the signature on the next line is unchanged):
       /**
        * Re-validate the snapshot against the current project list and enabled source URLs, with the
        * normalization described on `apply`, and commit the result with origin `'host'` (ADR-001). The host
        * calls it (composition root, plan item P2.10) whenever the project list or the source list changes;
        * because sources resolve per project directory (ADR-005), a change of the selected project is a
        * source-list change too. The `QueryCoordinator` never calls it.
        */
5. In `src/core/session/SessionStore.ts`, above `reconcile(` (quarry line 96), add:
       /**
        * Replace the known project and enabled-source lists, then re-normalize the current snapshot and
        * commit it as a host-originated change. Who calls it, and when, is stated on `SessionStore.reconcile`.
        */
   Leave the class comment (quarry :52-56) and the `knownProjects` comment (:61) as they are.
6. In `src/core/queries/scopes.ts`: `import { normalizeProjectPath, type PlatformId } from '../util/paths';` `matchesProjectPaths(projectPaths, path, platform: PlatformId = process.platform)` compares `normalizeProjectPath(p, platform)` of every entry against `normalizeProjectPath(path, platform)`; `scopeMatchesKey(scope, key, platform: PlatformId = process.platform)` passes `platform` through to every `matchesProjectPaths` call. JSDoc for the new parameter, on `scopeMatchesKey`: `/** `platform` selects the path rules for comparing project paths (default `process.platform`); tests pass it explicitly. */` Do not rewrite `scope.paths` or the key: normalize for the comparison only (`paths.ts:11`: "Use the result as a map key, never for I/O"; the scope travels in `resources/invalidated`).
7. Add to `scopes.test.ts` a test titled `matchesProjectPaths: win32 paths differing in case and separators match` that calls `scopeMatchesKey({ kind: 'project', paths: ['C:\\Src\\App\\App.csproj'] }, resourceKeys.installed('c:/src/app/App.csproj'), 'win32')` → true, the same pair with `'linux'` → false, and the `package` scope through the same path. Keep the quarry's 59 tests; the item gate becomes ≥ 60. Confirm one scopes test asserts every row of both ADR-002 tables (docs/adr/002-query-coordinator.md:22-28,35-45); if a row has no case, add it (that closes C-state-core-3).
8. One check, no widening: if the merge function dedupes `paths` with a raw-string `Set`, record it under "Deviations" as non-blocking (matching normalizes, so duplicates differing only in case or separators are harmless); do not normalize stored paths.
9. Gates: `npm run check-types` → 0; `npx eslint src` → 0; `npx vitest run --project backend src/core/session src/core/queries` → ≥ 60 passed; `npm test`; `npm run bench`; `npm run docs:protocol:check` → 0 with `docs/protocol.md` unchanged (the generator reads only `src/protocol/messages.ts`, `scripts/gen-protocol-docs.mjs:10`); `npx vitest run --coverage` → `src/core/**` ≥ 85 % lines (`contracts.ts` is excluded from coverage, so the comment has no effect).
10. Docs duties: CHANGELOG `[Unreleased]` `### Changed` headline only; ARCHITECTURE.md 2.0 section module-map rows for `core/session` and `core/queries/scopes`; ledger: C-state-core-3 → `closed (P1.7)`, C-state-core-4 → `closed (P1.7)`, C-state-core-5 → `open; contract side done in P1.7 (`SessionStore.reconcile` JSDoc), closes at P2.10 when the composition root reconciles after a project change`; add a P2.10 tracker note: "reconcile with the newly selected project's enabled source URLs immediately after the `selectedProject` intent is applied (C-state-core-5); the intermediate broadcast between `apply` and `reconcile` is acceptable only if the harness scenario in P2.11 shows both surfaces converge".
11. Rewrite `src/core/session/STATUS.md` per plan §2.5 (the queries directory gets its note at P1.8; say so under "Exact next step"). Then `rm .claude/.contract-change` (the guard denies `git commit` while it exists, `guard.mjs:155-165`), commit with the `git-commit` skill citing P1.7, D6, ADR-001, ADR-002, ADR-005, C-state-core-3, C-state-core-4, C-state-core-5, push to `labs/2.0`, wait for green CI.

DO NOT:
- Do not change the signature of `reconcile`, add a member, or touch any other line of `src/core/contracts.ts`; `InvalidationEvent` (`:132-138`) is P1.8's edit under its own approval.
- Do not edit `docs/adr/001-session-store.md` or any `docs/adr/**` file; ADR-001:35 is already consistent with the note.
- Do not change `InvalidationScope`, `ResourceKey` or `resourceKeys` in `src/protocol/domain.ts`.
- Do not create the sentinel before step 1 is done, and do not run `git commit` while it exists.
- Do not put the caller rule only in `SessionStore.ts` and leave the contract saying the coordinator calls it.
- Do not normalize paths stored in a scope or a key, and do not make `matchesProjectPaths` read `process.platform` inside the test; pass `'win32'` explicitly.
- Do not add a `reconcile` call to `QueryCoordinator.ts` in P1.8 to make the old comment true.
- Do not block the item for the owner: nothing in the row is a scope, release or publishing decision.

CONTRACT CHANGE: `src/core/contracts.ts` line 66 (JSDoc of `SessionStore.reconcile`) only, in item P1.7, sentinel `.claude/.contract-change` with content `P1.7`, this answer being the recorded approval once pasted into `docs/plans/STATUS.md`. No change to `src/protocol/**`, `docs/adr/**` or `docs/protocol.md`. Non-frozen files of the item: `src/core/session/**`, `src/core/queries/scopes.ts`, `src/core/queries/scopes.test.ts`, `src/core/session/STATUS.md`, `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`, `CHANGELOG.md`, `ARCHITECTURE.md` (2.0 section).

VERIFY:
- `grep -n "called by the coordinator" src/core/contracts.ts` → no output; `grep -c 'The `QueryCoordinator` never calls it' src/core/contracts.ts` → 1.
- `git diff e080e1f HEAD -- src/core/contracts.ts | grep -E '^[-+]' | grep -vE '^(\+\+\+|---)' | grep -vE '^[-+]\s*(/\*\*|\*|\*/)'` → empty (only comment lines changed); `git diff e080e1f HEAD --stat -- docs/adr src/protocol docs/protocol.md` → empty.
- `ls .claude/.contract-change` → "No such file or directory" at commit time; `git status --short` → clean after the commit.
- `npx vitest run --project backend src/core/session src/core/queries` → ≥ 60 passed, 0 failed, and the run lists `matchesProjectPaths: win32 paths differing in case and separators match`.
- `npm run check-types` → 0; `npx eslint src` → 0; `npm test` green; `npm run bench` green; `npm run docs:protocol:check` → 0.
- `grep -n "C-state-core-[345]" docs/plans/findings-ledger.md` shows the three statuses of step 10; the P1.7 and P2.10 tracker rows carry the notes of steps 1 and 10; CI on `labs/2.0` green.

Files checked: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; `/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` lines 41-159 (D1-D13, §2, §3), 207-219 (P1 rows), 234 (P2.10), 424-436 (Appendix B); `/Users/mattias/github/nuiget/src/core/contracts.ts` (whole file; `:54-68`, `:132-138`, `:272-273`); `/Users/mattias/github/nuiget/docs/adr/001-session-store.md`; `/Users/mattias/github/nuiget/docs/adr/002-query-coordinator.md`; `/Users/mattias/github/nuiget/src/core/util/paths.ts`; `/Users/mattias/github/nuiget/docs/plans/STATUS.md` lines 25-33, 141-162, 325-377; `/Users/mattias/github/nuiget/docs/plans/findings-ledger.md` lines 128, 144, 342, 358, 370-390; `/Users/mattias/github/nuiget/docs/plans/RUN.md` lines 68-82; `/Users/mattias/github/nuiget/scripts/hooks/guard.mjs` lines 9, 30-40, 155-170, 200-215; `/Users/mattias/github/nuiget/scripts/gen-protocol-docs.mjs` lines 2, 10; `/Users/mattias/github/nuiget/src/core/cli/STATUS.md`; `.gitignore:54-55`. Commands: `git status --short` (clean), `git log --oneline -3` (head e080e1f), `git log dd1ed73..HEAD -- src/core/contracts.ts src/protocol docs/adr` (empty), `git worktree list`, grep for `reconcile` across `src`, `docs`, `.github`, `.claude`. Not run: any gate (inspection only). The quarry excerpts were taken from the brief, as the subagent cannot read the quarry worktree.
```

Acted on: steps 1 to 11, with the two adaptations listed under "Deviations" (the field name `projectPaths`,
the shape of `matchesProjectPaths`).

## Exact next step (one item ID)

P1.8 (⚑ `QueryCoordinator.ts` and its test; launch the `architecture-advisor` before writing code, and get a
recorded approval before the sentinel for `InvalidationEvent`). `src/core/queries` gets its own handoff note
in that item.

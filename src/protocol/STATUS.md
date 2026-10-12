# STATUS — src/protocol (and src/core/contracts.ts)   commit 7d407df (parent of the P1.1a commit)   2026-10-12T11:05:34Z

git status --short src/protocol src/core/contracts.ts scripts/gen-protocol-docs.mjs docs/protocol.md:
`?? docs/protocol.md`, `?? scripts/gen-protocol-docs.mjs`, `?? src/core/contracts.ts`, `?? src/protocol/`
(all belong to the P1.1a commit, together with ` M package.json`, ` M .github/workflows/ci.yml`,
` M CHANGELOG.md`, ` M ARCHITECTURE.md`, ` M .github/copilot-instructions.md`, ` M docs/plans/STATUS.md` and
` M docs/plans/findings-ledger.md`)

Item: **P1.1a Protocol salvage**. This note also covers `src/core/contracts.ts`, which has no directory of its
own; `src/core/cli/STATUS.md` is the note of P0.0 and is unchanged.

The quarry has no `STATUS.md` for `src/protocol`; there was no stale note to verify. The quarry tree was read
instead: `src/protocol/` holds six files, `domain.ts` carries uncommitted edits (`InstalledPackage.definedIn`;
`OperationProgress.kind`, `projectPaths`, `packageIds`), and `docs/protocol.md` and
`scripts/gen-protocol-docs.mjs` are untracked there.

## Verified by running

```text
baseline npx tsc --noEmit    → exit 0, no output
baseline npx eslint src      → exit 0, no output
baseline npx vitest run      → Test Files 44 passed (44) · Tests 1591 passed (1591)
copy from the quarry tree    → cmp: all nine files identical to the quarry working tree
unmodified copy              → npm run check-types exit 0 · eslint exit 0 · 7 tests passed ·
                               node scripts/gen-protocol-docs.mjs --check: up to date
npx tsc --noEmit             → exit 0, no output
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output
npm run lint                 → exit 0 (covers scripts/gen-protocol-docs.mjs)
npx vitest run --project backend src/protocol → Test Files 1 passed (1) · Tests 7 passed (7)      (item gate)
npm test                     → Test Files 45 passed (45) · Tests 1598 passed (1598)
npx vitest run --coverage    → exit 0 · All files 71.92 % statements, 60.53 % branches, 65.71 % functions,
                               73.5 % lines (src/protocol/** and src/core/contracts.ts are excluded, P0.11)
npm run bench                → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npm run docs:protocol        → wrote docs/protocol.md; cmp with the quarry copy: identical
npm run docs:protocol:check  → docs:protocol:check — docs/protocol.md is up to date. exit 0        (item gate)
node esbuild.mjs --production && npm run check:vsix → check:vsix: OK · npx vsce ls lists 15 files
exhaustiveness, negative     → scratch copy of guards.ts without 'perf/mark': error TS1360, Property
                               '"perf/mark"' is missing; with an extra 'perf/nope': error TS2353, does not
                               exist in type 'Record<keyof RequestMap, true>'; unchanged copy: exit 0
grep -rn Thenable src/core src/protocol → no match
grep for vscode, react, legacy imports and Node 20+ APIs in the copied files → no match
grep -rln child_process src/core → no match
npm run package:vsix         → exit 0 · Test Files 45 passed (45) · Tests 1598 passed (1598) ·
                               DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 528.06 KB); check:vsix: OK
guard, live                  → Edit of src/protocol/STATUS.md without the sentinel: denied (N42)
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P1.1a
```

## Done (tested)

- `src/protocol/{domain,envelope,guards,messages,index}.ts` and `protocol.test.ts`, copied from the quarry
  working tree. 7 tests: envelope factories, request ids, `ProtocolRequestError`, and the guards in both
  directions.
- `REQUEST_TYPES` and `EVENT_TYPES` in `guards.ts` are built from records checked with
  `satisfies Record<RequestType, true>` and `satisfies Record<EventType, true>`. The compiler rejects a missing
  and an unknown key (probes above). The exported names, their types and their order are unchanged. Closes
  C-protocol-host-2.
- `scripts/gen-protocol-docs.mjs`, `docs/protocol.md` (42 requests, 11 events), scripts `docs:protocol` and
  `docs:protocol:check` in `package.json`, and the step "Check the protocol reference" in the Lint job of
  `.github/workflows/ci.yml`. Closes C-protocol-host-6.

## Done (untested)

- `src/core/contracts.ts`, copied from the quarry working tree, with `KeyValueStore.update` returning
  `PromiseLike<void>` instead of `Thenable<void>`. It contains interfaces and one class, `StaleQueryError`,
  which has no test until `QueryCoordinator` arrives (P1.8). Nothing imports the file yet; `tsc` is its only
  check.
- The exhaustiveness of the type lists has no unit test: it is a compile-time property, checked by `tsc` in
  every gate run. The negative probes above were run once, by hand, on scratch copies.

## Not started

- Every contract change of P1.1b: `OperationQueue.onProgress`, `rejected(reason, opId)`, `ProjectMutator`,
  `resourceKeys.sources(cwd)`, `readme/image`, `sourcesUnavailable` on `search/query`, `generation?` on
  resource responses, the `sourceUrl` naming rule, the new `SdkInfo` (it still has `nounFirstSyntax`),
  `DotnetRunOptions.env` wording, `AddPackageOptions.isCpm`, the `sdk-too-old` reason, and the ADR amendments.
- C-protocol-host-1, -3, -4 and -5 (composition root, `runOperation`, `forceRestore`, handler tests) belong to
  P2.9 and P2.10.

## Deviations from contract/ADR (file:line each)

- None in the contracts: apart from the two edits the item names (`src/protocol/guards.ts:12-43`,
  `src/core/contracts.ts:30`), the copied files are byte-identical to the quarry working tree.
- `.github/workflows/ci.yml:77-79`: the plan does not say which job gets the drift check. It is in the Lint
  job, which already installs dependencies and is a required status check.
- `.github/copilot-instructions.md` (2.0 gotchas): one new row, "`docs/protocol.md` edited by hand". It is a
  docs duty of plan §2.2 step 6, not a file the item row names.
- `docs/plans/findings-ledger.md`: N26 widened, N38 to N42 added, C-protocol-host-2 and -6 closed, unit test
  count updated. The P0 phase review asked for N38 and the N26 check in this commit.
- Guidance that is now loose, not edited here: the gotcha row "Extension host is Node 18.15" and
  `.github/instructions/core-boundaries.instructions.md` say "`Thenable` appears only in `contracts.ts`".
  After this item it appears nowhere under `src/core` or `src/protocol`. P7.5 reviews the rows.
- `src/core/contracts.ts:185-192`: `SdkInfo` still declares `nounFirstSyntax`, which contradicts D13. P1.1b
  replaces it; this item may not ("No other contract changes in this item").
- `src/protocol/guards.ts:41,43`: `Object.keys(...) as RequestType[]` (and `as EventType[]`) are type
  assertions, which `.github/instructions/typescript.instructions.md` says to avoid. `Object.keys` returns
  `string[]`, so there is no form without one. They are sound because the records are object literals checked
  with `satisfies`, which rejects missing and extra keys.
- This note lies in a frozen path: the guard denies an edit of `src/protocol/STATUS.md` while the sentinel is
  absent (N42). The sentinel was deleted once the code was final, then created again for the last edits of
  this note and deleted before the commit. An item without contract authority cannot rewrite this note; it
  records in `docs/plans/STATUS.md` instead.
- A scratch directory `src/_wip/probe` was created and removed during the negative probes before they were
  moved to the session scratchpad. `src/_wip` did not exist before and does not exist now.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-12, P1.1a, asked in the brief `PHASE REVIEW P0` (the full answer is in `docs/plans/STATUS.md` under
"Phase gates"). Question: decision D6 does not list P1.1a among the items that may change contracts, but the
item row names `src/protocol/**` and `src/core/contracts.ts` and says "sentinel required"; is the row
sufficient authority to create `.claude/.contract-change` with content `P1.1a`? Answer, verbatim:

```text
QUESTION 2 (P1.1a sentinel): your reading is right, on two independent grounds, and this review is the recorded advisor approval for the P1.1a sentinel under either reading.
- Ground 1: D6's operative clause is "change only in the items that name them"; the P1.1a row (plan line 207) names `src/protocol/**` and `src/core/contracts.ts`, is titled "Protocol salvage (sentinel required)", and itself specifies two contract edits (`satisfies Record<…, true>` on `REQUEST_TYPES`/`EVENT_TYPES`; `PromiseLike` replaces `Thenable` in `contracts.ts`). P0.8's row defers the `docs:protocol:check` CI step to P1.1a and the P0.4 tracker row expects the `docs:protocol*` scripts from P1.1a, so the plan treats P1.1a as the item that creates the protocol. The parenthetical list in D6 is demonstrably incomplete (non-blocking 3), so its omission of P1.1a carries no weight.
- Ground 2: D6's alternative clause "an advisor-approved contract-change item … creates the sentinel after the advisor's recorded approval" is satisfied once this answer is pasted into `docs/plans/STATUS.md`; copy the two paragraphs above into `src/protocol/STATUS.md` under "Advisor decisions" as well.
Mechanics for P1.1a: set the tracker row `in-progress`; create `.claude/.contract-change` with content exactly `P1.1a` (the hook tests existence only, `guard.mjs:205`); it is gitignored (`.gitignore:55`), so `git status --short` stays clean. Scope is only what the row lists: the copy, the two named contract edits, `scripts/gen-protocol-docs.mjs`, `docs/protocol.md`, the two `package.json` scripts, the `ci.yml` step; "No other contract changes in this item" is literal. If the quarry's `contracts.ts` or `src/protocol/**` imports a core module that a later item creates (P1.2 util, P1.7 session, and so on), the item is blocked, never stubbed and never trimmed; paste the quarry's import lines into the brief if that happens. Delete the sentinel before committing: `guard.mjs:159-165` denies every `git commit` while it exists. Copying from the quarry with Bash `cp` is not intercepted by the guard (N26), so the copy succeeds even without the sentinel; the sentinel is still required by D6 and the commit denial enforces the end state. Expect `npm run lint` to cover the new script (`lint` script lints `scripts/`), `npx vitest run --project backend src/protocol` to pick up `src/protocol/**/*.test.ts` (`vitest.config.mts` backend include), `npm run check-types` to type-check those tests (`tsconfig.vitest.json` include) and the sources against Node 18 (`tsconfig.json` `typeRoots`/`@types-host/node`), and `npm run check:vsix` to pass (`scripts/**` and `docs/**` are in `.vscodeignore`).
```

The sentinel was created after that answer was committed (`7d407df`) and deleted before the P1.1a commit. The
quarry files import nothing outside `src/protocol` (`contracts.ts` imports `../protocol/domain` only), so no
neighbour was missing. No stop-and-ask trigger fired during the item.

## Exact next step (one item ID)

P1.1b (⚑: launch the `architecture-advisor` subagent with the plan §2.4 brief before any contract edit).
Record its answer in `docs/plans/STATUS.md` first, create the sentinel after that, and only then copy the
answer into this note (N42).

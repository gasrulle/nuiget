# STATUS — src/core/util   commit dd1ed73 (parent of the P1.2 commit)   2026-10-12T11:58:23Z

git status --short src/core/util vitest.config.mts: `?? src/core/util/`, ` M vitest.config.mts` (both belong to
the P1.2 commit, together with ` M CHANGELOG.md`, ` M ARCHITECTURE.md`, ` M docs/plans/STATUS.md` and
` M docs/plans/findings-ledger.md`)

Item: **P1.2 `src/core/util/**`**. The quarry has no `STATUS.md` for this directory, so there was no note to
verify; the quarry tree was read instead. It holds five modules and five test files, all committed in `f837f34`
and unchanged since (`git status --short -- src/core/util` in the quarry is empty).

## Verified by running

```text
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0, no output
baseline npx vitest run      → Test Files 45 passed (45) · Tests 1602 passed (1602)
copy from the quarry tree    → cmp: all ten files identical to the quarry working tree
unmodified copy              → npm run check-types exit 0 · 47 tests passed · npx eslint src/core/util:
                               concurrency.ts 79:25 error "The value assigned to 'matched' is not used in
                               subsequent statements" (no-useless-assignment), 1 problem
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output                                                    (item gate)
npm run lint                 → exit 0
npx vitest run --project backend src/core/util → Test Files 5 passed (5) · Tests 49 passed (49)   (item gate)
npm test                     → Test Files 50 passed (50) · Tests 1651 passed (1651)
npx vitest run --coverage    → exit 0 · All files 72.34 % statements, 60.89 % branches, 66.23 % functions,
                               73.93 % lines · src/core/util 99.28 % statements, 92 % branches,
                               100 % functions, 99.27 % lines                                       (item gate)
coverage floor, negative     → with 'src/core/**' lines set to 100: exit 1, "ERROR: Coverage for lines
                               (99.27%) does not meet "src/core/**" threshold (100%)"; restored to 85
npm run bench                → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npm run package:vsix         → exit 0 · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 528.18 KB)
npm run check:vsix           → check:vsix: OK
grep Thenable, vscode, child_process in src/core/util → no match
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P1.2 (the Windows job runs paths.test.ts and fs.test.ts
                               for the first time)
```

## Done (tested)

- `events.ts`: `toDisposable`, `Emitter<T>` (a listener that throws is reported and does not stop the others).
  7 tests.
- `concurrency.ts`: `batchedPromiseAll` (bounded sliding window, results in input order) and `raceFirst`
  (first value that satisfies a predicate; never rejects). 12 tests. Line 79: `let matched: boolean;` instead
  of `let matched = false;`, the fix the item names; the existing test
  `treats a throwing predicate as non-matching instead of rejecting` covers both branches.
- `fs.ts`: `fileExists`, `readTextIfExists`, `findUp` (with an inclusive stop directory). 11 tests.
- `paths.ts`: `normalizeProjectPath`, `isPathInside`, `fromMsBuildPath`, each with an injectable platform.
  10 tests.
- `topo.ts`: `topologicalSortByDependency`. 9 tests: the 7 of the quarry and 2 ported from
  `src/services/NuGetUtils.test.ts:887-925`, `returns an empty array for no items` and
  `orders a diamond so the shared dependency comes first and the dependent last`.
- `vitest.config.mts`: coverage floor of 85 % of the lines for `src/core/**`, proven to fail when it is not met.

## Done (untested)

- Nothing imports these modules yet. Their first consumers are P1.4 (cache), P1.6 (cli), P1.7 (session and
  scopes) and P1.8 (`QueryCoordinator`).
- The tests have run on macOS only. `paths.test.ts` passes the platform explicitly; `fs.test.ts` uses real
  temporary directories. The Windows job of CI is the first run there.

## Not started

- No `index.ts`: the item does not name one, and the quarry has none. Consumers import the module files.
- No bench for this directory: the item names none (P1.3 and P1.4 have theirs; see N40 for where bench files
  must live).

## Deviations from contract/ADR (file:line each)

- None. The modules import `Disposable`, `Event` and `Listener` from `src/core/contracts.ts` and nothing else
  outside Node's `fs` and `path`.
- `src/core/util/topo.test.ts:42-67`: the two ported tests use the helpers of this file instead of the legacy
  ones, and the diamond test also checks the removal order. The legacy tests `handles single item` and
  `handles independent items` in the same line range were not ported: the item names "diamond/empty", and the
  quarry test `keeps input order for independent items` already covers the second.
- `src/core/util/events.ts:53`: a listener that throws is reported with `console.error`. The core has no
  logger of its own until P1.5; whether the emitter should take a `Logger` is that item's question.
- The floor in `vitest.config.mts` applies to `src/core/**` as one total, not per file or per directory. A
  later directory below 85 % can hide behind this one; the P1 gate measures the total.

## Advisor decisions (date, item, question, answer verbatim)

The item is not ⚑ and no stop-and-ask trigger fired, so no consultation of the `architecture-advisor` took
place for it.

## Exact next step (one item ID)

P1.3 (`src/core/versioning/**`; its bench file belongs in `src/test/benchmarks/`, N40).

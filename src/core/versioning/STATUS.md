# STATUS — src/core/versioning   commit c485d16 (parent of the P1.3 commit)   2026-10-12T12:14:38Z

git status --short src/core/versioning src/test/benchmarks: `?? src/core/versioning/`,
`?? src/test/benchmarks/core-versioning.bench.ts` (both belong to the P1.3 commit, together with
` M CHANGELOG.md`, ` M ARCHITECTURE.md`, ` M docs/plans/STATUS.md` and ` M docs/plans/findings-ledger.md`)

Item: **P1.3 `src/core/versioning/**`**. The quarry has no `STATUS.md` for this directory; its tree was read
instead: `NuGetVersion.ts`, `VersionRange.ts`, `index.ts`, `versioning.test.ts` and `README.md`, all committed
in `f837f34` and unchanged since. The modules import `../../protocol/domain` (types) and each other only.

## Verified by running

```text
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0, no output
baseline npx vitest run      → Test Files 50 passed (50) · Tests 1651 passed (1651)
copy from the quarry tree    → cmp: all five files identical to the quarry working tree
unmodified copy              → npm run check-types exit 0 · npx eslint src/core/versioning exit 0 ·
                               Test Files 1 passed (1) · Tests 61 passed (61)
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output
npm run lint                 → exit 0
npx vitest run --project backend src/core/versioning → Test Files 1 passed (1) · Tests 62 passed (62)   (item gate)
npm test                     → Test Files 51 passed (51) · Tests 1713 passed (1713)
npx vitest run --coverage    → exit 0 · All files 72.91 % statements, 62.05 % branches, 66.88 % functions,
                               74.48 % lines · src/core/versioning 96.38 / 92.97 / 100 / 96.15 ·
                               src/core/util 99.28 / 92 / 100 / 99.27 (floor for src/core/**: 85 % lines)
npm run bench                → Test Files 15 passed (15) · Tests 93 passed | 1 skipped (94); the output
                               lists "✓ |backend (bench)| src/test/benchmarks/core-versioning.bench.ts
                               (13 tests)"                                                         (item gate)
bench type check             → npx tsc --ignoreConfig --noEmit --strict --noImplicitReturns --module esnext
                               --moduleResolution bundler --target ES2022 --lib ES2022,DOM --jsx react-jsx
                               --esModuleInterop --skipLibCheck --resolveJsonModule
                               --types node,vitest/globals src/test/benchmarks/core-versioning.bench.ts
                               src/global.d.ts → exit 0 (bench files are in no tsconfig until P2.12)
node src/test/benchmarks/run.mjs compare core-versioning → fails, as expected without a baseline entry:
                               "Missing or invalid benchmark baseline for
                               src/test/benchmarks/core-versioning.bench.ts > … ; run npm run bench:save."
git status --short benchmarks/baseline.json → empty
npm run package:vsix         → exit 0 · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 528.23 KB)
npm run check:vsix           → check:vsix: OK
advisor VERIFY greps         → "exact pin is not an update candidate": 1 · the `[1.0.0]` … toBe(false)
                               assertion: 2 · toBe(true): 19, one lower than the quarry's 20 ·
                               `case 'exact':` in isUpdateCandidate is followed by `return false;` ·
                               the two ruled comments: 1 each
grep Thenable, vscode, child_process in src/core/versioning → no match
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P1.3
```

## Done (tested)

- `NuGetVersion.ts`: `parseVersion`, `normalize`, `compare`, `compareText`, `isNewer`, `equals`,
  `sortDescending`, `selectLatest`, `normalizeId`. Unchanged from the quarry.
- `VersionRange.ts`: `parseVersionSpec`, `toDomainSpec`, `satisfies`, `satisfiesText`, `resolveFloating`,
  `isUpdateCandidate`, `effectiveInstalledVersion`. `isUpdateCandidate` returns `false` for an exact pin
  (`VersionRange.ts:287-288`); test `exact pin is not an update candidate` (`versioning.test.ts:228`).
- `index.ts` and `README.md` (one sentence added on exact pins).
- 62 tests in `versioning.test.ts`: the 61 of the quarry, one of them with a changed assertion, and the new one.
- `src/test/benchmarks/core-versioning.bench.ts`: 13 benchmarks (parsing, ordering, specifications).

## Done (untested)

- The wording of `FloatingPattern.depth` (`VersionRange.ts:24-29`) and the comment in `toDomainSpec`
  (`:174`): comments only.
- Nothing imports the module yet. Its first consumers are P2.2 and P2.4 (project model) and P4.8 (updates).

## Not started

- `benchmarks/baseline.json` has no entries for the new bench file: P2.12 saves the baseline. Until then the
  informational CI job "Benchmark (informational)" (`npm run bench:compare`, `continue-on-error: true`) fails on
  the thirteen new keys and the run stays green.
- The comment of `VersionSpec.floatingDepth` in `src/protocol/domain.ts` (N43): a later contract item.
- The `NuGetVersion` conformance table and property tests: P6.5.

## Deviations from contract/ADR (file:line each)

- `src/core/versioning/versioning.test.ts:224`: an assertion of a quarry test the item does not name was
  rewritten, from `toBe(true)` to `toBe(false)` for `isUpdateCandidate(parseVersionSpec('[1.0.0]'), undefined)`.
  The item mandates the behaviour; the advisor ruled the rewrite (below). The title of that test (`:217`) and
  its other seven assertions are unchanged.
- `floatingDepth` for a prerelease wildcard after a full version (`1.0.0-*`) is 4 in 2.0; 1.x returned 3
  (`src/services/NuGetUtils.ts:277`). The value 0 (`*`, `*-*`) and the value 4 are not described by the
  comment in `src/protocol/domain.ts:21`, which names 1 to 3. The module documents all five; the domain
  comment is finding N43.
- `src/test/benchmarks/core-versioning.bench.ts:9-21`: the functions are bound to local constants once,
  unlike the 1.x bench files, so the benchmark does not measure the export getters of Vitest's module runner.
  Seven of the thirteen benchmarks still print Vitest's "accessed module export getters too many times":
  those getters are the imports of `NuGetVersion.ts` inside `VersionRange.ts`, the code under test, as in
  the 1.x benches. Not changed.
- The bench file is under `src/test/benchmarks/`, not in the module's directory (N40).

## Advisor decisions (date, item, question, answer verbatim)

2026-10-12, P1.3, stop-and-ask before any edit. Question: the item mandates that `isUpdateCandidate` returns
false for `exact`, but a quarry test that the item does not name asserts the opposite; and "`floatingDepth` doc
aligned with `domain.ts`" can mean a comment or the values that reach the protocol, while `domain.ts` is
frozen. Which option for each, with the exact text, and does either need a contract change? Answer, verbatim:

```text
DECISION: (A) option A1 and (B) option B1. Flip the single assertion at quarry `versioning.test.ts:224` to `false`, add the named test `exact pin is not an update candidate`, leave `minimum` and `effectiveInstalledVersion` unchanged; align the module's `floatingDepth` documentation with `domain.ts` in the module only, change no value `toDomainSpec` passes, and record the domain comment's incompleteness as ledger finding N43 for a later contract item. Neither half needs a contract change in P1.3.

Correction to the brief first: the P4.8 row is plan line 264, not 261-262 (`/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:264`). Every other tree claim holds: `src/protocol/domain.ts:13-25` (`VersionType`, `VersionSpec`, the comment at `:21-22`), plan line 210 (P1.3 row), ADR-004 tier 1 "excluded from update checks" (`docs/adr/004-project-model.md:27-28`) and its Consequences (`:59`), ledger N6 at `docs/plans/findings-ledger.md:108` and `:312` mapped to P1.3, P2.2, P4.8, status `open`. The quarry excerpts (`VersionRange.ts:21-31,64,72,97,117-121,163-171,268-294`, `versioning.test.ts:140-153,216-226`, the README sentence) I take on trust; this agent cannot read the worktree.

WHY: For (A), the plan row (line 210) mandates the behaviour, and plan §2.1 (line 69-70) lets an item rewrite the tests that its change necessarily contradicts when the STATUS note lists each; turning `toBe(true)` into `toBe(false)` for the mandated behaviour is an update, not a weakening, and `CLAUDE.md`'s test rule 2 ("update every test that covers the changed code path") requires it. The authority behind the row is N6 "Exact pins `[x.y.z]` always reported updatable", whose 1.x mechanism I verified: `src/services/NuGetPackageService.ts:2065-2069` and `:2131-2135` skip only `floating` and `range`, so an exact pin falls through to `isNewerVersion(latestVersion, pkg.version)` with the raw spec `[1.0.0]` as `pkg.version` (ledger F3, `findings-ledger.md:203`). ADR-004 is silent on exact pins (it names `unresolved` only), so there is no ADR mismatch and nothing to amend; P4.8's `updates.ts` gates on `isUpdateCandidate`, which is why the row fixes it here. A2 removes an assertion from a test the item does not name (a partial deletion); A3 misreads §2.1, which names behaviour as well as titles. For (B), the domain comment is a verbatim copy of 1.x `src/services/NuGetTypes.ts:23` ("the depth of the wildcard (major=1, minor=2, patch=3)"), and the 1.x code and tests fix its reading: `NuGetUtils.ts:265` returns `parts.length` (`10.*` → 1 at `NuGetUtils.test.ts:292`, `1.0.*` → 2 at `:300`), `:251` returns 0 for `*`, so "major=1" means "one fixed component, `N.*`" and never "wildcard in the major position". The module's 0 to 3 therefore already agree with the domain by lineage; the only genuinely undescribed value is 4 (prerelease wildcard after a full version), where 1.x returned 3 (`NuGetUtils.ts:277`). The row says "doc aligned", `domain.ts` is frozen (D6) and P1.3 names no contract file, nothing in this tree consumes `floatingDepth` (`grep -rn floatingDepth src` finds only the two type declarations, legacy `NuGetUtils.ts` and its tests), and B2 would change six quarry assertions the row does not name and drop information the protocol carried in 1.x; so B1, with a definition that produces all five values rather than an exception for 4. Bench placement follows N40 (`findings-ledger.md:142,351`): only `src/test/benchmarks/**/*.bench.ts` is discovered (`vitest.config.mts:16`), and no `LAYERS` fence in `eslint.config.mjs:29-62` covers `src/test/benchmarks/**`, so the bench may import `src/core/versioning`.

DO:
1. Copy `src/core/versioning/**` from the quarry working tree byte-identical (D3), run `npm run check-types`, `npx eslint src/core/versioning` and `npx vitest run --project backend src/core/versioning` on the unmodified copy, and record the three results in the STATUS note (as P1.2 did). A missing neighbour import blocks the item; never stub it.
2. `src/core/versioning/VersionRange.ts`, the JSDoc above `isUpdateCandidate` (quarry `:268-271`), replace with:

        /**
         * Whether an installed reference can be checked for updates. Floating/range specifications need
         * a resolved version (from assets or lock files); a minimum specification carries its own; an exact
         * pin such as `[1.0.0]` is never a candidate, because its author fixed the version.
         */

3. Same file, the switch (quarry `:280-282`): replace

        case 'exact':
        case 'minimum':
            return true;

   with

        case 'exact':
            return false;
        case 'minimum':
            return true;

   `effectiveInstalledVersion` (quarry `:288-294`) is unchanged: an exact pin still shows its pinned version.
4. `src/core/versioning/versioning.test.ts`, quarry line 224, replace

        expect(isUpdateCandidate(parseVersionSpec('[1.0.0]'), undefined)).toBe(true);

   with

        expect(isUpdateCandidate(parseVersionSpec('[1.0.0]'), undefined)).toBe(false);

   The test title at line 217 and its other seven assertions stay. List this rewrite under "Deviations" in the STATUS note (§2.1).
5. Same file, inside `describe('isUpdateCandidate / effectiveInstalledVersion')`, after the closing `});` of that first `it` (quarry line 226), add:

        it('exact pin is not an update candidate', () => {
            expect(isUpdateCandidate(parseVersionSpec('[1.0.0]'), undefined)).toBe(false);
            expect(isUpdateCandidate(parseVersionSpec('[1.0.0]'), '1.0.0')).toBe(false);
            expect(effectiveInstalledVersion(parseVersionSpec('[1.0.0]'), undefined)).toBe('1.0.0');
        });

   The third line pins the decision that `effectiveInstalledVersion` does not change. If the quarry parser's `spec.min.original` for `[1.0.0]` is not the string `'1.0.0'`, delete that one line and write the actual value in the STATUS note; do not alter `effectiveInstalledVersion` to make it pass.
6. `src/core/versioning/VersionRange.ts`, the `FloatingPattern.depth` comment (quarry `:24`), replace `/** Number of fixed numeric components before the wildcard (0 for `*`). */` with:

        /**
         * Position of the wildcard, counted in fixed components: 0 for `*` and `*-*`, 1 for `1.*` (major fixed),
         * 2 for `1.0.*`, 3 for `1.0.0.*`, 4 when every numeric component is fixed and the wildcard sits in the
         * prerelease label (`1.0.0-*`, `1.0.0-beta*`). The value travels unchanged as `VersionSpec.floatingDepth`
         * (`src/protocol/domain.ts`), whose comment names 1 to 3 as major, minor and patch.
         */

   The `prefix` comment and the type `0 | 1 | 2 | 3 | 4` stay.
7. Same file, `toDomainSpec` (quarry `:163-171`), put one comment line directly above `floatingDepth: parsed.floating?.depth,`:

        // Passed as is: the domain comment names 1 to 3; 0 and 4 are defined on `FloatingPattern.depth`.

   No value changes; the quarry assertions at `versioning.test.ts:140-153` stay as they are.
8. The directory README: the sentence "`isUpdateCandidate` tells whether a reference can be checked at all." stays true and is unchanged. Append one sentence after it: "An exact pin such as `[1.0.0]` is never checked."
9. Create `src/test/benchmarks/core-versioning.bench.ts` (not under `src/core/**`, N40) in the form of `src/test/benchmarks/utils.bench.ts` (`describe`/`test` with `runBenchmark(context, name, fn)` from `./benchmark`), importing from `../../core/versioning/...`; cover at least `parseVersion`, `compareVersions` (or the module's comparator), `parseVersionSpec` for a standard, floating, range and exact spec, and `isUpdateCandidate`.
10. Ledger `docs/plans/findings-ledger.md`: set the N6 status cell (line 108; mirror at line 312 keeps the plan's mapping) to `open (versioning side done in P1.3; fixture in P2.2, gating in P4.8)`. Add N43 after N42 in both tables (the summary row after line 144 and the detail row after line 353, in the form of N40 at lines 142 and 351), text: `src/protocol/domain.ts:21` documents `floatingDepth` as "major=1, minor=2, patch=3" only; `src/core/versioning/VersionRange.ts` also emits 0 (`*`, `*-*`) and 4 (prerelease wildcard after a full version, `1.0.0-*`), and 1.x emitted 3 for that last case (`src/services/NuGetUtils.ts:277`); nothing consumes the field in 2.0 yet. Severity Low. Scheduled: the next advisor-approved contract-change item that touches `domain.ts` (candidate P6.5, `NuGetVersion` conformance table, with its own sentinel); the comment then becomes `/** For floating versions: the position of the wildcard counted in fixed components (`1.*` = 1 major, `1.0.*` = 2 minor, `1.0.0.*` = 3 patch; 0 for `*`; 4 for a prerelease wildcard such as `1.0.0-*`). */`.
11. Docs duties: CHANGELOG `## [Unreleased]` `### Added`: `**Core versioning module** — NuGet version parsing, comparison and version-spec classification for 2.0; exact pins are never reported as updatable.` ARCHITECTURE.md: one module-map row under `## 2.0 Architecture (in progress)` for `src/core/versioning`. No new gotcha row unless one surfaces.
12. Rewrite `src/core/versioning/STATUS.md` from the §2.5 template, with this answer verbatim under "Advisor decisions", the line-224 rewrite, the 1.x-3-versus-2.0-4 divergence, N43 and the untouched `benchmarks/baseline.json` under "Deviations"; set the tracker row; commit with the `git-commit` skill citing P1.3, N6 (partial), N40, N43, D3, D6; push to `labs/2.0`; wait for green CI.

DO NOT:
- Do not change `effectiveInstalledVersion` for `exact` or any other kind.
- Do not make `minimum` (domain `standard`) return `false`; the row names `exact` only.
- Do not retitle, split or remove the existing test at quarry line 217; only its line 224 changes.
- Do not move the line-224 assertion into the new test (A2) or block the item (A3).
- Do not edit `src/protocol/domain.ts`, `src/core/contracts.ts` or `docs/adr/**`; no sentinel exists for P1.3.
- Do not omit 0 or 4 from `toDomainSpec` (B2) or change `depth` for `1.0.0-*` to 3 to match 1.x.
- Do not change the quarry assertions at `versioning.test.ts:140-153`.
- Do not place the bench under `src/core/**` and do not add a `benchmark.include` entry to `vitest.config.mts`.
- Do not run `npm run bench:save` or edit `benchmarks/baseline.json`; `bench:compare` has no entry for the new file until P2.12, and the CI bench job is informational (D8).
- Do not close N6; P2.2 (fixture `Pinned` `[1.0.0]`) and P4.8 (gating) still own parts of it.
- Do not cite finding ids inside code comments; they belong in the commit, the tracker and the ledger.

CONTRACT CHANGE: none. `src/protocol/domain.ts:21-22` stays as it is; its incompleteness is N43, to be fixed by the next advisor-approved contract-change item that touches `domain.ts` (candidate P6.5) under its own sentinel and recorded approval (D6).

VERIFY:
- `npm run check-types` → exit 0; `npx eslint src` → 0 errors, 0 warnings; `npx eslint src/test/benchmarks/core-versioning.bench.ts` → no output.
- `npx vitest run --project backend src/core/versioning` → Test Files 1 passed; Tests = the unmodified copy's count + 1 (or more if the new test is split), all passed.
- `grep -c "exact pin is not an update candidate" src/core/versioning/versioning.test.ts` → 1; `grep -c "parseVersionSpec('\[1.0.0\]'), undefined)).toBe(false)" src/core/versioning/versioning.test.ts` → 2; `grep -c "toBe(true)" src/core/versioning/versioning.test.ts` is one lower than on the unmodified copy.
- `grep -n -A1 "case 'exact':" src/core/versioning/VersionRange.ts` → the next line is `return false;`; `grep -c "Position of the wildcard, counted in fixed components" src/core/versioning/VersionRange.ts` → 1; `grep -c "Passed as is: the domain comment names 1 to 3" src/core/versioning/VersionRange.ts` → 1.
- `npm test` → all files passed (51 files: 50 + versioning.test.ts); `npx vitest run --coverage` → exit 0 with `src/core/**` lines ≥ 85 %.
- `npm run bench` → Test Files 15 passed (14 + 1) and the output lists `core-versioning.bench.ts`; `git status --short benchmarks/baseline.json` → empty.
- `grep -rn "Thenable\|from 'vscode'\|child_process" src/core/versioning` → no match; `git diff --stat HEAD -- src/protocol src/core/contracts.ts docs/adr` → empty at commit time; `ls .claude/.contract-change` → No such file or directory.
- `grep -n "^| N43" docs/plans/findings-ledger.md` → 2 matches; `grep -n "versioning side done in P1.3" docs/plans/findings-ledger.md` → 1 match.
- CI run on `labs/2.0` green; the Benchmark job lists the new file.

CHECKED: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; plan §1-§3 (lines 41-159) and rows P1.2, P1.3, P2.2, P2.4, P2.12, P4.8, P6.5, Appendix A N6 (line 404); `/Users/mattias/github/nuiget/docs/adr/004-project-model.md` (all); `/Users/mattias/github/nuiget/docs/plans/STATUS.md` (tracker rows P1.2, P1.3; P0 phase review non-blocking 2 on bench placement; P1.1b rulings on ledger ids in prose); `/Users/mattias/github/nuiget/src/core/util/STATUS.md` (P1.2 note; its "Exact next step" already points the bench to `src/test/benchmarks/`); `/Users/mattias/github/nuiget/src/protocol/domain.ts:1-80`; `/Users/mattias/github/nuiget/src/services/NuGetTypes.ts:10-27`, `/Users/mattias/github/nuiget/src/services/NuGetUtils.ts:238-304`, `/Users/mattias/github/nuiget/src/services/NuGetUtils.test.ts:280-340`, `/Users/mattias/github/nuiget/src/services/NuGetPackageService.ts:2055-2080,2125-2145`, `/Users/mattias/github/nuiget/src/webview/NuGetSidebarPanel.ts:1090-1105`; `/Users/mattias/github/nuiget/docs/plans/findings-ledger.md` rows F1, F3, N6, N39, N40, N41, N42 (highest id N42); `/Users/mattias/github/nuiget/vitest.config.mts:15-16`, `/Users/mattias/github/nuiget/package.json:317-319`, `/Users/mattias/github/nuiget/src/test/benchmarks/run.mjs` and `utils.bench.ts:1-25`, `/Users/mattias/github/nuiget/eslint.config.mjs:29-62,124-141`; `git status --short` clean at c485d16; `grep -rn "floatingDepth\|isUpdateCandidate\|'exact'" src` outside `src/core/versioning`. Not run by me: any gate; the brief's baseline results are taken as given. Quarry lines are taken from the brief.
```

Acted on: steps 1 to 12 as written. Two notes on the answer: its step 9 names `compareVersions`; the module's
comparator is `compare`, which the bench uses. Its VERIFY line expects the Benchmark CI job to list the new
file; that job runs `bench:compare`, which fails on the new keys until P2.12 (see "Not started").

## Exact next step (one item ID)

P1.4 (`src/core/cache/**`; its bench file belongs in `src/test/benchmarks/`, N40, and gets no baseline entry
before P2.12).

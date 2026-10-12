# STATUS — src/core/versioning   commit b8bfb9c (the P1.3 commit; this note was completed in the commit after it)   2026-10-12T12:14:38Z

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
CI                           → run 38247897134 for b8bfb9c: first attempt red, job E2E (1.85.0), legacy test
                               "Update Flow › install old version then update to latest" failed its first
                               assertion 10.07 s after the suite started (N44); gh run rerun 38247897134
                               --failed → success: E2E (1.85.0) success, Build & Package success, all other
                               jobs success; Benchmark (informational) failure, expected until P2.12
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
- The legacy e2e test that made the first CI attempt red waits a fixed 10 s for the suite's first `dotnet`
  command (N44). It is not this item's file; P5.12 retires it. Nothing was changed for it.
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

Acted on (first answer): steps 1 to 12 as written. Two notes on the answer: its step 9 names `compareVersions`; the module's
comparator is `compare`, which the bench uses. Its VERIFY line expects the Benchmark CI job to list the new
file; that job runs `bench:compare`, which fails on the new keys until P2.12 (see "Not started").

2026-10-12, P1.3, stop-and-ask after the push: CI run 38247897134 for `b8bfb9c` was red in `E2E (1.85.0)`, in
the legacy test `Update Flow › install old version then update to latest`, a test this item did not write and
whose code path the commit does not touch. Question: re-run, fix the test, or block; and what is recorded
where? Answer, verbatim:

```text
DECISION: Option 1. Re-run the failed jobs of run 38247897134, and when the re-run is green record the flake as finding N44 in one docs-only commit that cites P1.3 and N44, following the N37 precedent (commit 9e2ebbc). No test and no code changes. This is not an owner decision.

Corrections to the brief first: the test spans `src/test/e2e/update-flow.e2e.test.ts:36-75`, not 37-79. Every other tree claim holds. I read the log myself (`gh run view 38247897134 --log-failed` and `--log`): in `E2E (1.85.0)` Electron started at 12:16:02.5, the extension host at 12:16:10.90, `Update Flow` at 12:16:12.18, and the failure line at 12:16:22.25, 10.07 s after the suite started, the length of the sleep at `:45`; in `E2E (stable)` of the same run the same test passed in 30009 ms and the job reports 30 passing.

WHY: The failure has no causal path from P1.3: `git diff --stat c485d16 b8bfb9c` touches `src/core/versioning/**`, `src/test/benchmarks/core-versioning.bench.ts` and four documents only, nothing under `src/test/e2e`, `src/services`, `src/webview`, `src/extension.ts` or `esbuild.mjs`, so the 1.x bundle the `e2e` job builds (`ci.yml:159-160`) behaves as the one that passed on c485d16 in run 38246210132. The test never calls the extension's code paths: it types `dotnet add … --no-restore` into an integrated terminal (`:40-44`) 1.3 s after the extension host started, sleeps a fixed 10 s (`:45`) and asserts (`:48-51`); the failed assertion fired exactly when the sleep ended, so the first `dotnet` command the suite runs had not finished on a cold runner (the `e2e` job, unlike the `test` job at `ci.yml:102`, has no `dotnet --version` warm-up after `setup-dotnet`, `ci.yml:143-163`; `suiteSetup` activates the 1.x extension 1.3 s earlier, which itself probes `dotnet`, so the two may share first-run initialisation). The same terminal pattern in `install-flow.e2e.test.ts:50-57` completed inside its wait later in the same job (`install package adds PackageReference to .csproj`, 15012 ms), and `E2E (stable)` of the same run passed the same test. Plan §2.1 puts `src/test/e2e/**` outside P1.3's files, RUN.md §4 forbids touching tests the item does not name, and P5.12 retires every legacy e2e file ("never preserve `dotnet add package`"), so option 2 would be throwaway work that no local gate of P1.3 can verify; option 3 is wrong because nothing here is the owner's call. The gotcha row at `.github/copilot-instructions.md:166` ties the re-run permission to N37 only; this ruling extends it to N44 by the mechanism the P0.13 session used for N37 (9e2ebbc: ledger row, widened gotcha row, tracker note, STATUS note, no code change).

Rulings on the two side questions. (a) The §5.3 counter: run 38247897134 does not count toward "two red runs" for P1.3. That counter bounds fix-forward commits for a failure the item caused; a re-run of an unchanged SHA is not a fix attempt, and a green re-run leaves P1.3 with zero red runs charged. If the re-run fails identically (same test, first assertion, about 10 s after the suite starts), that is a reproducible failure in a test nobody owns and a new stop-and-ask, still not a §5.3 count; the second brief must carry the suite-start and failure timestamps of the new attempt, whether `E2E (stable)` also failed, the duration of `install package adds PackageReference to .csproj` in that attempt, and the two candidate fixes for the advisor to choose between: a `dotnet --version` warm-up step in the `e2e` job mirroring `ci.yml:102`, or bounded polling of the project file in the test. If the re-run fails elsewhere or with another error, a new brief with that log. (b) P1.4 does not start while the re-run is in progress. RUN.md §5.3 says so, and mechanically `ci.yml:10-12` groups runs by ref with `cancel-in-progress: true`, so a P1.4 push would cancel the re-run attempt. Reading the P1.4 plan row meanwhile is harmless; no edit and no tracker flip.

DO:
1. Paste this answer verbatim under `## Advisor decisions` in `src/core/versioning/STATUS.md` (not frozen, no sentinel) before anything else.
2. `gh run rerun 38247897134 --failed` (pre-approved by `.claude/settings.json:39`, `Bash(gh run:*)`). `--failed` re-runs `E2E (1.85.0)`, its dependent `Build & Package` (currently `skipped`), and the informational `Benchmark` job. If the `--json jobs` output after the attempt still shows `Build & Package skipped`, run `gh run rerun 38247897134` without `--failed`; never a push to get it to run.
3. `gh run watch 38247897134 --exit-status`. Push nothing and start nothing while it runs. Green → step 4. Red in the same test at the same assertion → new brief as ruled above, no fix-forward, no further re-run, no P1.4. Red elsewhere → new brief with that log.
4. `docs/plans/findings-ledger.md`: add N44 as a summary row after line 145 and a detail row after line 355, in the form of N37 (lines 139 and 349). Detail text: The `E2E (1.85.0)` CI job can fail in `Update Flow › install old version then update to latest` (`src/test/e2e/update-flow.e2e.test.ts:36-75`) without any product code path running: 1.3 s after the extension host starts, the test sends the suite's first `dotnet` command (`dotnet add … --no-restore`) through an integrated terminal, sleeps a fixed 10 s (`:45`) and asserts the `.csproj` content (`:48-51`); the `e2e` job has no `dotnet` warm-up step (the `test` job runs `dotnet --version`, `ci.yml:102`). Seen once, run 38247897134 on b8bfb9c: failure 10.07 s after the suite started, 29 of 30 tests passing, `E2E (stable)` of the same run green (same test, 30009 ms), the five earlier 1.85.0 runs of the day green; `gh run rerun 38247897134 --failed` → <result>. On a failed first assertion the test also skips `installTerminal.dispose()` (`:52`). 28 fixed `setTimeout` sleeps exist in 8 of the 9 legacy e2e files; those 8 files are among the 22 of the ledger's `:417` count, whose label says unit tests. Severity Low. Found: P1.3. Scheduled: until the legacy e2e files are retired, re-run the failed job; a second identical failure on the same SHA is a stop-and-ask (warm-up step in the `e2e` job, or polling in the test); P3.5 and P5.12 write the v2 e2e tests with bounded polling of the project file instead of fixed sleeps; P5.12 retires the legacy file. Summary row text: `The first e2e test of the run waits a fixed 10 s for the suite's first `dotnet` command and can fail without product code running.` | — | P5.12 (v2 e2e tests poll; legacy file retired); until then re-run the failed job | open.
5. `.github/copilot-instructions.md:166`: widen the existing row, do not add a second. Replacement text: `| A red CI run is not always a code failure | Read `gh run view <id> --log-failed` first. Two known environmental failures: `E2E (1.85.0)` or `UI` stops with "Failed to download and unzip VS Code" or a ChromeDriver download error before any test ran (finding N37); or `E2E (1.85.0)` reports `Update Flow › install old version then update to latest` failing its first assertion (".csproj should contain 3.13.3") about 10 s into the suite, with VS Code downloaded and every other test passing (finding N44: the legacy test sleeps a fixed 10 s for the suite's first `dotnet` command). For either, re-run with `gh run rerun <id> --failed`, change no code or test in the item whose run went red, and never mark a job `continue-on-error` to hide it. A second identical failure on the same SHA is a stop-and-ask. |` No `.claude/` mirror is needed: `CLAUDE.md` imports the file.
6. `docs/plans/STATUS.md`, row P1.3: Commit `b8bfb9c`; append to Notes: `CI: run 38247897134 red in E2E (1.85.0) on the legacy e2e timing flake N44 (ruling in src/core/versioning/STATUS.md); gh run rerun --failed → green.`
7. `src/core/versioning/STATUS.md`: header SHA `b8bfb9c`; replace line 48 (`CI → see the tracker row of P1.3`) with the run id, the failed job and the re-run result; add one line on N44 under "Not started" (it is not a contract deviation).
8. Commit with the `git-commit` skill, docs only, four files: `docs(plans): record the e2e timing flake in CI (P1.3, N44)`; body in the form of 9e2ebbc. Push to `labs/2.0`; `gh run watch <new id> --exit-status` → green. Then P1.4.

DO NOT:
- Do not edit `src/test/e2e/update-flow.e2e.test.ts` or any other 1.x test in P1.3 or in the docs commit (plan §2.1, RUN.md §4; the file is retired by P5.12).
- Do not add a `dotnet --version` step to `.github/workflows/ci.yml` now; that is one of the two candidate fixes for the second brief, and `ci.yml` is not an item file of P1.3.
- Do not push or start P1.4 while the re-run attempt is in progress (`ci.yml:10-12` would cancel it).
- Do not mark P1.3 `blocked`, and do not count run 38247897134 as a §5.3 red run.
- Do not mark `e2e` `continue-on-error`, raise the sleep, or add `.skip`/`.only` anywhere.
- Do not add a second "red CI run" gotcha row; widen the existing one.
- Do not touch `.github/STATUS.md`, `CHANGELOG.md`, `ARCHITECTURE.md`, `src/protocol/**`, `src/core/contracts.ts` or `docs/adr/**`.
- Do not write finding ids into code or test comments.
- Do not run `npm run bench:save`; the Benchmark job failure is expected until P2.12 (D8).

CONTRACT CHANGE: none.

VERIFY:
- `gh run view 38247897134 --json conclusion,jobs --jq '.conclusion, (.jobs[] | "\(.name) \(.conclusion)")'` → `success`, `E2E (1.85.0) success`, `Build & Package success`; `Benchmark (informational) failure` is acceptable (continue-on-error, no baseline until P2.12).
- `git show --stat HEAD` of the docs commit → exactly `.github/copilot-instructions.md`, `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`, `src/core/versioning/STATUS.md`.
- `grep -c "^| N44" docs/plans/findings-ledger.md` → 2; `grep -c "N44" .github/copilot-instructions.md` → 1; `grep -c "A red CI run is not always a code failure" .github/copilot-instructions.md` → 1.
- `grep -n "^| P1.3" docs/plans/STATUS.md` → the row shows `b8bfb9c` and `N44`; `head -1 src/core/versioning/STATUS.md` → contains `b8bfb9c`.
- `git diff --stat b8bfb9c HEAD -- src/test src/services src/webview src/extension.ts .github/workflows` → empty.
- `gh run list --branch labs/2.0 --limit 1 --json conclusion --jq '.[0].conclusion'` → `success` for the docs commit before P1.4 starts.

CHECKED: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; plan §1-§3 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:41-159`) and rows P0.8 (:191), P1.3 (:210), P2.12 (:236), P3.5, P5.12 (:285), P7.2 (:307); `/Users/mattias/github/nuiget/docs/plans/RUN.md` (all, §2.3, §4, §5.3 in particular); `/Users/mattias/github/nuiget/src/core/versioning/STATUS.md` (all); `/Users/mattias/github/nuiget/docs/plans/STATUS.md:1-12,23,27-29`; `/Users/mattias/github/nuiget/src/test/e2e/update-flow.e2e.test.ts:1-76`; `/Users/mattias/github/nuiget/src/test/e2e/install-flow.e2e.test.ts` (grep of terminal and sleep lines :39-76); `/Users/mattias/github/nuiget/.vscode-test.mjs`; `/Users/mattias/github/nuiget/.github/workflows/ci.yml:1-334` (concurrency :10-12, `test` job :102, `e2e` job :132-204, `build` :241-283, `benchmark` :285-333); `/Users/mattias/github/nuiget/.github/copilot-instructions.md:166`; `/Users/mattias/github/nuiget/docs/plans/findings-ledger.md:99,128-146,261,297,340-356,416-417`; `/Users/mattias/github/nuiget/.claude/settings.json:39-82`; `git status --short` (clean), `git log --oneline -3`, `git diff --stat c485d16 b8bfb9c`, `git log -- src/test/e2e/update-flow.e2e.test.ts` (last change e1755dc, before the branch point 16831f4), `git show 9e2ebbc --stat`; `gh run list --branch labs/2.0 --limit 12`; `gh run view 38247897134 --log-failed`, `--log` (E2E (stable) lines), `--json jobs`; `grep -n "setTimeout(resolve, " src/test/e2e/*.ts` (28 sleeps in 8 of 9 files). Not run by me: any local gate; the brief's local gate results are taken as given.
```

Acted on (second answer): steps 1 to 8. The re-run was green, so no second brief was needed; no test and no
code changed.

## Exact next step (one item ID)

P1.4 (`src/core/cache/**`; its bench file belongs in `src/test/benchmarks/`, N40, and gets no baseline entry
before P2.12).

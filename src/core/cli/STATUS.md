# STATUS — src/core/cli   commit e080e1f (the P1.6 commit; this note was completed in the fix that follows it)   2026-10-12T13:39:48Z

git status --short src/core/cli: `?? ` for `DotnetRunner.ts`, `DotnetRunner.test.ts`, `commands.ts`,
`commands.test.ts`, `sdk.ts`, `sdk.test.ts`, `validate.ts`, `validate.test.ts`, `powershell.ts`,
`powershell.test.ts`, `index.ts`, `__fixtures__/fake-dotnet.cjs` and `__fixtures__/dotnet-root/`; ` M` for this
note (all belong to the P1.6 commit, together with ` M CHANGELOG.md`, ` M ARCHITECTURE.md`,
` M .github/copilot-instructions.md`, ` M docs/plans/STATUS.md` and ` M docs/plans/findings-ledger.md`)

Item: **P1.6 `src/core/cli/**`**. This note replaces the note of P0.0 (the SDK 10 CPM probe), which is in
commit `1d26aeb`; the fixture of P0.0, `__fixtures__/sdk-probes/10.0.401.json`, is unchanged.

The quarry's `src/core/cli/STATUS.md` was read and checked against its working tree. It is stale: it lists
`powershell.ts`, `index.ts`, the fixture `fake-dotnet.cjs` and all tests as missing, and all of them exist
(untracked, from the second session; `DotnetRunner.test.ts` has 44 test declarations). Its other claims about
`validate.ts`, `sdk.ts`, `commands.ts` and `DotnetRunner.ts` hold. The quarry has no `sdk-probes` directory
and nothing ignored by git under `src/core/cli`.

## Verified by running

```text
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0, no output
baseline npx vitest run      → Test Files 53 passed (53) · Tests 1785 passed (1785)
copy from the quarry tree    → cmp: ten files identical to the quarry working tree (seven sources and tests,
                               three fixture files); sdk-probes/10.0.401.json not touched
unmodified copy              → npm run check-types exit 2: commands.ts(70,23), commands.ts(89,17) and
                               sdk.ts(96,9), all 'nounFirstSyntax' does not exist on type 'SdkInfo' ·
                               npx eslint src/core/cli: 2 errors, DotnetRunner.test.ts 355:73
                               no-throw-literal and commands.ts 155:13 no-control-regex ·
                               tests: 2 failed | 51 passed | 1 skipped (54); failed:
                               "returns undefined and warns when dotnet cannot be started" and
                               "keeps the persisted snapshot and the in-memory cache at
                               SDK_CACHE_MAX_ENTRIES"
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output                                                   (item gate)
npm run lint                 → exit 0
npx vitest run --project backend src/core/cli → Test Files 5 passed (5) · Tests 138 passed | 1 skipped (139)
                                                                                                  (item gate, ≥ 80)
npx vitest run --project backend src/core/cli --coverage.enabled --coverage.include='src/core/cli/**'
  --coverage.thresholds.lines=90 → exit 0 · All files 99.27 % statements, 94.75 % branches,
                               100 % functions, 99.25 % lines · DotnetRunner.ts 98.78 % lines, the other
                               five files 100 %                                                    (item gate)
                               The command also prints a PARSE_ERROR of the coverage provider: its glob
                               includes this Markdown note, which is not source. It does not change the exit code.
NUIGET_SDK_TESTS=1 npx vitest run --project backend src/core/cli → Tests 139 passed (139): the test
                               "runs dotnet --version and probes the matching SdkInfo" runs against the
                               installed SDK (`dotnet --version` in src/core/cli prints 10.0.401; the
                               repository has no global.json)
npm test                     → Test Files 58 passed (58) · Tests 1923 passed | 1 skipped (1924)
npx vitest run --coverage    → exit 0 · All files 74.68 % statements, 64.05 % branches, 69.55 % functions,
                               76.24 % lines · src/core/** 987 of 1002 lines, 98.50 % (floor 85 %)
npm run bench                → Test Files 16 passed (16) · Tests 101 passed | 1 skipped (102)
npm run package:vsix         → exit 0 · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 528.49 KB)
npm run check:vsix           → check:vsix: OK
grep -rln child_process src/core --include='*.ts' → only files under src/core/cli (ADR-003)
grep -rn "Thenable\|from 'vscode'\|nounFirstSyntax" src/core, code files → no match
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → run 38256767668 for e080e1f RED: Test (ubuntu-latest) and Test (windows-latest),
                               the same three tests of DotnetRunner.test.ts on both ("wraps other
                               asynchronous spawn errors in DotnetSpawnError", "wraps a synchronous spawn
                               failure, including non-Error throwables", "returns undefined and warns when
                               dotnet cannot be started"); every other test passed on both systems.
                               Cause: the runners set DOTNET_ROOT, the shell of the local gates did not,
                               and those tests asserted the executable name without fixing it (N48).
reproduced locally           → DOTNET_ROOT=<sdk dir> NUIGET_SDK_TESTS=1 npx vitest run --project backend
                               src/core/cli → 3 failed | 136 passed (139), the same three tests
after the fix                → the same command: Tests 139 passed (139) · with DOTNET_ROOT=/nonexistent/sdk:
                               138 passed | 1 skipped · with DOTNET_ROOT unset: 138 passed | 1 skipped ·
                               npm test with DOTNET_ROOT set and NUIGET_SDK_TESTS=1: Test Files 58 passed
                               (58), Tests 1924 passed (1924) · npx vitest run --coverage in that
                               environment: exit 0, src/core/cli 99.25 % lines · the literal coverage gate
                               in that environment: exit 0 · npm run check-types 0 · npm run lint 0
CI after the fix             → see the tracker row of P1.6
```

## Done (tested)

- **SDK floor (D13).** `commands.ts`: `addPackageArgs(options)` and `removePackageArgs(options)` take no SDK and
  always build `dotnet package add|remove <id> --project <path>`; the verb-first branches are gone. `sdk.ts`:
  `MIN_SUPPORTED_SDK_MAJOR = 10`; `capabilitiesFor(major)` returns `supported = major >= 10` and the CPM
  capability as `'verified'` for a major that has a probe fixture, else `cpmAwareAdd: false` and
  `'unverified'`; `sdkInfoFromVersion` returns the new `SdkInfo`. `sdkVersion()` therefore returns an
  `SdkInfo` with `supported: false` below 10, and `undefined` only when `dotnet` is missing or its output is
  not a version. `nounFirstSyntax` and `NOUN_FIRST_MIN_MAJOR` no longer exist.
- **Probe cache.** `DotnetRunner.ts:305` (`sdkVersion`) and `:422` (`probeSdk`): a version and a non-zero exit of
  `dotnet --version` are cached; a spawn failure, a timeout, a cancellation and unreadable output are not.
- **Fixed environment.** `DotnetRunner.ts:187-188`: `{ ...process.env, ...options.env, ...FIXED_ENV }`.
- **CPM.** `AddPackageOptions.isCpm`; `addPackageArgs` throws `InvalidArgumentError` for `noRestore` with
  `isCpm`.
- **Validation.** `validate.ts:24-29` and `:54` (`isValidSourceUrl`): the forbidden characters of a source URL are quotes,
  backtick, `|`, `<`, `>`, `;`, braces and control characters; backslash and URL punctuation are allowed; a
  drive path or UNC path is recognised before `new URL`.
- `DotnetRunner.ts:487`: `PromiseLike` instead of `Thenable`.
- **Tests, 138 + 1 gated.** `DotnetRunner.test.ts` 47 declarations (54 cases), `commands.test.ts` 24,
  `validate.test.ts` 29, `sdk.test.ts` 10 declarations (24 cases), `powershell.test.ts` 9.
  - Named by the item and present by title: `cpm: addPackageArgs rejects --no-restore`,
    `caches a non-zero probe`, `retries after a spawn failure or timeout`,
    `forces the fixed CLI environment over caller variables` (asserts `TERM` is `dumb`).
  - ADR-003 invariants: no shell (`passes every argument through as one argv entry without a shell`), fixed
    environment (above), success is exit code 0 (`resolves with the exit code and stderr instead of rejecting on
    failure`), cwd is the project directory (`listSourcesRaw …`, `restore runs dotnet restore from the project
    directory and honours the signal`), only this directory names `child_process`
    (`only src/core/cli names child_process`), PowerShell through `-EncodedCommand`
    (`passes the script as -EncodedCommand, never as command text`).

## Done (untested)

- `DotnetRunner.ts:221`, `:256` and `:465` are the three lines without a test (quarry code: two guards in the
  kill and stdio paths, one in the cache trim).
- The tests have run on macOS. `escalates to SIGKILL when the process ignores SIGTERM` is skipped on Windows
  by the item's instruction; every other test runs there for the first time in CI.
- Nothing imports the module yet. `PackageWorkflows` (P1.10) is its first user.

## Not started

- Leading `-` in positional arguments (N47): P1.10 and P2.6.
- The probe fixtures for further SDK versions and a script that produces them: P6.1. `sdk.test.ts` fails when
  a fixture is added whose major is missing from the table in `sdk.ts`, or disagrees with it.

## Deviations from contract/ADR (file:line each)

Changes of quarry tests. The item names the first six; the rest follow from what it mandates. Every one is in
`DotnetRunner.test.ts`.

- Named, by line of the quarry file: `:186` renamed to `forces the fixed CLI environment over caller variables`
  and `TERM` expected as `dumb`; `:228` `it.skipIf(process.platform === 'win32')`; `:355` ESLint directive;
  `:444` probes in `CWD`, a directory that exists; `:474` replaced by `caches a non-zero probe` and
  `retries after a spawn failure or timeout`; `:633-634` three spawns, and a fourth for `p2` ("the `p2`
  assertion": the cache evicts first in, first out, so probing `p1` again evicts `p2`); `:755`
  `it.skipIf(process.env.NUIGET_SDK_TESTS !== '1')`.
- "delete the `SDK8` test constant" and "delete `it.each` SDK 6/7/8/9 rows": the constant is `SDK10` now
  (`10.0.401`, the fixture's version), and the eleven uses of `SDK8` and sixteen of the text `8.0.425` in the
  cache and persistence tests became `SDK10` and `10.0.401`. Those tests use the value as a sample, not as an
  SDK 8 case. The `it.each` table keeps `10.0.401` and the CRLF row `10.0.100`; the banner row (SDK 7) went
  with the others, and `sdk.test.ts` covers banner parsing.
- `:509` of the quarry file asserted `nounFirstSyntax: true` for a persisted `10.0.100`; it asserts
  `supported: true` now, because the field no longer exists.
- `fakeLogger` (`DotnetRunner.test.ts:142-150`): the declared return type did not type-check in the 2.0 test
  program (5 errors, hidden while the main program was red). The helper uses `vi.fn<Logger['warn']>()` and
  `satisfies Logger`; no behaviour changed.
- After the first CI run (red, see above): three quarry tests that assert the text `Could not start "dotnet"`
  now pass `resolveExecutable: plainDotnet` to their runner, as the tests around them already name their
  executable. Without it the runner resolves `DOTNET_ROOT`, so the message depended on the machine. The
  assertions are unchanged.
- Three tests added to the same file beyond the two named replacements:
  `probes again when the output was not a version`,
  `reports an SDK below 10 as unsupported instead of undefined, and caches it`, and the CWD case inside
  `retries after a spawn failure or timeout`.

Choices the item leaves open:

- "`cpmAwareAdd` + provenance from the P0.0 fixture": `sdk.ts:49-60` holds a table of probed majors (today
  `10 → true`), and `sdk.test.ts` (`agrees with every tracked probe fixture`) reads every file in
  `__fixtures__/sdk-probes/` and fails when the table and a fixture disagree. The module does not import the
  JSON: that would bundle a fixture into `dist/extension.js`.
- The probe table: the quarry had four rows (11 and newer `assumed`, 9 `documented`, 8 `verified`, below
  `unverified`). The item says "from the P0.0 fixture (10) else `'unverified'`", so SDK 11 is `supported` with
  `cpmAwareAdd: false` and `'unverified'` until a fixture exists for it. This is the collapse the item
  mandates, not a further edit of the table, so its Ask trigger did not fire.
- `CapabilityProvenance` is imported from `src/core/contracts.ts`; `sdk.ts` and `index.ts` no longer declare
  or export a second one.

Beyond the item, in its own files:

- `validate.ts:111-120`: `assertCredentialValue` throws `InvalidArgumentError` with the value `[REDACTED]`.
  The quarry put the rejected value, which can be a password, into the error message and its `value`
  property. Test `never put a rejected credential into the error`.
- `validate.test.ts`: the item names the 1.x lines to invert (`:190-196`, `:226`, `:246-266`). One more 1.x
  case is inverted as a consequence of removing URL punctuation from the blacklist:
  `https://evil.com$(cmd)` (`NuGetUtils.test.ts:202`) is accepted, as is a NuGet v2 URL with parentheses and
  quotes. The 1.x test file is unchanged.
- `.github/copilot-instructions.md`: the gotcha row on `child_process` gives the grep with
  `--include='*.ts'`. Without it the literal command also lists four handoff notes that mention the word, one
  of them inside an advisor answer that is kept verbatim.
- Three comments in `commands.ts` that described SDK 8 behaviour were shortened.

## Advisor decisions (date, item, question, answer verbatim)

The item is not ⚑. Its Ask trigger ("any probe-table edit other than deleting SDK 8/9 rows and the verb-first
branch") did not fire, see above, and no universal trigger fired: no frozen file changed, the changed quarry
tests are the ones the item names or follow from the deletions it mandates, and every line reference of the
item matched the quarry's working tree. No consultation of the `architecture-advisor` took place for it.

## Exact next step (one item ID)

P1.7 (`src/core/session/**` and `src/core/queries/scopes.ts`).

# STATUS — src/test/e2e   commit ca8b6e8 (P5.12b block d; parent of the closing commit)   2026-10-17T02:00:00Z

git status --porcelain --untracked-files=all (before the closing commit): modified `docs/plans/{STATUS,findings-ledger}.md` and the three STATUS notes of `src/test/{ui/v2,harness,e2e}` (all belong to P5.12b's closing commit; the code of blocks a to d is in a3324c4, 5084c2c, 258612d, ca8b6e8)

Item: **P5.12b, block (a)**: the carry-overs of P5.12a: the verbatim probe of `dotnet package add` without
`--version` (writes `Version="*"`) is the evidence below; `docs/plans/test-retirement-map.md` maps each legacy e2e
file to its `v2-*` port and retires `src/test/e2e/index.ts` with the legacy set at P8.2. No e2e file changed.

This note folds the earlier notes of this directory into one section per heading, newest first (P7.5c, P4 review
note 7). Their headers and items:

- **P5.12a**
  git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`,
  `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/test/e2e/v2-sidebar.e2e.test.ts`;
  new `src/test/e2e/{v2Support.ts,STATUS.md}` and `src/test/e2e/v2-{extension,commands,panel,settings-persistence,install-flow,update-flow,file-watcher,source-management}.e2e.test.ts`
  (all belong to P5.12a)
  Item: **P5.12a**: the nine legacy extension-host e2e files ported to the 2.0 entry. Eight new `v2-*` files, one per
  legacy file; the legacy `sidebar.e2e.test.ts` is folded into the existing `v2-sidebar.e2e.test.ts` (its missing
  test: Open Full View opens the main panel). `v2Support.ts` holds the shared steps: activation, a bounded `until`,
  `dotnet` through `execFile` with an argument vector, the main panel's tabs by view type (`nugetManager`), closing
  every editor, and the fixture project with its write-back. The ports assert what the legacy files left to fixed
  sleeps or `assert.ok(true)`: the panel is one tab titled nUIget, opening it again reveals it, closed it opens again;
  the noun-first add, update and remove reach the project file (polled); `nuget.config` is unchanged after the sources
  suite and the SDK lists nuget.org from it.

## Verified by running

*From the note at commit ca8b6e8 (P5.12b block d; parent of the closing commit):*

P5.12b:

```text
baseline at c388eea (P5.12a, CI run 38738178339 green on all 11 jobs): tsc 0 · eslint 0 · vitest 159 files, 3235 passed, 4 skipped (SDK)
block (a) a3324c4 → CI run 38742547111 green; block (b) 5084c2c → CI run 38744845857 green;
block (c) 258612d → CI run 38747113531 green; block (d) ca8b6e8 → CI run 38748766418 (see the tracker row)
npx tsc --noEmit / npm run check-types / npx eslint src → exit 0 each (after every block)
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → exit 0 · Test Files 160 passed (160) · Tests 3243 passed (3243)
npm run bench → exit 0 (after every block)
npx vitest run --project backend src/test/lint → Test Files 8 passed (8) · Tests 129 passed (129)
src/extension.next.test.ts + src/test/harness + src/core/cli/DotnetRunner.test.ts, 15 times → 15 of 15
DOTNET_ROOT=… NUIGET_SDK_TESTS=1 npx vitest run --project backend src/core/cli → 142 passed (142)
npx vitest run src/test/harness/scenarios.test.ts -t N73, 40 times → 40 of 40
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2, five times (rm -rf dist before each) →
                               32 passing ×5, the N66 test announced in each; git status --porcelain src/test/e2e/fixtures empty after each
git diff --diff-filter=DR --stat c388eea..HEAD -- 'src/**/*.test.ts' 'src/**/*.test.tsx' src/test/e2e/index.ts → empty
git diff --stat c388eea..HEAD -- .github/workflows/ci.yml .vscode-test.mjs src/protocol src/core/contracts.ts docs/adr src/core/catalog src/test/__mocks__/vscode.ts → empty
npm run package:vsix: SKIPPED: no host, service or esbuild change (tests and docs only)
test -e .claude/.contract-change → false
```

*From the note at P5.12a:*

```text
baseline at 3a1969c (P5.11, CI run 38735710769 green on all 11 jobs): tsc 0 · eslint 0 · vitest 159 files, 3235 passed, 4 skipped (SDK)
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → exit 0 · Test Files 159 passed (159) · Tests 3239 passed (3239)
npm run bench → exit 0
rm -rf dist && node esbuild.mjs --v2 --production && NUIGET_V2=1 npm run test:e2e → 25 passing (stable 1.142.0,
                               downloaded by vscode-test into .vscode-test as in CI)
VSCODE_TEST_VERSION=1.85.0 NUIGET_V2=1 npm run test:e2e, twice → 25 passing, 25 passing
VSCODE_TEST_VERSION=stable NUIGET_V2=1 npm run test:e2e, four more times → 25 passing each
git status --porcelain src/test/e2e/fixtures after every run → empty
probe on a scratch copy of the fixture (SDK 10.0.401): dotnet package add NUnit --version 3.13.3 --no-restore →
                               Version="3.13.3"; dotnet package add NUnit --no-restore → Version="*"; remove → gone
npm run package:vsix: SKIPPED: no host, service or esbuild change (tests and docs only)
node esbuild.mjs --v2 --production --analyze: SKIPPED: no webview, core, host or extension source changed
test -e .claude/.contract-change → false
```

Evidence for the `Version="*"` row (plan §2.6), rerun at P5.12b on a scratch copy of
`src/test/e2e/fixtures/e2e-workspace` (deleted afterwards; `git status --porcelain src/test/e2e/fixtures` empty),
SDK 10.0.401, paths redacted:

```text
$ dotnet package add NUnit --no-restore --project TestProject.csproj
info : X.509 certificate chain validation will use the fallback certificate bundle at '<dotnet>/sdk/10.0.401/trustedroots/codesignctl.pem'.
info : X.509 certificate chain validation will use the fallback certificate bundle at '<dotnet>/sdk/10.0.401/trustedroots/timestampctl.pem'.
info : Adding PackageReference for package 'NUnit' into project 'TestProject.csproj'.
warn : --no-restore|-n flag was used. No compatibility check will be done and the added package reference will be unconditional.
info : PackageReference for package 'NUnit' version '*' added to file '<scratch>/e2e-workspace/TestProject.csproj'.
exit 0
$ diff before.csproj TestProject.csproj
8a9
>     <PackageReference Include="NUnit" Version="*" />
$ dotnet package add NUnit --version 3.13.3 --no-restore --project TestProject.csproj
info : X.509 certificate chain validation will use the fallback certificate bundle at '<dotnet>/sdk/10.0.401/trustedroots/codesignctl.pem'.
info : X.509 certificate chain validation will use the fallback certificate bundle at '<dotnet>/sdk/10.0.401/trustedroots/timestampctl.pem'.
info : Adding PackageReference for package 'NUnit' into project 'TestProject.csproj'.
warn : --no-restore|-n flag was used. No compatibility check will be done and the added package reference will be unconditional.
info : PackageReference for package 'NUnit' version '3.13.3' updated in file '<scratch>/e2e-workspace/TestProject.csproj'.
exit 0
$ diff before.csproj TestProject.csproj
8a9
>     <PackageReference Include="NUnit" Version="3.13.3" />
$ dotnet package remove NUnit --project TestProject.csproj
info : Removing PackageReference for package 'NUnit' from project 'TestProject.csproj'.
exit 0
$ diff before.csproj TestProject.csproj
(no difference)
```

## Done (tested)

*From the note at commit ca8b6e8 (P5.12b block d; parent of the closing commit):*

- The map rows of the nine legacy e2e files and `index.ts`.


- Deleting the legacy tests: P8.2, per the map and its ⚑ consultation (the L2 hook refuses any deletion of a test file).

*From the note at P5.12a:*

- `v2-extension.e2e.test.ts` (from `extension`): installed, activates, every contributed command registered and none
  of the 1.x entry.
- `v2-commands.e2e.test.ts` (from `commands`): openManager and sidebar.openFullView open one main panel tab;
  refresh commands with and without a panel; both switch pairs (in 2.0 both commands of a pair flip the switch, so
  each pair ends where it began); clearHttpCache and clearSdkVersionCache. The two 1.x-only commands are asserted
  absent instead of executed.
- `v2-panel.e2e.test.ts` (from `panel`), `v2-settings-persistence.e2e.test.ts` (from `settings-persistence`).
- `v2-install-flow.e2e.test.ts`, `v2-update-flow.e2e.test.ts` (from `install-flow`, `update-flow`; N44): noun-first,
  `--no-restore` (the fixture uses no central package management), offline.
- `v2-file-watcher.e2e.test.ts` (from `file-watcher`), `v2-source-management.e2e.test.ts` (from `source-management`).
- `v2-sidebar.e2e.test.ts`: new `Open Full View from the sidebar opens the main panel (P5.12a, port of
  sidebar.e2e.test.ts)`; its helpers moved to `v2Support.ts`; its teardown also closes the editors.


- What the lists show after a CLI change: an extension-host test does not see the webviews (harness and UI suite).

## Done (untested)

## Not started

*From the note at commit ca8b6e8 (P5.12b block d; parent of the closing commit):*

- None for P5.12b. Next: P5.13.

*From the note at P5.12a:*

- Retiring the legacy e2e files and `src/test/e2e/index.ts` (unused: `.vscode-test.mjs` selects the files): P5.12b.

## Deviations from contract/ADR (file:line each)

*From the note at commit ca8b6e8 (P5.12b block d; parent of the closing commit):*

- None.

*From the note at P5.12a:*

- The update flow names its new version instead of updating to the latest: `dotnet package add` without
  `--version` and with `--no-restore` writes `Version="*"` (probe above; new 2.0 gotcha row).
- `v2Support.ts` is a helper beside the tests the row names.

## Advisor decisions (date, item, question, answer verbatim)

*From the note at commit ca8b6e8 (P5.12b block d; parent of the closing commit):*

The P5.12b ruling (2026-10-16) is verbatim in `docs/plans/STATUS.md`.

*From the note at P5.12a:*

- None for P5.12a (no stop-and-ask trigger; the ⚑ of P5.12 is for deleting a legacy test, which this row does not do).

## Exact next step (one item ID)

*From the note at commit ca8b6e8 (P5.12b block d; parent of the closing commit):*

P5.13 (⚑ mandatory consultation), after the closing commit's CI run is green.

*From the note at P5.12a:*

P5.12b, after the P5.12a CI run is green.

# STATUS — src/test/e2e   commit 3a1969c (P5.11; parent of the P5.12a commit)   2026-10-16T19:00:00Z

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

## Done (untested)

- What the lists show after a CLI change: an extension-host test does not see the webviews (harness and UI suite).

## Not started

- Retiring the legacy e2e files and `src/test/e2e/index.ts` (unused: `.vscode-test.mjs` selects the files): P5.12b.

## Deviations from contract/ADR (file:line each)

- The update flow names its new version instead of updating to the latest: `dotnet package add` without
  `--version` and with `--no-restore` writes `Version="*"` (probe above; new 2.0 gotcha row).
- `v2Support.ts` is a helper beside the tests the row names.

## Advisor decisions (date, item, question, answer verbatim)

- None for P5.12a (no stop-and-ask trigger; the ⚑ of P5.12 is for deleting a legacy test, which this row does not do).

## Exact next step (one item ID)

P5.12b, after the P5.12a CI run is green.

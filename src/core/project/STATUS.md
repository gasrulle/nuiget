# STATUS — src/core/project   commit 7b84421 (parent of the P2.5 commit)   2026-10-12T17:08:57Z

git status --short src/core/project: `?? src/core/project/context.ts`, `?? src/core/project/context.test.ts`,
`?? src/core/project/revision.ts`, `?? src/core/project/revision.test.ts`, `?? src/core/project/__fixtures__/sdk8/`,
` M src/core/project/STATUS.md` (they belong to the P2.5 commit, together with ` M ARCHITECTURE.md`,
` M CHANGELOG.md`, ` M docs/plans/STATUS.md` and ` M docs/plans/findings-ledger.md`)

Items: **P2.5 `src/core/project/context.ts` and `revision.ts`** (the `ProjectExecutionContext` provider; this
commit), **P2.4 `inspector.ts` and `index.ts`** (⚑; `7b84421`), **P2.3 `references.ts`** (`ef96051`) and
**P2.2 `{xml,discovery,assets,central}.ts` through the salvage gate** (`1fa8f6e`). P2.5 touches no file of
the earlier items; `index.ts` is unchanged.

The quarry's `src/core/project/STATUS.md` was checked against its tree. It holds for `xml.ts`, `discovery.ts`,
`assets.ts` and the fixtures. It is stale on three points: it lists `central.ts` as not started, and the file
exists in the working tree (untracked, 126 lines); it says "no `.gitignore` change needed" because tests copy
assets into scratch directories, and the item orders a tracked `obj/` and the exception for it; and its
"28 util tests" predate P1.2. The quarry has no test for any of the four modules; all four test files are new.

## Verified by running

P2.5, on `7b84421`:

```text
The gates ran with DOTNET_ROOT set to the SDK directory and NUIGET_SDK_TESTS=1 (N48).
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0
baseline npx vitest run      → Test Files 70 passed (70) · Tests 2262 passed (2262)
quarry                       → no context.ts and no revision.ts; its Catalog.ts:153-155 fabricates the context
                               (configFiles: [], revision: ''), which is C-project-catalog-3
probe, SDK 10.0.401, macOS   → `dotnet nuget config paths` in a directory with a nuget.config whose parent has
                               one too: three lines, <dir>/App/NuGet.Config, <dir>/NuGet.Config,
                               ~/.nuget/NuGet/NuGet.Config; one path per line, nearest first, exit 0. The CLI
                               prints its own spelling of the file name on a case-insensitive file system.
                               The gated test `reads the config chain of the real SDK nearest first` is the
                               tracked form of this probe and runs on both CI platforms.
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output
npm run lint                 → exit 0
npx vitest run --project backend src/core/project/context.test.ts src/core/project/revision.test.ts
                             → Test Files 2 passed (2) · Tests 13 passed (13)   (item gate; the real-SDK test ran)
npx vitest run --project backend src/core/project → Test Files 8 passed (8) · Tests 127 passed (127)
npm test                     → Test Files 72 passed (72) · Tests 2275 passed (2275)
npx vitest run (no NUIGET_SDK_TESTS) → Tests 2273 passed | 2 skipped (2275)
npx vitest run --coverage    → exit 0 · All files 77.33 % statements, 67.29 % branches, 73.04 % functions,
                               78.8 % lines · context.ts 26 of 26 lines, revision.ts 16 of 16 ·
                               src/core/** 2166 of 2201 lines, 98.41 % (floor 85 %)
npm run bench                → Test Files 17 passed (17) · Tests 104 passed | 1 skipped (105)
npm run package:vsix         → exit 0 · Tests 2275 passed · DONE  Packaged: nuiget-v1.18.9.vsix (17 files,
                               529.24 KB)
npm run check:vsix           → check:vsix: OK
negative control             → five single mutations, each caught: sdk-too-old not reported (1 test fails),
                               disabled sources kept (1), the output of a failed command used (1), the
                               modification time left out of the revision (2), global.json not an input (2).
                               Both files were restored and compared (cmp) afterwards.
git status --short src/core/contracts.ts src/protocol docs/adr → empty (no contract change, no sentinel)
git diff --stat 7b84421 -- src/core/project → STATUS.md only; the other files of the item are new
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P2.5
```

P2.4, on `ef96051`:

```text
The gates ran with DOTNET_ROOT set to the SDK directory and NUIGET_SDK_TESTS=1 (N48).
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0
baseline npx vitest run      → Test Files 69 passed (69) · Tests 2237 passed (2237)
quarry                       → no inspector.ts and no index.ts in its src/core/project; written from the plan row
                               and the ruling below
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output
npm run lint                 → exit 0
npx vitest run --project backend src/core/project → Test Files 6 passed (6) · Tests 114 passed (114)
one run per title (-t)       → the eight titles of the plan row and `unsupported: malformed central props is
                               parse-failed, not isCpm false`: each "1 passed | 24 skipped (25)"
npm test                     → Test Files 70 passed (70) · Tests 2262 passed (2262)
npx vitest run --coverage    → exit 0 · All files 77.24 % statements, 67.21 % branches, 72.88 % functions,
                               78.71 % lines · inspector.ts 155 of 156 lines (:353) ·
                               src/core/** 2124 of 2159 lines, 98.38 % (floor 85 %)
npm run bench                → Test Files 17 passed (17) · Tests 104 passed | 1 skipped (105)
npm run package:vsix         → exit 0 · Tests 2262 passed · DONE  Packaged: nuiget-v1.18.9.vsix (17 files,
                               529.16 KB)
npm run check:vsix           → check:vsix: OK
negative control             → nine single mutations of inspector.ts, each caught by the 25 tests: a malformed
                               central props file swallowed (1 test fails), a conditioned central entry taken
                               as central (1), every Update applied (2), excluding conditions not dropped (1),
                               no dedupe (1), a path in definedIn of a project row (5), VersionOverride
                               honoured outside CPM (1), no per-framework lookup (1), unknown conditions
                               accepted (3). The file was restored and compared (cmp) afterwards.
grep -n 'export \*\|__fixtures__' src/core/project/index.ts → no output
grep -rn 'Thenable\|child_process\|from .vscode.' src/core/project --include='*.ts' → no output
git diff --stat ef96051 -- src/core/project → STATUS.md only; inspector.ts, inspector.test.ts and index.ts are new
git status --short src/core/contracts.ts src/protocol docs/adr → empty; .claude/.contract-change does not exist
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → run 38281221752 for 7b84421: success on all required jobs
```

P2.3, on `74178f2`:

```text
The gates ran with DOTNET_ROOT set to the SDK directory and NUIGET_SDK_TESTS=1 (N48).
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0
baseline npx vitest run      → Test Files 68 passed (68) · Tests 2228 passed (2228)
source                       → src/services/NuGetProjectService.ts:235-282 (1.x); the quarry has no references.ts
1.x on this platform         → node: path.normalize(path.resolve('/src/App', '..\\Lib\\Lib.csproj')) is
                               '/src/App/..\\Lib\\Lib.csproj' on macOS: a backslash reference does not resolve (N53)
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output
npm run lint                 → exit 0
npx vitest run --project backend src/core/project/references.test.ts → Tests 9 passed (9)   (item gate)
npx vitest run --project backend src/core/project → Test Files 5 passed (5) · Tests 89 passed (89)
npm test                     → Test Files 69 passed (69) · Tests 2237 passed (2237)
npx vitest run --coverage    → exit 0 · All files 76.91 % statements, 66.67 % branches, 72.51 % functions,
                               78.39 % lines · references.ts 28 of 28 lines ·
                               src/core/** 1969 of 2003 lines, 98.30 % (floor 85 %)
npm run bench                → Test Files 17 passed (17) · Tests 104 passed | 1 skipped (105)
npm run package:vsix         → exit 0 · Tests 2237 passed · DONE  Packaged: nuiget-v1.18.9.vsix (17 files,
                               529.06 KB)
npm run check:vsix           → check:vsix: OK
git status --short src/core/contracts.ts src/protocol docs/adr → empty (no contract change, no sentinel)
git diff 74178f2 -- src/core/project (without references.* and STATUS.md) → empty
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → run 38277865396 for ef96051: success on all required jobs
```

P2.2, on `d7a5d8b`:

```text
The gates ran with DOTNET_ROOT set to the SDK directory and NUIGET_SDK_TESTS=1 (N48).
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0, no output
baseline npx vitest run      → Test Files 64 passed (64) · Tests 2148 passed (2148)
copy from the quarry tree    → cmp: xml.ts, discovery.ts, assets.ts, central.ts and __fixtures__/scratch.ts
                               identical; diff -r of the fixture directories (assets, cpm, legacy, pkgconfig,
                               props, sdk): identical
unmodified copy              → npm run check-types exit 0 · npx eslint src/core/project exit 0 · no tests exist
                               · grep Thenable, vscode, child_process in src/core/project: no match
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output
npm run lint                 → exit 0
npx vitest run --project backend src/core/project → Test Files 4 passed (4) · Tests 80 passed (80)   (item gate)
npm test                     → Test Files 68 passed (68) · Tests 2228 passed (2228)
npx vitest run --coverage    → exit 0 · All files 76.85 % statements, 66.63 % branches, 72.42 % functions,
                               78.33 % lines · project: xml.ts 54 of 55 lines (:58), assets.ts 138 of 143
                               (:83, :94, :179, :258, :307), central.ts and discovery.ts 100 % ·
                               src/core/** 1941 of 1975 lines, 98.28 % (floor 85 %)
npm run bench                → Test Files 17 passed (17) · Tests 104 passed | 1 skipped (105)
npm run package:vsix         → exit 0 · Tests 2228 passed · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 529 KB)
npm run check:vsix           → check:vsix: OK
diff against the quarry      → discovery.ts unchanged; xml.ts 6 changed lines (rootProject); central.ts 18
                               (conditioned); assets.ts 29 added lines (getResolvedVersionsByFramework)
git check-ignore src/core/project/__fixtures__/cpm/App/obj/project.assets.json → exit 1: not ignored
git status --short src/core/project/__fixtures__/.scratch → empty after the test run (the directory holds
                               only its own `.gitignore` with `*`)
secrets and paths in fixtures → grep for Users, home, token, password: three lines of project.assets.json
                               with the placeholder `C:\Users\testuser\…` (synthetic, as in the quarry)
git status --short src/core/contracts.ts src/protocol docs/adr → empty (no contract change, no sentinel)
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → run 38274861212 for 1fa8f6e: red in E2E (1.85.0) on N44 (third sighting), green
                               after gh run rerun --failed; the warm-up step followed as 74178f2
```

## Done (tested)

- `context.ts`, new (P2.5): `ProjectContextProvider({ runner, sources, stopDirs?, logger? }).get(projectPath,
  workspaceFolder?)` answers `{ context, unsupported? }`.
  - `sdk` from `runner.sdkVersion(projectDir)`; when it is not `supported` the answer carries `unsupported: {
    reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' }` and the context is still complete,
    because the project stays readable (D13). An SDK that cannot be detected leaves `sdk` out and is not
    `unsupported`.
  - `configFiles` from `dotnet nuget config paths` with the project directory as working directory: one
    path per line, nearest first. A failed, cancelled or timed-out command, or one that cannot be started,
    gives `[]` and a redacted warning.
  - `sourceUrls`: the URLs of the enabled sources of `SourceProvider.listSources(projectDir)`, in its
    order. A failure of the provider rejects `get`.
  - `revision`: `computeRevision(revisionInputs(...))`.
- `revision.ts`, new (P2.5): `revisionInputs(projectPath, configFiles, stopDirs?)` lists the project, the
  nearest `Directory.Build.props`, `Directory.Build.targets` and `Directory.Packages.props`, the nearest
  `global.json` and the config files, each once; `computeRevision(files)` is 16 hex digits of a SHA-256
  over path, modification time and size of each file, independent of the order, with a missing file
  counted as missing. It reads no contents and never rejects.
- `context.test.ts` (8 tests) with a fake `dotnet` that, like the real one, takes the SDK from the nearest
  `global.json`: `pins SDK 8 through global.json and reports sdk-too-old` uses the new fixture
  `__fixtures__/sdk8/` (`global.json` with 8.0.425, one project) and the fake, not the real SDK. One test,
  gated by `NUIGET_SDK_TESTS`, runs the real SDK: `reads the config chain of the real SDK nearest first`.
  `revision.test.ts` (5 tests).
- `inspector.ts`, new (P2.4): `StaticProjectInspector({ assets, stopDirs })` implements `ProjectInspector`.
  `inspect(projectPath)` never rejects and always answers `fidelity: 'provisional'`.
  - Unsupported projects (`inspector.ts:82-103`): a missing file is `not-found`; a `packages.config` beside
    the project is `packages-config`; a project that `classifyProject` does not call `sdk-style` is
    `non-sdk-style`; a read or parse failure of the project file, of the nearest `Directory.Build.props` or
    of the nearest `Directory.Packages.props` is `parse-failed`. The result is `{ projectPath, packages: [],
    fidelity, isCpm: false, unsupported }`; the four messages are `UNSUPPORTED_MESSAGES`.
  - CPM (`:107-121`): `ManagePackageVersionsCentrally` read from Build.props, then Packages.props, then the
    project, the last definition winning; `isCpm` needs the props file and the value `true`, otherwise
    `centralPropsPath` is absent. Only the nearest props file counts.
  - References (`collect`, `:193-226`): the nearest `Directory.Build.props` first, then the project, in
    document order. `Include` may be a `;` list; globs and MSBuild expressions are skipped. `Update` changes
    earlier rows of that id and is dropped without one. `Version` and `VersionOverride` as attribute or
    child element; `IsImplicitlyDefined`.
  - Conditions (`conditionOf`, `:255-271`; `updateApplies`, `:233-253`): `'$(TargetFramework)' == 'x'` on
    the item or its group limits the row to that framework; two that exclude each other drop the row; any
    other condition makes the row `unresolved`. A guarded `Update` applies when it covers the frameworks of
    the row, is ignored when it shares none, and otherwise makes the row `unresolved`.
  - Declaration (`describe`, `:282-306`): `unresolved` rows have `version: ''` and `versionType:
    'unresolved'`; `central-override` for a `VersionOverride` in a CPM project; `project` or `props` after
    the file of the last version write; `central` from the nearest props file; a conditioned central entry,
    a missing one and a `$(Property)` anywhere are `unresolved`. `definedIn` names the file that declares
    the item when that is `Directory.Build.props`, and the central props file for a central version.
  - Rows are merged on `lowerId|version|declaration|isImplicit`; a row that covers every declared framework
    has no `targetFrameworks`. `resolvedVersion` is the version restored for the row's first framework, else
    for any framework, else from the lock file.
- `inspector.test.ts`, 25 tests. The eight titles of the plan row: `cpm: versionless reference resolves
  central version`, `cpm: exact central pin surfaces as versionType exact`, `cpm: override wins and is marked
  central-override`, `cpm: missing central entry is unresolved`, `props: Directory.Build.props reference is
  declared props`, `tfm: condition captured and intersected`, `unsupported: packages.config`, `unsupported:
  non-sdk-style`; and from the ruling `unsupported: malformed central props is parse-failed, not isCpm
  false`, the conditioned central entry, the nearest props file only, the `multitfm` fixture, the four
  messages, `not-found`. Further: CPM switched off and on through the three files, overrides switched off,
  `Include` lists, the four cases of a guarded `Update`, unknown declared frameworks, the three sources of
  `resolvedVersion`.
- `index.ts`, new: named exports of the six modules (`assets`, `central`, `discovery`, `inspector`,
  `references`, `xml`); the parser's helpers `isObject`, `asArray` and `textOf` and everything under
  `__fixtures__` are not exported.
- `references.ts`, new (P2.3), two functions ported from 1.x:
  - `getProjectReferences(projectPath)`: the absolute paths of the `<ProjectReference Include>` items, in
    document order, without duplicates. Read with `xml.ts` instead of the 1.x regular expression, so a
    commented-out item does not count and single-quoted attributes do; `Include` may be a `;` list; an entry
    with a wildcard or an MSBuild expression is skipped; `Update` and `Remove` are ignored; conditions are
    not evaluated. Backslash paths are converted with `fromMsBuildPath` before they are resolved (N53). A
    file that cannot be read or parsed has no references, as in 1.x.
  - `getProjectDependencyMap(projectPaths)`: project → referenced projects among the given ones, without
    self-references, keys and values normalized with `normalizeProjectPath`, read 24 at a time.
- `references.test.ts`, 9 tests, among them the three the item names: `maps a diamond, with normalized keys
  and values, so that dependencies order first`, `keeps both edges of a cycle, and the sort still returns
  every project once`, `gives a missing file an empty entry and drops references to it and to projects
  outside the set`. The diamond and the cycle are checked through `topologicalSortByDependency`, the sort
  the bulk workflows use.
- `xml.ts`: `parseMsBuildXml` (validates first, strips a byte order mark, throws `XmlParseError` with file and
  line), `rootProject`, `elements`, `attr` (any case, exact spelling first), `childText`, `textOf`,
  `lastPropertyValue`, `asArray`, `isObject`. One change: `rootProject` returns `{}` for `<Project></Project>`,
  which the parser reads as an empty string (N52).
- `discovery.ts`, unchanged: `findProjects` (one search, duplicates dropped by normalized path, order by name
  then path, deepest containing workspace folder) and `classifyProject` (`sdk-style`, `legacy`,
  `packages-config`, `unknown`).
- `assets.ts`: `AssetsReader` (`read` with a cache keyed by path, valid while the mtime is unchanged and for
  30 s, five documents at most; `getResolvedVersions`; `getPackageDependencies`; `getTransitivePackages` with
  error buckets), `computeTransitiveFrameworks`, `assetsPathFor`, `lockFilePathFor`. Added, as the item orders:
  `getResolvedVersionsByFramework(projectPath)` → framework → lower-cased id → version, from `targets`;
  a runtime-specific target counts for its framework, project-type entries are skipped, and the result is
  empty without restore output (`assets.ts:140-168`).
- `central.ts`: `findCentralPropsPath`, `findNearestFile`, `findFilesUpwards`, `nearestStopDir`,
  `parseBooleanProperty`, `parseCentralPackageVersions`. Changed, as the item orders: an entry carries
  `conditioned`, true when the item or its `ItemGroup` has a `Condition`, or when it updates an entry that
  has; an unguarded `Include` after a guarded one is not conditioned, because it applies last
  (`central.ts:11-21`, `:116-134`).
- Tests, 80 in four files (item gate: tests green, and no test reads an untracked capture):
  - `xml.test.ts` (18): the named cases `reads a document that starts with a byte order mark`, `throws
    XmlParseError for malformed XML, with the file and the line`, `reads a version from the attribute and from
    the child element`, `returns the last definition across property groups` (`lastPropertyValue`); and the
    rest of the module.
  - `discovery.test.ts` (21): the `classifyProject` table of 16 rows, the fixtures, `findProjects`.
  - `central.test.ts` (20): `returns a Condition-guarded entry as conditioned, with the last value written`,
    the fixtures (`Pinned` is `[1.0.0]`), the walk upwards with stop directories, `parseBooleanProperty`.
  - `assets.test.ts` (21): the named cases `finds the roots of packages in a cyclic graph` and `takes the
    union of assets file and lock file, and the assets file wins`; `getResolvedVersionsByFramework`; the
    cache; the error buckets.
- Fixtures, as the item orders: `.gitignore` gained `!src/core/project/__fixtures__/**/obj/`;
  `assets/project.assets.json` moved, unchanged, to `cpm/App/obj/project.assets.json`, so the reader finds it
  beside the project; `cpm/Directory.Packages.props` gained `<PackageVersion Include="Pinned"
  Version="[1.0.0]" />` and `cpm/App/App.csproj` a versionless `Pinned` reference; the quarry's untracked
  `.scratch/probe` project (two target frameworks, CPM, a `VersionOverride`, a conditioned group, a
  `Directory.Build.props` reference) is tracked as `multitfm/`, identical.
- `__fixtures__/scratch.ts`, unchanged: `fixture()`, and `createScratchDir`/`writeTree`/`copyFixture` for the
  tests that need a writable project directory. Scratch directories are created by the test, under
  `__fixtures__/.scratch`, whose own `.gitignore` hides them; no test reads a file that another run or a
  person left there.

## Done (untested)

- `multitfm/` has no restore output and no test of its own beyond classification, the central entries and the
  props lookup: it is the fixture for the inspector's rules (P2.4) and the evaluator (P6.2).
- `cpm/App/obj/project.assets.json` does not list `Pinned`: the item says to move the file, not to change it.
  P2.4's rule for `resolvedVersion` falls back to nothing for that reference.
- The lines without a test are listed by the coverage run above.
- `context.ts` and `revision.ts` are not exported from `index.ts`: the row of P2.4 limits that file to six
  modules and the row of P2.5 does not name it. The first importer (P2.8 or P2.9) imports them directly or
  extends the barrel in its own item.
- Nothing outside the directory imports the modules yet. `getProjectDependencyMap` is what the host passes to
  `PackageWorkflows` as `projectDependencies` (P2.9).

## Not started

- `evaluator.ts` (P6.2), `mutator.ts` (P6.3).

## Deviations from contract/ADR (file:line each)

- The contract has no type for the provider or its answer. `ProjectContextResult { context, unsupported? }`
  (`context.ts:14-18`) is this item's shape for "`!supported` → project `unsupported: 'sdk-too-old'`": the
  context itself has no such field, and `InstalledResult.unsupported` belongs to whoever combines the
  context with an inspection (P2.8).
- The argv of `dotnet nuget config paths` is a constant in `context.ts:22`, not a builder in
  `src/core/cli/commands.ts`: it has no argument to validate, and the row does not name that file.
- `get` rejects when the source provider does (`context.ts:39-43`); SDK detection and the config chain
  degrade to an absent `sdk` and to `[]`. An empty source list would say "no sources", which is a
  different fact from "unknown" (the rule of P4.8, applied here).
- The revision covers the nearest props and targets files, not every file a project imports: explicit
  `<Import>`s are not followed, as in the inspector. `global.json` is looked for up to the filesystem
  root (the SDK does), the props and targets files up to the stop directory (`revision.ts:19-36`).
- On a case-insensitive file system the CLI reports `NuGet.Config` for a file named `nuget.config`; the
  paths are passed on as reported.
- `definedIn` (`inspector.ts:282-306`). The plan row writes "`definedIn` = project" for a `VersionOverride`;
  by the ruling that names the project file, which `src/protocol/domain.ts:57` encodes as an absent field.
  Beyond the ruling's cases: a row whose item is declared in `Directory.Build.props` always names that file,
  also when it is `central-override` or `unresolved`, because the domain comment defines the field as the
  file that declares the item; the ruling's step 8 says "undefined" for `central-override` with the
  fixtures in mind, where the item is in the project.
- `VersionOverride` counts only in a CPM project (`inspector.ts:289`); outside one it is ignored and the
  `Version` decides. The ruling does not state the case; the domain comment defines `central-override` as
  "CPM project with a `VersionOverride`". A central version that contains `$(` is `unresolved` as well.
- Two fixtures show what a restore would refuse with NU1008 (a `Version` on a reference in a CPM project):
  `xunit` in `cpm/Lib/Lib.csproj` and `StyleCop.Analyzers` in `multitfm/Directory.Build.props`. The
  inspector reports them as written (`project`, `props`), as the plan row decides.
- `ImportDirectoryBuildProps=false` and `ImportDirectoryPackagesProps=false` are not honoured at tier 1,
  and neither `Directory.Build.targets` nor an explicit `<Import>` is read.
- `resolvedVersion` falls back to `AssetsReader.getResolvedVersions`, which also reads the lock file; the
  plan row says "else from `libraries`". The `targets` of an assets file key `netstandard2.0` as
  `.NETStandard,Version=v2.0`, so a row for such a framework always reaches the fallback; mapping the
  monikers belongs to `assets.ts` (N19).
- A malformed or unreadable props file makes the whole project `parse-failed` (ruling, J): reporting it
  without the file could show a CPM project as an ordinary one, and the workflows refuse CPM edits on
  that flag (D7).
- `conditioned` is a required member of `CentralPackageVersion` (`central.ts:20`), and what it means for an
  `Update` and for a later unguarded `Include` is this item's reading of "returns `Condition`-guarded
  `PackageVersion` as `conditioned`"; the test with that title pins the six cases.
- `getResolvedVersionsByFramework` does not consult the lock file (`assets.ts:140-168`); the item says "from
  `targets`". `getResolvedVersions` still does.
- `rootProject` (`xml.ts:63-70`): the empty-project case is beyond the item. Without it a props file that
  consists of `<Project></Project>` read as "no project root" (N52).
- Read as the module behaves, and pinned by tests: an empty document is malformed (`XmlParseError`); a
  valueless attribute is malformed, because the validator runs without `allowBooleanAttributes` although the
  parser has it (`xml.ts:32-43`, `:51-54`); an empty child element has the text `''`, not `undefined`.
- `classifyProject` is a text test with regular expressions, not a parse (`discovery.ts:58-88`): an XML
  comment that contains `<Import Sdk=` would classify as `sdk-style`. Quarry behaviour, unchanged; the
  inspector (P2.4) parses the file anyway.
- No bench: the item names none (`computeTransitiveFrameworks` gets one with P2.12 if wanted).
- `references.ts` differs from the 1.x code it is ported from in what it reads (`references.ts:19-46`): XML
  instead of a regular expression, `;` lists, no unresolvable entries, no duplicates, and for malformed XML
  nothing where the 1.x expression would still have matched. The two signatures and the shape of the map
  are those of 1.x; they are free functions, not methods of a service.

## Advisor decisions (date, item, question, answer verbatim)

P2.2, P2.3 and P2.5 are not ⚑ and no stop-and-ask trigger fired for them; no consultation of the
`architecture-advisor` took place for them.

2026-10-12, P2.4, ⚑. Brief in the form of plan §2.4, sent on `labs/2.0` @ `ef96051` before any code was
written. It listed what P2.2 and P2.3 provide and asked eleven questions where the plan row does not decide
or a fixture meets two rules: A a conditioned central entry; B `$(Prop)` in a version and what is not a
package id; C a `Directory.Build.props` reference with a `Version` in a CPM project; D which props files are
read; E the declared target frameworks; F `resolvedVersion` for a row without a framework; G the dedupe and
`BenchmarkDotNet`; H `Update`, plain and guarded; I the order of the result and the messages; J failures
beside the project file; K `export *`. Answer of the `architecture-advisor`, verbatim:

````text
DECISION: Implement the brief's readings with these corrections: C keeps `'props'` (confirmed) but `definedIn` follows the contract's wording, so `'project'` and `'central-override'` rows have `definedIn: undefined` (the row's "`definedIn` = project" names the file, which `domain.ts:57` encodes as omission); H uses a four-way rule for a conditioned `Update` (covers → apply, disjoint → ignore, partial or non-TFM condition → `'unresolved'`); J is stricter than the brief: a read error or `XmlParseError` on the project file, the nearest `Directory.Build.props` or the nearest `Directory.Packages.props` all give `unsupported: 'parse-failed'`; K uses named export lists, not `export *`. Nothing is the owner's; no `OWNER MUST DECIDE`. No fixture contradicts the row.

WHY: The brief describes the tree accurately (`xml.ts`, `central.ts:107-136`, `assets.ts:104-168`, `references.ts:12,31-35`, `discovery.ts:72-88`, the thirteen fixture files, `contracts.ts:311-314`, `domain.ts:13-81`); its only two inaccuracies are the assumption that `export *` is the convention (all eight sibling barrels in `src/core/*/index.ts` are named lists) and the reading of "`definedIn` = project" as a path. `domain.ts:49` fixes `version` to `''` for every unresolved row and `domain.ts:57` fixes `definedIn` to non-project files only, which decides A, B, G and the override case without a contract change. ADR-004 line 27 routes `$(Prop)` and unknown conditions to `'unresolved'` and lines 24-26 give an imported-props reference `'props'`, which decides C and H (silently ignoring a conditioned `Update` would report a version the ADR says must be unresolved). J follows D7: P2.9's tracker rows (`docs/plans/STATUS.md:45,221`) let the host feed `isCpm` from this inspector into the CPM add/update refusal of P1.10, so a malformed `Directory.Packages.props` whose only `ManagePackageVersionsCentrally` is in that file must not flip the project to `isCpm: false`; the row's "`XmlParseError` → `parse-failed`" is not restricted to the project file, and MSBuild fails evaluation on any malformed automatic import, so `parse-failed` is also the accurate description. The rule "reference with `Version` in a CPM project → `'project'`" is decided by the row and reported as written; the fixtures `cpm/Lib/Lib.csproj` (xunit 2.8.0) and `multitfm/Directory.Build.props` (StyleCop) would fail a real restore with NU1008, which is a note for STATUS, not a contradiction of a tier-1 rule.

DO:
1. `StaticProjectInspector` constructor `{ assets: AssetsReader; stopDirs?: readonly string[] }`; `inspect(projectPath)` never rejects (wrap the whole body; any unexpected error becomes `parse-failed`).
2. Order of checks: (a) `fs.promises.readFile(projectPath, 'utf-8')`; `ENOENT` or `ENOTDIR` → `not-found`, any other error → `parse-failed`. (b) `classifyProject(projectPath, text, await fileExists(path.join(projectDir, 'packages.config')))` on the raw text: `packages-config` → `packages-config`; `legacy` or `unknown` → `non-sdk-style`. (c) parse the project file, then `findNearestFile(projectDir, BUILD_PROPS_FILE, stopDirs)` and `findCentralPropsPath(projectDir, stopDirs)`, reading and parsing each file that exists. An `XmlParseError` or read error on any of the three → `parse-failed`. Unsupported result is exactly `{ projectPath, packages: [], fidelity: 'provisional', isCpm: false, unsupported: { reason, message } }` with no `centralPropsPath`.
3. Export `UNSUPPORTED_MESSAGES` with these exact values and assert them in the tests: `packages-config` → `packages.config projects are not supported`; `non-sdk-style` → `only SDK-style projects are supported`; `parse-failed` → `the project file or an imported props file could not be read or parsed`; `not-found` → `the project file was not found`. No path and no parser detail in the message (`projectPath` already names the file).
4. CPM: `isCpm` = central props file found AND `parseBooleanProperty(lastPropertyValue(...ManagePackageVersionsCentrally))` is `true`, read Build.props → Packages.props → project, last defined wins; otherwise `isCpm: false` and `centralPropsPath` undefined even when the file exists. `CentralPackageVersionOverrideEnabled` is read through the same chain, default `true`. Central entries only through `parseCentralPackageVersions` of the nearest file (`cpm/Nested/Inner`: Serilog has no entry in `cpm/Nested/Directory.Packages.props` → `'unresolved'`, `version: ''`).
5. Collect `PackageReference` items in document order: nearest `Directory.Build.props` first (if found), then the project; nothing from `Directory.Build.targets` or explicit `<Import>`s (D). Each row records its declaring file. `Include` is split on `;`, trimmed, empty parts dropped, and any part matching `/[*?]|\$\(|@\(|%\(/` is skipped (the `references.ts:12` precedent; include `?`); every surviving part gets its own row with the same metadata. `Version` is the attribute or the child element (`attr(item,'Version') ?? childText(item,'Version')`), likewise `VersionOverride`; `isImplicit` is `true` only when `IsImplicitlyDefined` (attribute or child) parses to `true`, else omitted.
6. Conditions (item AND its `ItemGroup`): a condition matching `^\s*'\$\(TargetFramework\)'\s*==\s*'([^']+)'\s*$` yields a TFM set `[x]` (trimmed, compared case-insensitively, written text kept); nested TFM sets intersect; empty intersection → row dropped (`Microsoft.Bcl.AsyncInterfaces`); any other condition text, including reversed operands, `!=`, `Or`, `$(Configuration)` → the row is `'unresolved'` while any captured TFM set is still kept.
7. `Update` (same `Include` splitting, same conditions): applies to every earlier row of that id, document order across Build.props then project; changes only `Version`, `VersionOverride` and `IsImplicitlyDefined`, never the TFM set. No earlier row → dropped (`Ghost.Package`; an `Update` that precedes the `Include` of the same id is also dropped). An unconditioned `Update` sets the row's version-declaring file to the `Update`'s file. A conditioned `Update`: TFM set covers the row's effective set → apply; no overlap → ignore; partial overlap, or any non-TFM condition, or a row whose effective set is unknown (E) → row `'unresolved'`. Result for the fixtures: `Newtonsoft.Json` 13.0.1 `'project'` in `sdk/`; `Microsoft.SourceLink.GitHub` 8.0.1 `'project'`, `definedIn` = `props/Directory.Build.props` in `props/`.
8. Declaration and version per row, after Updates (invariant: `declaration === 'unresolved'` implies `version === ''` and `versionType === 'unresolved'`; `resolvedVersion` is still filled): `Version` or `VersionOverride` containing `$(` → `'unresolved'` (`Serilog` in `sdk/`); `VersionOverride` present and overrides enabled → `'central-override'`, `version` = override, `definedIn` undefined (`cpm/Lib` Serilog 3.1.1, `multitfm` Serilog); `VersionOverride` with overrides disabled → `'unresolved'`; `Version` present → `'project'` when the last version write is in the project file, `'props'` when it is in Build.props (`definedIn` = Build.props path; `multitfm` StyleCop is `'props'` 1.2.0-beta.556, `cpm/Lib` xunit is `'project'` 2.8.0); no version and `isCpm` with a central entry: `conditioned: false` → `'central'`, `version` = central text, `definedIn` = the PackageReference's file when that is Build.props, else the central props path; `conditioned: true` → `'unresolved'`, `definedIn` = central props path (A); no version otherwise (non-CPM, or no central entry) → `'unresolved'`, `version: ''`, `definedIn` = Build.props when declared there, else undefined. `versionType`, `floatingPrefix`, `isAlwaysLatest` come from `toDomainSpec(parseVersionSpec(version))` (`Pinned` `[1.0.0]` → `'exact'`, `Humanizer` `2.*` → `'floating'`; invalid text such as `Version="abc"` keeps the text, `'project'`, `versionType: 'unresolved'`); for an unresolved declaration set `versionType: 'unresolved'` directly.
9. Declared TFM set (E): project `TargetFrameworks` (split `;`, trim, drop empty) if non-empty, else project `TargetFramework`, else the same two from Build.props; a value containing `$(` or no value at all → unknown. With a known set, a row whose captured TFMs cover every declared TFM (case-insensitive) → `targetFrameworks: undefined`; unknown set → captured TFMs kept as written; a TFM not in the declared set is kept as written.
10. Dedupe after Updates and declaration assignment, before the coverage collapse: key `lowerId|version|declaration|isImplicit`, merging `targetFrameworks` (union, case-insensitive, first spelling kept; a row with undefined TFMs absorbs the other). `sdk/`: Polly one row with `targetFrameworks: undefined`; `System.Text.Json` two rows (8.0.5 `['net6.0']`, 9.0.0 `['net8.0']`); `BenchmarkDotNet` `'unresolved'`, `version: ''`, no `targetFrameworks`. Output order = first occurrence in document order (props rows first); do not sort.
11. `resolvedVersion` (F): `getResolvedVersionsByFramework(projectPath)` looked up for the row's first TFM (undefined TFMs → the first declared TFM); when the TFM set is unknown or the framework has no entry for the id → `getResolvedVersions(projectPath)` (libraries, then lock file). Record in STATUS that the fallback is wider than the row's "from `libraries`" (same note as P2.2) and that assets `targets` key `netstandard2.0` as `.NETStandard,Version=v2.0`, so `multitfm`-style rows reach the fallback; do not add moniker mapping here (`assets.ts` is P2.2's file; N19 follow-up).
12. `index.ts`: named export lists in the sibling style for the six modules only (`xml`, `discovery`, `assets`, `central`, `references`, `inspector`); omit the parser's internal helpers (`isObject`, `asArray`, `textOf`) and nothing from `__fixtures__`.
13. Tests (`inspector.test.ts`) with the eight titles on these fixtures: `cpm: versionless reference resolves central version`, `cpm: exact central pin surfaces as versionType exact`, `cpm: missing central entry is unresolved` → `cpm/App` (Newtonsoft 13.0.3 `'central'`, `Pinned` exact, `Not.Central` unresolved, `isCpm: true`, `centralPropsPath` = `cpm/Directory.Packages.props`, `resolvedVersion` 13.0.3 for Newtonsoft from `obj/`); `cpm: override wins and is marked central-override` → `cpm/Lib`; `props: Directory.Build.props reference is declared props` → `props/Proj` (StyleCop `'props'` with `definedIn`; SourceLink per step 7); `tfm: condition captured and intersected` → `sdk/Sdk.csproj` (step 10); `unsupported: packages.config` → `pkgconfig/Old.csproj`; `unsupported: non-sdk-style` → `legacy/Legacy.csproj`. Add, via `writeTree` scratch directories: `unsupported: malformed central props is parse-failed, not isCpm false` (CPM project whose `Directory.Packages.props` is malformed → `reason: 'parse-failed'`, `isCpm: false`); a conditioned central entry (A); `cpm/Nested/Inner` nearest-props-only; `multitfm/App` (override, STJ `'project'` `['netstandard2.0']`, StyleCop `'props'`, no `obj/` → `resolvedVersion` undefined); `Ghost.Package` dropped; `$(SerilogVersion)`; `not-found` on a missing path; `unsupported.message` equality for all four reasons.
14. STATUS deviations to record: the `definedIn` reading of the row's "= project"; the NU1008 note on `cpm/Lib` xunit and `multitfm` Build.props StyleCop (reported as written per the row); `ImportDirectoryBuildProps`/`ImportDirectoryPackagesProps=false` not honoured at tier 1; the resolvedVersion fallback width; the netstandard target key.

DO NOT:
Do not keep `$(SerilogVersion)` or `0.13.12` as `version` on an unresolved row; `domain.ts:49` says `''`.
Do not set `definedIn` on `'project'` or `'central-override'` rows.
Do not ignore a conditioned `Update` or apply it unconditionally.
Do not let a malformed or unreadable `Directory.Packages.props` produce `isCpm: false` with packages; that bypasses D7.
Do not read `Directory.Build.targets`, explicit `<Import>`s, or expand any `$(`.
Do not touch `assets.ts`, `central.ts`, `xml.ts`, `discovery.ts` or `references.ts`; the inspector composes them.
Do not use `export *` or export anything from `__fixtures__`.
Do not add `obj/` or a lock file to `multitfm/`; its missing `resolvedVersion` is the test.
Do not put the parser's error text or a path into `unsupported.message`.

CONTRACT CHANGE: none. `src/core/contracts.ts`, `src/protocol/**` and `docs/adr/**` stay as they are; every ruling above is a reading of `domain.ts:13-81`, `contracts.ts:311-314` and ADR-004 lines 19-28 and 53-54.

VERIFY:
`npx vitest run --project backend src/core/project` → all files green, including `inspector.test.ts`; then one run per title, `npx vitest run --project backend src/core/project/inspector.test.ts -t "<title>"` for the eight row titles and `unsupported: malformed central props is parse-failed, not isCpm false` → each `1 passed`.
`npm run check-types` → exit 0; `npx eslint src` → exit 0, no output.
`git status --short src/core/contracts.ts src/protocol docs/adr` → empty; `ls .claude/.contract-change` → no such file.
`git diff --stat ef96051 -- src/core/project` → only `inspector.ts`, `inspector.test.ts`, `index.ts`, `STATUS.md` (plus `__fixtures__/scratch.ts` only if a helper is needed).
`grep -n 'export \*\|__fixtures__' src/core/project/index.ts` → no output; `grep -rn 'Thenable\|child_process\|from .vscode.' src/core/project --include='*.ts'` → no output.
`npm test` and `npm run bench` green; `npm run test:ui` may be marked `SKIPPED: no UI change`.

Files checked: /Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md; /Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md (lines 41-175, 221-238, 290-301); /Users/mattias/github/nuiget/docs/adr/004-project-model.md; /Users/mattias/github/nuiget/src/core/project/STATUS.md; /Users/mattias/github/nuiget/docs/plans/STATUS.md (rows P2.2-P2.5, P2.9, line 221); /Users/mattias/github/nuiget/docs/plans/findings-ledger.md (N19, C-project-catalog-1..6); /Users/mattias/github/nuiget/src/protocol/domain.ts (1-100); /Users/mattias/github/nuiget/src/core/contracts.ts (295-324); /Users/mattias/github/nuiget/src/core/project/xml.ts, central.ts, references.ts in full, assets.ts (95-168), discovery.ts (55-90); /Users/mattias/github/nuiget/src/core/versioning/VersionRange.ts (38-188); all thirteen files under /Users/mattias/github/nuiget/src/core/project/__fixtures__/{sdk,cpm,props,multitfm,legacy,pkgconfig} plus cpm/App/obj/project.assets.json (libraries and net8.0 target keys); the eight src/core/*/index.ts barrels; src/core/util/fs.ts and paths.ts exports; git status (clean) and git log -1 (ef96051).
````

The ambient advisor (L3) was consulted before the first edit of P2.2 and before the push of P2.2; the
ruling above was followed for P2.4, with the three readings beyond it that are listed under Deviations.

## Exact next step (one item ID)

P2.6 (⚑ `src/core/sources/**` minimal: `NuGetConfigReader`, `DotnetSourceProvider`, `DefaultOutboundPolicy`;
consult the `architecture-advisor` on the mapping semantics before writing code).

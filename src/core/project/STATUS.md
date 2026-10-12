# STATUS — src/core/project   commit 74178f2 (parent of the P2.3 commit)   2026-10-12T16:25:55Z

git status --short src/core/project: `?? src/core/project/references.ts`, `?? src/core/project/references.test.ts`,
` M src/core/project/STATUS.md` (they belong to the P2.3 commit, together with ` M ARCHITECTURE.md`,
` M CHANGELOG.md`, ` M docs/plans/STATUS.md` and ` M docs/plans/findings-ledger.md`)

Items: **P2.3 `src/core/project/references.ts` (`getProjectReferences`, `getProjectDependencyMap`, ported from
1.x) with tests** (this commit) and **P2.2 `src/core/project/{xml,discovery,assets,central}.ts` through the
salvage gate, with tests on fixtures** (`1fa8f6e`). P2.3 touches none of P2.2's files.

The quarry's `src/core/project/STATUS.md` was checked against its tree. It holds for `xml.ts`, `discovery.ts`,
`assets.ts` and the fixtures. It is stale on three points: it lists `central.ts` as not started, and the file
exists in the working tree (untracked, 126 lines); it says "no `.gitignore` change needed" because tests copy
assets into scratch directories, and the item orders a tracked `obj/` and the exception for it; and its
"28 util tests" predate P1.2. The quarry has no test for any of the four modules; all four test files are new.

## Verified by running

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
CI                           → see the tracker row of P2.3
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
- Nothing imports the modules yet; `index.ts` is P2.4's. `getProjectDependencyMap` is what the host passes to
  `PackageWorkflows` as `projectDependencies` (P2.9).

## Not started

- `inspector.ts` and `index.ts` (P2.4), `context.ts` and `revision.ts` (P2.5),
  `evaluator.ts` (P6.2), `mutator.ts` (P6.3).

## Deviations from contract/ADR (file:line each)

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

The item is not ⚑ and no stop-and-ask trigger fired: no frozen file, no test of another item, no fixture that
contradicts a tracked probe. No consultation of the `architecture-advisor` took place for it. The same
holds for P2.3. The ambient
advisor was consulted before the first edit (check the scratch capture before promoting it, measure the raw
copy first); both were done.

## Exact next step (one item ID)

P2.4 (⚑ `src/core/project/inspector.ts`: `StaticProjectInspector` with the decided rules of the plan row, and
`index.ts`). Consult the `architecture-advisor` before writing code.

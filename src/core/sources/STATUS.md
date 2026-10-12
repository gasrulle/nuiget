# STATUS — src/core/sources   commit 28fa9a7 (parent of the P2.6 commit)   2026-10-12T17:24:24Z

git status --short src/core/sources: `?? src/core/sources/` (belongs to the P2.6 commit, together with
` M src/core/cli/validate.ts`, ` M src/core/cli/validate.test.ts`, ` M ARCHITECTURE.md`, ` M CHANGELOG.md`,
` M docs/plans/STATUS.md` and ` M docs/plans/findings-ledger.md`)

Item: **P2.6 `src/core/sources/**` minimal: `NuGetConfigReader`, `DotnetSourceProvider`,
`DefaultOutboundPolicy`** (⚑ on mapping semantics), with N47 in `src/core/cli/validate.ts` by the ruling below.

The quarry has nothing tracked for this directory: only an untracked `src/core/sources/__fixtures__/.scratch/`
with captured config files, which plan §2.6 does not allow as evidence and which was not read. The modules are
a port of what 1.x does in `src/services/NuGetConfigParser.ts`, `NuGetSourceService.ts` and (for DPAPI)
`CredentialService.ts`, plus the package source mapping, which 1.x does not have.

## Verified by running

```text
The gates ran with DOTNET_ROOT set to the SDK directory and NUIGET_SDK_TESTS=1 (N48).
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0
baseline npx vitest run      → Test Files 72 passed (72) · Tests 2275 passed (2275)
capture, SDK 10.0.401, macOS → `dotnet nuget list source --format detailed` with the runner's fixed environment,
                               from a directory below one that holds __fixtures__/list-source/config.xml as
                               nuget.config: exit 0, seven lines, stored as __fixtures__/list-source/10.0.401.txt
                               with the directory replaced by {dir}. The user-level sources do not appear
                               (`<clear />`), the disabled source is marked [Disabled], the relative local
                               source comes back as an absolute path.
npx tsc --noEmit / npm run check-types → exit 0 / exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src / npm run lint → exit 0, no output / exit 0
npx vitest run --project backend src/core/sources src/core/cli → Test Files 10 passed (10) · Tests 188 passed
                               (188): 46 in src/core/sources (the gated real-SDK test ran) and 142 in
                               src/core/cli, three of them new   (item gate)
npm test                     → Test Files 77 passed (77) · Tests 2324 passed (2324)
npx vitest run (no NUIGET_SDK_TESTS) → Tests 2321 passed | 3 skipped (2324)
npx vitest run --coverage    → exit 0 · All files 77.83 % statements, 67.77 % branches, 73.98 % functions,
                               79.23 % lines · src/core/sources 97.89 % lines (configXml.ts 28 of 32,
                               DotnetSourceProvider.ts 68 of 69, the other modules complete) ·
                               src/core/** 2400 of 2440 lines, 98.36 % (floor 85 %)
npm run bench                → Test Files 17 passed (17) · Tests 104 passed | 1 skipped (105)
npm run package:vsix         → exit 0 · Tests 2324 passed · DONE  Packaged: nuiget-v1.18.9.vsix (17 files,
                               529.3 KB)
npm run check:vsix           → check:vsix: OK
negative control             → seven single mutations, each caught: mapping patterns unioned across files (1
                               test fails), `<clear />` ignored (5), fallback to all sources when the winner
                               is unavailable (2), an exact id ranked like a prefix (1), a failed listing
                               remembered (1), the password left in an error (1), the base64 check dropped (1).
                               The files were restored and compared afterwards.
grep -rln child_process src/core --include='*.ts' → only files under src/core/cli
grep -rn "nuget.org" src/core/sources --include='*.ts' (tests left out) → 0 lines
grep -rn "process.env" src/core/sources --include='*.ts' (tests left out) → the two `env` defaults:
                               NuGetConfigReader.ts (constructor) and DotnetSourceProvider.ts (constructor)
grep -c "private-only configuration never yields nuget.org" src/core/sources/*.test.ts → 1, in
                               DefaultOutboundPolicy.test.ts
git diff --stat 28fa9a7 -- src/core/cli → validate.ts and validate.test.ts only
git status --short src/core/contracts.ts src/protocol docs/adr → empty (no contract change, no sentinel)
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P2.6
```

## Done (tested)

- `configXml.ts`: `parseConfigXml` (fast-xml-parser with `preserveOrder`, validated first, a byte order mark
  stripped, `XmlParseError` of `src/core/project/xml.ts` for malformed input), `childrenNamed`, `attribute`.
  Nothing is converted and entities are not expanded.
- `NuGetConfigReader.ts`: `read(path)` (a missing file resolves `undefined`), `readChain(paths)`,
  `parse(text, path)` → `NuGetConfigDocument` with four sections in document order, each entry an item or the
  `<clear />` marker: `sources`, `disabled`, `credentials` and `mapping` (absent without the element).
  Credential element names are decoded from the `_xHHHH_` form; `%VAR%` is expanded in the user name and the
  clear-text password from the injected environment and stays literal when the variable is not set; `Password`
  is `encrypted`, `ClearTextPassword` is `clear` and wins when both are present. `decryptPassword` runs DPAPI
  through `runPowerShellEncoded`, on Windows only, after checking that the value is base64; it never rejects.
- `merge.ts`: `mergeConfigChain(documents nearestFirst)` with one rule for every section: farthest file first,
  a keyed entry replaces an earlier one of the same key whole, `<clear />` discards everything before it.
  `mapping` is `undefined` when no file configures one and an empty map when it was configured and cleared.
  `withConfigFiles(sources, merged)` names the nearest declaring file of each source.
- `mapping.ts`: `matchMapping(mapping, packageId)`: exact id over any prefix, longer prefix over shorter, `*`
  last, every source of the winning pattern, nothing without a match, case-insensitive.
- `DefaultOutboundPolicy.ts`: enabled candidates only; with a mapping only the sources of the winning pattern,
  and none when those are disabled or not among the candidates. No source is recognized by its address (N20).
- `listSourceOutput.ts`: `parseListSourceOutput` for the `detailed` listing; `isLocal` for an address that is
  not http(s).
- `DotnetSourceProvider.ts`: `listSources(projectDir)` through `runner.run(listSourceArgs(), { cwd })`, one
  listing per normalized directory, shared while in flight, kept until `invalidate()` or a mutation; a failed,
  timed-out or unstartable listing rejects and is not kept. `add` (names the source from its address when no
  name is given, creates a missing `--configfile` target, stores the password in clear text off Windows or when
  `storeEncrypted` is false), `remove`, `enable`, `disable` through the P1.6 builders; they never reject, return
  a redacted error without the password, and forget every listing whatever the outcome. `configFiles`.
- `index.ts`: named exports of the seven modules.
- Tests, 46 in five files, with every title of the ruling's step 15: `private-only configuration never yields
  nuget.org`; ten `mapping:` titles; four `merge:` titles (the `<clear />` one once per section); five `reader:`
  titles; three `dpapi:` titles; two `listing:` titles; ten `provider:` titles; and, gated by
  `NUIGET_SDK_TESTS`, `real SDK: a nested nuget.config with <clear /> hides the user-level sources`, which runs
  the fixture's configuration live and compares the parsed result with the parsed capture.
- N47, in `src/core/cli/validate.ts` (`:36`, `:45`, `:56`, `:71`): a package id, a source name and a plain local
  feed path may not start with `-`. Three tests with the titles of the ruling in `validate.test.ts`.

## Done (untested)

- `decryptPassword` has never run against real DPAPI: the tests inject `execFile`. The script tries the entropy
  `NuGet` first and no entropy second (N54); a Windows run with a password that the CLI encrypted is P7.3's.
- The mutations are tested with a fake `dotnet` only; no test adds a source through the real CLI.
- The merge rule is not checked against the SDK (see Deviations). The gated test covers `<clear />` in
  `packageSources` only, through the CLI's own listing.
- Nothing constructs the provider, the reader or the policy yet: the Catalog (P2.8) and the host (P2.9) do.

## Not started

- `src/core/credentials/**` (P2.7): the `Authorization` header, credential providers, caching.
- The policy per project context and `withConfigFiles` on the listed sources: P2.8.
- Source health monitoring, timers and a lifetime for the listing cache: not part of 2.0's provider.

## Deviations from contract/ADR (file:line each)

- The merge rule (`merge.ts:19-50`) is assumed from NuGet's merge of keyed sections and pinned by tests; no SDK
  probe backs it for `packageSourceMapping`, `disabledPackageSources` or `packageSourceCredentials`. Its
  direction is the safe one for ADR-005: replacing the patterns of a source can withhold a source, never add one.
- The plan row says "`listSourcesRaw` per project dir". That is a method of `DefaultDotnetRunner`, not of the
  `DotnetRunner` contract; the provider calls `runner.run(listSourceArgs(), { cwd })` (`DotnetSourceProvider.ts:72-78`).
- The provider never sets `NuGetSource.configFile`: it has no config chain. `withConfigFiles` does, for whoever
  has read the chain (`merge.ts:63-68`).
- A marker is the element `<clear />` spelled exactly so (`NuGetConfigReader.ts:126-127`): XML names are
  case-sensitive, and under `packageSourceCredentials` an element `<Clear>` is the credentials of a source of
  that name. Found by a test of this item.
- `disabledPackageSources` entries carry their value: a nearer `value="false"` re-enables what a farther file
  disabled (`merge.ts:27`, `:44`). The ruling describes the section as a set of names.
- A numbered line of the listing is never taken as the address of the source before it, whatever follows its
  name (`listSourceOutput.ts:5-6`, `:20`). Found by a test of this item.
- `suggestSourceName` replaces characters that a source name cannot hold and strips a leading `-`
  (`DotnetSourceProvider.ts:158-162`), so the name it proposes always passes `isValidSourceName`.
- `src/core/cli/STATUS.md` is not rewritten for the N47 change: the ruling limits the edits in that directory
  to `validate.ts` and `validate.test.ts`. This note and the ledger row of N47 record it.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-12, P2.6, ⚑ on mapping semantics. Brief in the form of plan §2.4, sent on `labs/2.0` @ `28fa9a7` before
any code was written, with eleven questions: A the precedence of mapping patterns; B a winning pattern whose
sources are unavailable; C joining by source name; D merging the chain and `<clear />`; E one policy per
project context; F the CLI listing against the XML as the truth, and the evidence for the listing format; G
credentials here against P2.7; H the scope of the provider; I N47 in `validate.ts`; J a parser of its own; K
the tests. Answer of the `architecture-advisor`, verbatim:

````text
DECISION: Confirm A, B, C, E, G, H, J and K with the corrections below; correct D (a nearer declaration of a source key replaces, it does not union), F (the provider never attributes `configFile`; attribution is a pure function over documents the caller has already read, and the tracked capture is required next to the gated test), and H (the provider must name a source itself when `name` is absent, because `nugetAddSourceArgs` requires `name`); approve I (N47 edits to `src/core/cli/validate.ts` and `validate.test.ts`, nothing else in `src/core/cli`). The brief omits three ledger findings assigned to P2.6 (N16, N20, N21); the item disposes of them as stated under DO. Nothing is the owner's. No contract change.

WHY: The brief matches the tree on every file I checked except two facts that change the design: the `DotnetRunner` contract (`src/core/contracts.ts:188-194`) exposes only `run`, `sdkVersion` and `clearSdkCache`, so the plan row's `listSourcesRaw` (`src/core/cli/DotnetRunner.ts:404-410`, a `DefaultDotnetRunner` method) is reachable through the contract only as `run(listSourceArgs(), { cwd })`; and `nugetAddSourceArgs` (`src/core/cli/commands.ts:40-42,162`) declares `name: string` while `SourceProvider.add` (`contracts.ts:283`) has `name?`, so a missing name must be resolved in the provider or the builder throws `InvalidArgumentError`. On D: NuGet merges every section the same way, keyed items (`key` compared case-insensitively) from a nearer file replace the farther item of the same key whole, distinct keys accumulate, and `<clear/>` discards everything accumulated before it (farther files and earlier elements of the same file); applying that rule to `packageSourceMapping` is also the safe direction for ADR-005 ("a package id is only sent to the sources enabled for the project that references it", `docs/adr/005:25-27`): a union would let an id reach a source the real restore would never use, a replacement at worst withholds a source the user can see in the file. On F: `ProjectContextProvider.configFiles` is private in `src/core/project/context.ts:71-82` and that file is not P2.6's (§2.1), the provider receives only `projectDir`, and ADR-005 names `dotnet nuget list source` with `cwd = projectDir` as the source of truth (`005:17-20`); plan §2.6 ("probe captures are promoted to tracked, redacted fixtures") and the existing `src/core/cli/__fixtures__/sdk-probes/10.0.401.json` set the shape of the evidence, while P2.5's gated test (`src/core/project/context.test.ts:183-193`) is the accepted precedent for the live half. The runner forces `DOTNET_CLI_UI_LANGUAGE=en` (`src/core/cli/DotnetRunner.ts:25-26,188`, tested at `DotnetRunner.test.ts:201`), which is what makes the `[Enabled]`/`[Disabled]` tokens of the listing deterministic (N16). On I: `docs/plans/findings-ledger.md:149,369` assigns N47 to P2.6 with the exact edits, the P1.10 ruling (`src/core/ops/STATUS.md:329-331,436`) deferred it here, `validate.ts` is not a frozen path, and `PACKAGE_ID_PATTERN` / `SOURCE_NAME_PATTERN` / `LOCAL_FEED_PATH_PATTERN` (`validate.ts:19-29`) do accept a leading `-`, so the finding is real. I could not reach Context7 from this session (the tool was not surfaced); the merge rule under D rests on NuGet's generic keyed-section merge as described above and is pinned by a test so a later probe can contradict it visibly.

DO:
1. Create `src/core/sources/` with exactly these modules and an `index.ts` that re-exports them: `configXml.ts` (parser), `NuGetConfigReader.ts`, `merge.ts` (`mergeConfigChain`), `listSourceOutput.ts` (parser of the `detailed` listing), `DotnetSourceProvider.ts`, `DefaultOutboundPolicy.ts`, `mapping.ts` (pure matcher), `STATUS.md`, `__fixtures__/`. Core rules apply: no `vscode` value import, no `child_process` (the provider spawns only through the injected `DotnetRunner`; `grep -rln child_process src/core --include='*.ts'` must still list only `src/core/cli/*`), `PromiseLike` only, no Node 20 API, no import from `src/services/**`.
2. `configXml.ts`: own `XMLParser` configuration, `preserveOrder: true`, `ignoreAttributes: false`, `processEntities: false`, `parseTagValue: false`, `parseAttributeValue: false`, `trimValues: true`, `ignoreDeclaration: true`; validate with `XMLValidator` first and strip a leading BOM before validating; throw `XmlParseError` imported from `../project/xml` (do not edit `src/core/project/xml.ts`). Document order is preserved so `<clear />` applies to the elements before it.
3. `NuGetConfigReader.read(path)` parses one file into `NuGetConfigDocument { path; sources: Array<{ key; value }>; disabled: string[]; credentials: Map<lowerName, { username?; password?; passwordKind: 'clear' | 'encrypted' }>; mapping?: Array<{ key; patterns: string[] }>; clears: { sources; disabled; credentials; mapping } }` where each section is a list of ordered entries including the position of any `<clear />`, so `merge.ts` can apply it. Simplest encoding: each section is `Array<{ kind: 'clear' } | { kind: 'item', ... }>` in document order. ENOENT resolves to `undefined` (the chain from `dotnet nuget config paths` lists existing files only); malformed XML rejects with `XmlParseError`. `readChain(paths nearestFirst)` maps `read` over the paths, dropping `undefined`.
4. Credential element names are decoded with the general `XmlConvert` form `/_x([0-9A-Fa-f]{4})_/g` → `String.fromCharCode(parseInt(h, 16))` (not only `_x0020_`), then matched to source names case-insensitively; no 1.x "underscore equals space" fuzzy match. `%VAR%` placeholders are expanded in clear-text values from an injected `env: Record<string, string | undefined>` (default `process.env`); an unset variable leaves the placeholder literal. `Password` → `passwordKind: 'encrypted'`, `ClearTextPassword` → `'clear'`; key comparison is case-insensitive. `decryptPassword(encrypted, { platform?, execFile?, timeoutMs? })` returns `undefined` on a non-win32 platform (no spawn), rejects nothing, validates the input against `/^[A-Za-z0-9+/]+={0,2}$/` before building the PowerShell script (the 1.x script at `src/services/CredentialService.ts:285` interpolated the raw value), and runs it only through `runPowerShellEncoded` from `src/core/cli`. The header, credential providers and caching stay in P2.7. No password, decrypted value or `%VAR%` content reaches a log, an error message or `onCommand`; redact with `src/core/logging` before any log line.
5. `merge.ts`: `mergeConfigChain(documents nearestFirst): MergedNuGetConfig { sources: Map<lowerKey, { key; url; configFile }>; disabled: Set<lowerKey>; credentials: Map<lowerName, Credential & { configFile }>; mapping?: Map<lowerSourceKey, string[]> }`. Algorithm, one rule for all four sections: process documents farthest first; walk each section in document order; `<clear />` empties that section's accumulator; a keyed item (`<add key>`, credential element name, `<packageSource key>`) sets the accumulator entry for its lower-cased key, replacing any earlier entry whole (a `<packageSource>`'s pattern list is replaced, not unioned); `mapping` is `undefined` when no document has a `<packageSourceMapping>` element, and an empty `Map` when the element exists but ends up empty (that is "mapping configured, nothing allowed"). `configFile` is the path of the document that produced the surviving entry, which is the nearest declaring file.
6. `mapping.ts`: `matchMapping(mapping: Map<lowerSourceKey, string[]>, packageId): Set<lowerSourceKey>`. Patterns: exact id (`a.b`), prefix ending in `*` (`a.*`, `a*`), or `*`; a pattern with `*` anywhere else is ignored; comparison with `toLowerCase()` on both sides (not `toLocaleLowerCase`). Rank: exact match beats any prefix; among prefixes the longer prefix wins; `*` is a prefix of length 0; ties keep every source that declares the winning pattern. No match → empty set. The function has no knowledge of enabled state.
7. `DefaultOutboundPolicy`: `constructor(mapping?: Map<lowerSourceKey, string[]>)`; `allowedSourcesFor(packageId, candidates)`: filter `candidates` to `enabled === true`; without a mapping return all of them in input order; with a mapping return those whose `name.toLowerCase()` is in `matchMapping(mapping, packageId)`, in input order; a winning pattern whose sources are all disabled or absent from `candidates` yields `[]` with no fallback. The policy never special-cases nuget.org (N20): no substring or hostname check exists in the class. One instance per project context, constructed by the Catalog (P2.8) from `mergeConfigChain(await reader.readChain(context.configFiles)).mapping`; P2.6 ships the pieces and the constructor only. Free-text search is out of scope.
8. `listSourceOutput.ts`: `parseListSourceOutput(stdout): NuGetSource[]`, a pure parser of the `detailed` format: a header line, then pairs of `<index>.  <name> [Enabled|Disabled]` and an indented URL line; tolerate CRLF and an index of any width; `enabled = token === 'Enabled'` with no locale fallback (N16: the English tokens are guaranteed by the runner's fixed environment, `DotnetRunner.ts:25-26`); `isLocal = !/^https?:\/\//i.test(url)`; `configFile` left undefined. A line pair that does not match is skipped, not an error.
9. `DotnetSourceProvider`: `constructor({ runner: DotnetRunner (the contract interface), platform?: NodeJS.Platform, env?, homedir?: () => string, logger? })`. `listSources(projectDir)`: key = `normalizeProjectPath(projectDir)` from `src/core/util/paths`; cache the in-flight promise per key so concurrent calls share one spawn; run `runner.run(listSourceArgs(), { cwd: projectDir })`; `exitCode !== 0` → reject with `DotnetCommandError` (exported from `src/core/cli`, which redacts the first stderr line) and delete the cache entry; a spawn rejection propagates and is not cached; success is cached until `invalidate()` or any mutation. `invalidate()` clears every directory. N21 closes by `cwd = projectDir` (no workspace-root listing exists in this class).
10. `add(options, cwd)`: resolve `name` when absent: hostname of an http(s) URL (port stripped, no special case for nuget.org, so `api.nuget.org` stays `api.nuget.org`, N20), basename of a local path, fallback `custom-source`; if that name is already in `await listSources(cwd)` (case-insensitive), append `-2`, `-3`, …; `storePasswordInClearText = platform !== 'win32' || options.storeEncrypted === false`; when `options.configFile` is given and the file does not exist, write `<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n</configuration>\n` first (1.x `NuGetSourceService.ts:147-159`, needed because `--configfile` must point at an existing file); then `runner.run(nugetAddSourceArgs(...), { cwd })`. `remove(name, cwd, configFile?)`, `enable`, `disable` through the P1.6 builders with `cwd`. Every mutation returns `{ ok: exitCode === 0 }` plus, on failure, `error` = the redacted first non-empty line of stderr/stdout (use `redact` from `src/core/logging`; the password must never appear), catches an `InvalidArgumentError` from a builder into `{ ok: false, error: message }` (the message must not contain the password: the builders already omit rejected credential values, `src/core/cli/STATUS.md`), catches a spawn rejection the same way, and calls `invalidate()` on success and on failure alike.
11. `configFiles(workspaceDir?)`: `[{ path: <user-level>, label: 'User' }]` where user-level is `%APPDATA%\NuGet\NuGet.Config` on win32 (`env.APPDATA`, else `homedir()/AppData/Roaming/NuGet/NuGet.Config`) and `homedir()/.nuget/NuGet/NuGet.Config` elsewhere; when `workspaceDir` is given, append `{ path: <existing nuget.config | NuGet.Config | NuGet.config in that order, else nuget.config>, label: 'Workspace: <basename>' }` (`fs.existsSync` is acceptable in this synchronous method). No source health monitoring, no name generation beyond step 10, no fallback source list from the XML when the CLI fails (the reader's `<packageSources>` exists only for `configFile` attribution and tests; P2.5 relies on "no sources ≠ unknown", `context.test.ts:157`).
12. Export `withConfigFiles(sources: NuGetSource[], merged: MergedNuGetConfig): NuGetSource[]`, a pure function that copies each source with `configFile` set to `merged.sources.get(name.toLowerCase())?.configFile`; the provider never calls it (it has no chain); P2.8 does.
13. N47: in `src/core/cli/validate.ts` reject a value that starts with `-` in `isValidPackageId`, `isValidSourceName` and the local-path branch of `isValidSourceUrl` (the `LOCAL_FEED_PATH_PATTERN` branch only; `C:\`, `\\server\share`, `file:` and http(s) URLs are unaffected); in `validate.test.ts` add tests titled exactly `rejects a package id that starts with -`, `rejects a source name that starts with -`, `rejects a local feed path that starts with -`. Touch no other file in `src/core/cli`.
14. Evidence (§2.6): capture, with SDK 10.0.401, `dotnet nuget list source --format detailed` from a scratch directory whose `nuget.config` has `<clear />` and declares three sources (`Private Feed` with a space in the name, a disabled one, a local path source); store the redacted stdout verbatim as `src/core/sources/__fixtures__/list-source/10.0.401.txt` and drive the parser's unit tests from that file. The gated test (step 16) runs the same configuration live and asserts the parsed result equals the fixture's parsed result, so the "CLI/SDK behaviour differing from the tracked probe fixtures" trigger (§2.3) has something to fire against.
15. Tests with a fake runner (an object implementing the `DotnetRunner` contract, scripted like P2.5's) and `createScratchDir` from `src/core/project/__fixtures__/scratch.ts` (reuse; copy it to `src/core/sources/__fixtures__/scratch.ts` only if the API does not fit). Titles a gate should look for:
   `private-only configuration never yields nuget.org` (ungated: chain [near: `<clear />` + `Private Feed`] over [far: nuget.org] merged by `mergeConfigChain`, policy over candidates `[nuget.org enabled, Private Feed enabled]` with mapping `Private Feed: *`, and the listing parser over the tracked fixture; every assertion compares `new URL(url).hostname` to `api.nuget.org`, `www.nuget.org`, `nuget.org` exactly, never `includes`),
   `mapping: exact id beats a prefix pattern of the same length`, `mapping: longer prefix beats shorter prefix`, `mapping: * matches when nothing else does`, `mapping: ties allow every source that declares the pattern`, `mapping: configured mapping with no matching pattern yields no source`, `mapping: winning pattern whose sources are disabled yields no source (no fallback)`, `mapping: ids and patterns compare case-insensitively`, `mapping: a pattern with * not at the end is ignored`, `mapping: without a mapping every enabled candidate is allowed`, `mapping: disabled candidates are never returned`,
   `merge: a nearer file replaces the patterns of the same source key`, `merge: <clear /> discards farther files and earlier elements of the same file` (one `it.each` over `packageSources`, `disabledPackageSources`, `packageSourceCredentials`, `packageSourceMapping`), `merge: configFile is the nearest declaring file`, `merge: mapping is undefined without a packageSourceMapping element and empty when it is cleared`,
   `reader: decodes _xHHHH_ element names` (space and a leading digit), `reader: expands %VAR% from the injected environment and leaves unset variables literal`, `reader: Password is encrypted and ClearTextPassword is clear`, `reader: a BOM is accepted and malformed XML rejects with XmlParseError`, `reader: a missing file resolves undefined`,
   `dpapi: decrypts through runPowerShellEncoded with an injected execFile on win32`, `dpapi: returns undefined off Windows without spawning`, `dpapi: rejects a value that is not base64 before building a script`,
   `listing: parses the tracked SDK 10 capture` (name with a space, disabled source, local source with `isLocal`), `listing: tolerates CRLF and skips lines that do not match`,
   `provider: lists through the runner from the project directory` (asserts `argv === ['nuget','list','source','--format','detailed']` and `cwd === projectDir`; closes N21 and N16 because the runner, not a spawn, is called), `provider: caches per directory and shares an in-flight listing`, `provider: invalidate clears every directory`, `provider: failed listing rejects and is not cached`, `provider: add names a source from its URL when no name is given`, `provider: add stores the password in clear text off Windows and when storeEncrypted is false`, `provider: add creates a missing config file before calling dotnet`, `provider: mutation error is redacted and never contains the password`, `provider: a mutation invalidates the cache`, `provider: configFiles lists the user-level file and the workspace file`,
   `validate` titles of step 13,
   gated: `it.skipIf(process.env.NUIGET_SDK_TESTS !== '1')('real SDK: a nested nuget.config with <clear /> hides the user-level sources', …)` with the step-14 configuration, 60 s timeout, asserting the live parse equals the fixture parse and that no returned URL has a nuget.org hostname.
16. Docs: ARCHITECTURE.md gets a `src/core/sources/**` row under "2.0 Architecture (in progress)" stating the truth split (CLI for name/URL/enabled per project directory; reader for credentials, mapping and `configFile`), the merge rule of step 5 and the matching rule of step 6; CHANGELOG `[Unreleased]` nothing user-facing beyond the existing 2.0 line unless the session's convention adds one; `src/core/sources/STATUS.md` records this ruling verbatim and lists the step-5 merge rule under "Deviations" as "assumed from NuGet's keyed-section merge, pinned by test, no SDK probe"; commit cites P2.6, ADR-005, N16, N20, N21, N47; ledger rows N16, N20, N21, N47 closed with the test titles.

DO NOT:
- Do not union the patterns of the same source key across files, and do not fall back to the next-longest pattern or to all sources when the winning pattern's sources are disabled or absent.
- Do not special-case nuget.org anywhere in `src/core/sources` (no `includes('nuget.org')`, no hostname table in the policy).
- Do not add `listSourcesRaw` to the `DotnetRunner` contract or type the provider against `DefaultDotnetRunner`; use the contract interface and `listSourceArgs()`.
- Do not run `dotnet nuget config paths` from the provider, and do not edit `src/core/project/context.ts` to expose its private method.
- Do not parse the XML as a fallback source list when the CLI fails; reject.
- Do not cache a failed, timed-out or spawn-rejected listing.
- Do not edit `src/core/project/xml.ts` (`REPEATABLE`, parser options) or any `src/core/cli` file other than `validate.ts` and `validate.test.ts`.
- Do not interpolate a config value into a PowerShell script without the base64 check, and do not call `powershell` by any route other than `runPowerShellEncoded`.
- Do not read `src/core/sources/__fixtures__/.scratch/**` or any quarry capture as evidence; the only capture is the tracked `__fixtures__/list-source/10.0.401.txt`.
- Do not expand `%VAR%` from `process.env` directly inside the reader; take the environment as a dependency.
- Do not build the `Authorization` header, credential providers or a credential cache here (P2.7).
- Do not add a source health monitor, a 30 s TTL (1.x `NuGetSourceService.ts:39`) or any timer; the cache is invalidated by `invalidate()` and mutations only.

CONTRACT CHANGE: none. `src/core/contracts.ts`, `src/protocol/**` and `docs/adr/**` stay untouched; no sentinel. If a later item needs `configFile` from the provider itself, that is a P2.8 or P4 question, not a reason to widen `SourceProvider` now.

VERIFY: `npx tsc --noEmit` → 0; `npx eslint src` → 0; `npx vitest run --project backend src/core/sources src/core/cli/validate.test.ts` green with every title of step 15 present (`grep -c "private-only configuration never yields nuget.org" src/core/sources/*.test.ts` → 1); `DOTNET_ROOT="$(dirname "$(command -v dotnet)")" NUIGET_SDK_TESTS=1 npx vitest run --project backend src/core/sources src/core/cli` green including the gated test; `grep -rln child_process src/core --include='*.ts'` → only `src/core/cli/*`; `grep -rn "nuget.org" src/core/sources --include='*.ts' | grep -v test` → 0 lines; `grep -rn "process.env" src/core/sources --include='*.ts' | grep -v test` → only the `env` default of the reader/provider constructor; `git status --short src/core/contracts.ts src/protocol docs/adr` → clean; `ls src/core/sources/__fixtures__/list-source/10.0.401.txt` exists and `git ls-files` lists it; `npm test` and `npm run bench` green.

Files checked (absolute): /Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md; /Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md (lines 41-175, 203-238, 359-436 via grep); /Users/mattias/github/nuiget/docs/adr/005-execution-context-and-outbound-policy.md; /Users/mattias/github/nuiget/docs/plans/STATUS.md (P1.6, P1.10, P2.5-P2.8 rows); /Users/mattias/github/nuiget/docs/plans/findings-ledger.md (N15, N16, N20, N21, N47); /Users/mattias/github/nuiget/src/core/contracts.ts (186-198, 255-314); /Users/mattias/github/nuiget/src/protocol/domain.ts (140-152); /Users/mattias/github/nuiget/src/core/cli/validate.ts (1-75); /Users/mattias/github/nuiget/src/core/cli/commands.ts (40-60, 98-104, 160-197); /Users/mattias/github/nuiget/src/core/cli/powershell.ts (18-60); /Users/mattias/github/nuiget/src/core/cli/DotnetRunner.ts (25-26, 188, 395-420); /Users/mattias/github/nuiget/src/core/cli/DotnetRunner.test.ts (201, 735-775); /Users/mattias/github/nuiget/src/core/cli/index.ts; /Users/mattias/github/nuiget/src/core/cli/__fixtures__/fake-dotnet.cjs; /Users/mattias/github/nuiget/src/core/cli/STATUS.md (116); /Users/mattias/github/nuiget/src/core/ops/STATUS.md (270, 326-450); /Users/mattias/github/nuiget/src/core/project/context.ts (1-82 via grep); /Users/mattias/github/nuiget/src/core/project/context.test.ts (82-193); /Users/mattias/github/nuiget/src/core/project/xml.ts (1-45); /Users/mattias/github/nuiget/src/core/project/__fixtures__/scratch.ts; /Users/mattias/github/nuiget/src/core/project/STATUS.md (414-417); /Users/mattias/github/nuiget/src/core/util/{paths,fs}.ts (exports); /Users/mattias/github/nuiget/src/services/NuGetConfigParser.ts (all 376 lines); /Users/mattias/github/nuiget/src/services/NuGetSourceService.ts (grep: 39, 128-227, 260-275); /Users/mattias/github/nuiget/src/services/CredentialService.ts (grep: 46-49, 188-202, 250-294); /Users/mattias/github/nuiget/.github/instructions/core-boundaries.instructions.md; /Users/mattias/github/nuiget/ARCHITECTURE.md (2.0 rows via grep); /Users/mattias/github/nuiget/package.json (fast-xml-parser 5.11.2). `git status` clean at 28fa9a7. The brief's `src/core/sources/__fixtures__/.scratch/` does not exist in this repository (it is in the quarry worktree, which this agent cannot read); nothing in the ruling depends on it. The ambient advisor was consulted once and agreed with both corrections and the N16/N20/N21 additions.
````

## Exact next step (one item ID)

P2.7 (`src/core/credentials/`).

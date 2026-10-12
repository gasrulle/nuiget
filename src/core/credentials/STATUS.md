# STATUS — src/core/credentials   commit 402acbd (parent of the P2.7 commit)   2026-10-12T17:56:37Z

git status --short src/core/credentials: `?? src/core/credentials/` (belongs to the P2.7 commit, together with
` M ARCHITECTURE.md`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md` and ` M docs/plans/findings-ledger.md`)

Item: **P2.7 `src/core/credentials/**`: `CredentialService` of 1.x ported behind `CredentialProvider`**
(environment → `nuget.config` → credential provider; a DPAPI failure falls through).

The quarry has no `src/core/credentials`. The source is `src/services/CredentialService.ts` (586 lines, 1.x).
The item is not ⚑; a stop-and-ask went out because its gate cannot hold as written (see Deviations), and the
answer below also settles the design points the row leaves open.

## Verified by running

```text
The gates ran with DOTNET_ROOT set to the SDK directory and NUIGET_SDK_TESTS=1 (N48).
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0
baseline npx vitest run      → Test Files 77 passed (77) · Tests 2324 passed (2324)
the row's gate, literally    → grep -rn "exec(" src/core --include='*.ts': 14 lines before the item, every one a
                               RegExp.prototype.exec call in a file of another item (N55)
npx tsc --noEmit / npm run check-types → exit 0 / exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src / npm run lint → exit 0, no output / exit 0
npx vitest run --project backend src/core/credentials → Test Files 1 passed (1) · Tests 32 passed (32)   (item
                               gate; both titles that the ruling greps for are present once)
npm test                     → Test Files 78 passed (78) · Tests 2356 passed (2356)
npx vitest run (no NUIGET_SDK_TESTS) → Tests 2353 passed | 3 skipped (2356)
npx vitest run --coverage    → exit 0 · All files 78.15 % statements, 68.28 % branches, 74.36 % functions,
                               79.54 % lines · DefaultCredentialProvider.ts 106 of 106 lines, helpers.ts 56
                               of 56 · src/core/** 2562 of 2602 lines, 98.46 % (floor 85 %)
npm run bench                → Test Files 17 passed (17) · Tests 104 passed | 1 skipped (105)
npm run package:vsix         → exit 0 · Tests 2356 passed · DONE  Packaged: nuiget-v1.18.9.vsix (17 files,
                               529.44 KB)
npm run check:vsix           → check:vsix: OK
replacement gate (ruling)    → grep -rnE "(^|[^.A-Za-z0-9_$])exec(Sync)?\(" src/core --include='*.ts': 0 lines ·
                               grep -rn "promisify(exec)\|execAsync\|shell: true" src/core --include='*.ts': 0
                               lines · grep -rln child_process src/core --include='*.ts': only src/core/cli
grep -rnE "\b(execFile|spawn|exec|execSync)\(" src/core/credentials --include='*.ts' → 0 lines
grep -rn "process.env\|os.homedir()\|process.platform" src/core/credentials (tests left out) → the two
                               constructor defaults, DefaultCredentialProvider.ts:71 and :75
grep -rn "NUGET_NETFX_PLUGIN_PATHS" src/core/credentials (tests left out) → 0 lines; the name occurs once in a
                               test, which shows that the variable is not read
negative control             → six single mutations, each caught: the encrypted text used when decryption fails
                               (1 test fails), a transient outcome cached (2), nuget.config asked before the
                               environment (2), the plugin's output logged (1), clear() not guarding an earlier
                               acquisition (1), Azure Artifacts recognized by substring (3). Both files were
                               restored and compared afterwards.
git status --short src/core/contracts.ts src/protocol docs/adr → empty (no contract change, no sentinel)
git diff --stat -- src/core/cli src/core/sources src/core/logging → empty
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P2.7
```

## Done (tested)

- `DefaultCredentialProvider.ts`: `DefaultCredentialProvider` implements `CredentialProvider`.
  `getAuthHeader(sourceUrl)` answers `Basic <base64 of user:password in UTF-8>` or `undefined` and never
  rejects; a source that is not http(s), or that `isValidSourceUrl` refuses, has no header and no step runs.
  The three steps, in the row's order:
  - environment (`:150-166`): the external feed endpoints variable (`ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS`,
    else `VSS_NUGET_EXTERNAL_FEED_ENDPOINTS`), then the access token (`ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN`,
    else `VSS_NUGET_ACCESSTOKEN`) for an Azure Artifacts URL only;
  - `nuget.config` (`:168-189`): the credential that the injected `lookupConfigCredential(sourceUrl)` finds; an
    encrypted password is decrypted through `decryptPassword` of `src/core/sources`, and when that fails the
    step yields nothing and the next one runs; a value with an unresolved `%VAR%` is not used; a missing user
    name is `VssSessionToken`;
  - credential provider (`:191-216`): for Azure Artifacts URLs and for hosts of
    `ARTIFACTS_CREDENTIALPROVIDER_HOSTS` / `NUGET_CREDENTIALPROVIDER_VSTS_HOSTS` only, the netcore plugin is
    run as `runner.run([dll, '-U', url, '-N', '-F', 'Json'], { cwd, timeoutMs: 10000 })`.
  Cache (`:85-118`): a header for 30 minutes and "none" for 5, by normalized URL, with an injected clock and no
  timer; a timeout, a cancellation, a failed start and a failing lookup are not kept; concurrent calls share
  one acquisition; `clear()` empties everything and an acquisition that began before it does not store its
  answer. `prewarm(urls)` starts acquisitions and returns.
- `helpers.ts`, pure: `normalizeSourceUrl`, `credentialForUrl` (URL → source name → credential of the merged
  chain), `basicAuthHeader`, `isAzureArtifactsUrl` and `isSupportedCredentialProviderHost` (by host name),
  `matchExternalFeedEndpoint`, `findCredentialPlugin` (`NUGET_NETCORE_PLUGIN_PATHS`, else `NUGET_PLUGIN_PATHS`,
  then the default location; the first existing `.dll`), `parsePluginOutput`.
- `index.ts`: named exports.
- `DefaultCredentialProvider.test.ts`, 32 tests (24 declarations, one of them a table of nine rows) with every
  title of the ruling's step 11, among them `config: DPAPI failure falls through to the provider`, `provider:
  runs the netcore plugin through the runner with the URL as one argv element` (a URL that contains
  `$(whoami)` arrives as one argument; N15), `provider: stdout never reaches the logger`, `cache: timeout,
  cancellation and spawn failure are not cached`, `config: encrypted password is decrypted through
  decryptPassword with an injected execFile on win32`.

## Done (untested)

- No test runs the real Azure Artifacts Credential Provider; the runner is a fake that answers like it.
- DPAPI is exercised through an injected `execFile` only (see N54 in `src/core/sources/STATUS.md`).
- Nothing constructs the provider yet. The recipe for the Catalog (P2.8), per project context: `cwd:
  context.projectDir` and `lookupConfigCredential: async url => credentialForUrl(url, await
  sourceProvider.listSources(context.projectDir), mergeConfigChain(await reader.readChain(context.configFiles)))`.
  Whether there is one instance per context or one shared instance is P2.8's decision.

## Not started

- The use of the header by `Transport` and the feed clients: P4.
- An interactive sign-in for the credential provider (`dotnet restore --interactive`): not part of 2.0's core;
  1.x returned a hint text for it (`CredentialService.ts:372-381`), which the contract has no place for.

## Deviations from contract/ADR (file:line each)

- The row's gate `grep -rn "exec(" src/core` → 0 cannot hold: it also matches `RegExp.prototype.exec(`, called
  14 times in files of other items. By the ruling it is replaced with the three greps recorded above (N55).
  This directory itself uses no `.exec(` at all.
- The row says "provider via argv `execFile`". The plugin is started as the netcore `.dll` through the injected
  `DotnetRunner` instead (`DefaultCredentialProvider.ts:199-203`): only `src/core/cli` may use `child_process`,
  the runner already gives an argv without a shell, a time limit and no logging of stdout. The .NET Framework
  plugin (`.exe`) that 1.x preferred on Windows (`CredentialService.ts:491-502`) is not used and
  `NUGET_NETFX_PLUGIN_PATHS` is not read. The injected `execFile` of the row reaches the tests through the
  DPAPI decryption.
- Order: environment, then `nuget.config`, then the provider, as the row says. 1.x asks `nuget.config`, then
  the provider, then the environment (`CredentialService.ts:181-243`).
- 1.x keeps every failure for 5 minutes; here a timeout, a cancellation, a failed start and a failing lookup
  are not kept (`DefaultCredentialProvider.ts:103-110`, `:139-143`), by the rule that only definitive answers
  are cached.
- 1.x goes on with the encrypted text as the password when DPAPI fails (`CredentialService.ts:192-202`); here
  the step yields nothing (`DefaultCredentialProvider.ts:174-180`).
- 1.x recognizes Azure Artifacts and the supported hosts by substring of the URL; here by host name, with the
  `/_packaging/` path test kept for on-premises servers (`helpers.ts:44-66`).
- The plugin's standard output is never logged, not even through `redact`, which does not mask a quoted JSON
  key such as `"Password":"…"` (N56).
- The log lines name the source by its URL, which `redact` strips of user information; the ruling's sample
  wording names the source by name, which the provider does not know.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-12, P2.7, stop-and-ask. Brief in the form of plan §2.4, sent on `labs/2.0` @ `402acbd` before any code
was written. Six points: 1 the gate that cannot hold; 2 starting the plugin without `child_process` outside
`src/core/cli`; 3 joining a URL to credentials that are keyed by source name; 4 order and content of the three
steps; 5 result and caching; 6 the tests. Answer of the `architecture-advisor`, verbatim:

````text
DECISION: Confirm question 1 (the row's literal gate is unsatisfiable; replace it with the three greps under VERIFY and record a ledger finding), confirm 3, 4, 5 and 6 with the corrections below, and correct 2: `src/core/credentials` never imports `child_process` and never receives an `execFile` for the plugin; `src/core/cli` gets no new export; the Azure Artifacts Credential Provider is started only as the netcore `.dll` through the injected `DotnetRunner` (`runner.run([dllPath, '-U', url, '-N', '-F', 'Json'], { cwd, timeoutMs: 10000 })`), and the row's "injected `execFile`" reaches the tests through P2.6's `decryptPassword`. Nothing is the owner's. No contract change.

WHY: The brief matches the tree. `grep -rn "exec(" src/core --include='*.ts'` lists 14 `RegExp.prototype.exec(` calls in files of other items (`src/core/cli/sdk.ts:22`, `src/core/cli/DotnetRunner.ts:448`, `src/core/project/{assets.ts:113,154,177,225,247,256; discovery.ts:77; inspector.ts:261}`, `src/core/sources/listSourceOutput.ts:18`, `src/core/versioning/VersionRange.ts:73,92`, `src/core/logging/redact.ts:73`), none a process call; the intent of the gate is ADR-003 ("no shell, ever", `docs/adr/003:32-33`; "The runner is the only module that touches `child_process`", `003:40`), which `grep -rln child_process src/core --include='*.ts'` → only `src/core/cli/*` already pins and `src/core/cli/commands.test.ts` asserts. On question 2: `ExecFileFunction` leaves `src/core/cli/index.ts` as a type only; the real default is private to `powershell.ts:51`, so an `.exe` plugin would need either a `child_process` import in the new directory (fence) or an edit to `src/core/cli` outside §2.1, while `DefaultDotnetRunner.run` (`DotnetRunner.ts:181-201`) already gives argv with `shell: false`, a timeout with kill grace, a 10 MB output cap and spawn-error typing, and its `logResult` (`DotnetRunner.ts:504-524`) logs redacted argv and stderr only, never stdout, so the plugin's JSON answer cannot reach a log through the runner. That matters because `redact` (`src/core/logging/redact.ts:22,25`) does not mask a quoted JSON key: I ran it and `{"Username":"VssSessionToken","Password":"abc123SECRET"}` came back unchanged (only a JWT-shaped value is caught, `redact.ts:29`). The SDK floor (D13) guarantees `dotnet`, and the netcore plugin (`~/.nuget/plugins/netcore/CredentialProvider.Microsoft/CredentialProvider.Microsoft.dll`) is the one the `dotnet` CLI itself loads (documented behaviour of NuGet cross-platform plugins, `NUGET_NETCORE_PLUGIN_PATHS`; verify with Context7 `/websites/learn_microsoft_en-us_nuget`, not from this ruling); dropping the netfx `.exe` is therefore a recorded deviation from the row's wording and from 1.x (`CredentialService.ts:491-502`), not a loss of function. On question 3: `DotnetRunOptions.cwd` is required (`contracts.ts:180-186`), so the provider needs a directory after all; `MergedNuGetConfig.credentials` is keyed by lower-cased source name (`src/core/sources/merge.ts:8`), `NuGetSource` carries `name` and `url` (`src/protocol/domain.ts:143-150`), and the Catalog is the only place that has both (P2.6 ruling, `src/core/sources/STATUS.md:154,159`). On question 4: 1.x runs config → provider → env (`CredentialService.ts:181-243`); the row's env → config → provider is the order to port and is a behaviour change to record. On question 5: the repository rule "cache successes and definitive failures only" (copilot-instructions, "Transient failure cached as a result"; precedent `DotnetRunner.ts:298-303`) forbids caching a timed-out, cancelled or spawn-rejected plugin run as "none". N15 (`docs/plans/findings-ledger.md:117`) is assigned to this item and closes by argv, not by a character blacklist that P1.6 deliberately removed (`src/core/cli/validate.ts:60-73`).

DO:
1. Create `src/core/credentials/` with `index.ts`, `STATUS.md`, the tests, and these exports (file split is free; the names are not): `DefaultCredentialProvider` (implements `CredentialProvider` from `../contracts`), `credentialForUrl`, `basicAuthHeader`, `isAzureArtifactsUrl`, `isSupportedCredentialProviderHost`, `matchExternalFeedEndpoint`, `findCredentialPlugin`, `parsePluginOutput`, `normalizeSourceUrl`, and the option/result types. Core rules: no `vscode` value import, no `child_process`, no `process.env` outside a constructor default, `PromiseLike` only, no Node 20 API, no import from `src/services/**`. Allowed intra-core imports: `../contracts` (types), `../sources` (`decryptPassword`, `ConfigCredential`, `MergedNuGetConfig`), `../cli` (`isValidSourceUrl`, `DotnetSpawnError`, `type ExecFileFunction`), `../logging` (`redact`).
2. `normalizeSourceUrl(url)`: `url.trim()` lower-cased with one trailing `/` removed. It is the cache key and the join key; nothing else lower-cases a URL.
3. `credentialForUrl(sourceUrl, sources: NuGetSource[], merged: MergedNuGetConfig): (ConfigCredential & { sourceName: string; configFile: string }) | undefined`: find the first source whose `normalizeSourceUrl(url)` equals `normalizeSourceUrl(sourceUrl)`, then `merged.credentials.get(source.name.toLowerCase())`; `undefined` when either lookup misses. Pure; no file or directory access.
4. `DefaultCredentialProvider` constructor options: `{ runner: DotnetRunner; lookupConfigCredential: (sourceUrl: string) => Promise<ConfigCredential | undefined>; cwd?: string; env?: Record<string, string | undefined>; platform?: NodeJS.Platform; homedir?: () => string; fileExists?: (filePath: string) => Promise<boolean>; decrypt?: (encrypted: string) => Promise<string | undefined>; execFile?: ExecFileFunction; now?: () => number; logger?: Logger }`. Defaults, set in the constructor only: `cwd = homedir()`, `env = process.env`, `platform = process.platform`, `homedir = os.homedir`, `fileExists = fs.promises.access(...).then(() => true, () => false)`, `decrypt = value => decryptPassword(value, { platform, execFile })`, `now = Date.now`. `execFile` is forwarded to `decryptPassword` and used for nothing else. The provider is context-agnostic: whether P2.8 builds one instance per project context (with `cwd: context.projectDir` and a lookup over `credentialForUrl(url, await sourceProvider.listSources(context.projectDir), mergeConfigChain(await reader.readChain(context.configFiles)))`) or one shared instance is P2.8's decision; P2.7 ships the pieces and documents that recipe in `STATUS.md`.
5. `getAuthHeader(sourceUrl)`: resolves `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}` or `undefined`; never rejects (every step is wrapped; an unexpected throw resolves `undefined` after a redacted `logger.warn` that names the step and the source, never the value). Before any step: `isValidSourceUrl(sourceUrl)` must hold and `new URL(sourceUrl).protocol` must be `http:` or `https:`; otherwise resolve `undefined` (local and `file:` sources have no header). Do not write a URL regex in this directory.
6. Step order is the row's: env → config → provider. Env: (a) `ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS`, else `VSS_NUGET_EXTERNAL_FEED_ENDPOINTS`, parsed as JSON `{ endpointCredentials: [{ endpoint, username?, password }] }`; `matchExternalFeedEndpoint(sourceUrl, entries)` returns the first entry with a non-empty `password` whose normalized `endpoint` equals the normalized source URL or where either normalized value is a path prefix of the other (`a === b || a.startsWith(b + '/') || b.startsWith(a + '/')`, as 1.x `CredentialService.ts:455-457`); unparsable JSON or a missing array is "no match" with a `logger.debug` that does not quote the variable's content; username defaults to `VssSessionToken`. (b) `ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN`, else `VSS_NUGET_ACCESSTOKEN`, used only when `isAzureArtifactsUrl(sourceUrl)`, with username `VssSessionToken`. Config: `await lookupConfigCredential(sourceUrl)`; skip when there is no entry or no `password`; `passwordKind === 'encrypted'` → `await decrypt(password)`, `undefined` → log `debug` "encrypted password of source <name> could not be decrypted; trying the credential provider" and fall through (the 1.x behaviour at `CredentialService.ts:192-202` of using the encrypted text as the password is not ported); a username or password that still matches `/%[^%\s]+%/` (the reader's placeholder form, `NuGetConfigReader.ts:32`) is an unresolved placeholder → skip the step with a `debug` line naming the source only; missing username → `VssSessionToken`. Provider: only when `isAzureArtifactsUrl(sourceUrl) || isSupportedCredentialProviderHost(sourceUrl, env)`.
7. `isAzureArtifactsUrl(url)`: `hostname` of `new URL(url)` lower-cased equals `pkgs.dev.azure.com` or ends with `.pkgs.dev.azure.com` or ends with `.pkgs.visualstudio.com`, or the lower-cased `pathname` contains `/_packaging/` (on-premises Azure DevOps Server). `isSupportedCredentialProviderHost(url, env)`: `ARTIFACTS_CREDENTIALPROVIDER_HOSTS`, else `NUGET_CREDENTIALPROVIDER_VSTS_HOSTS`, split on `;`, trimmed, empty entries dropped, lower-cased; true when the hostname equals an entry or ends with `.` + entry. No `includes()` on the whole URL anywhere.
8. `findCredentialPlugin(env, homedir, fileExists): Promise<string | undefined>`: candidates in order `NUGET_NETCORE_PLUGIN_PATHS` entries, else (only when that variable is unset) `NUGET_PLUGIN_PATHS` entries, each split on `path.delimiter`, then `path.join(homedir(), '.nuget', 'plugins', 'netcore', 'CredentialProvider.Microsoft', 'CredentialProvider.Microsoft.dll')`; the first candidate that ends with `.dll` (case-insensitive) and exists wins; an entry that ends with `.exe` is skipped with a `debug` line naming the path; `NUGET_NETFX_PLUGIN_PATHS` is not read. The result (including "none") is cached per instance until `clear()`.
9. Plugin run: `runner.run([dllPath, '-U', sourceUrl, '-N', '-F', 'Json'], { cwd: this.cwd, timeoutMs: PLUGIN_TIMEOUT_MS })` with `export const PLUGIN_TIMEOUT_MS = 10_000`. The URL is one argv element, never quoted or escaped (this closes N15). `parsePluginOutput(stdout)`: take the last non-empty line that starts with `{`, `JSON.parse` it, require non-empty string `Username` and `Password`; anything else is "no credential". Outcome classes: `exitCode === 0` with credentials → positive; `exitCode === 0` without them, or `exitCode !== 0`, or plugin not installed, or host not eligible → definitive "none"; `result.timedOut`, `result.cancelled`, or a rejected `run` (`DotnetSpawnError`, `DotnetNotFoundError`) → transient `undefined`. Log at `debug` only the exit code, the duration and the first stderr line through `redact`; never log stdout, even through `redact` (see WHY).
10. Cache: `Map<normalizedUrl, { header: string | undefined; expiresAt: number }>`; positive entries live `SUCCESS_TTL_MS = 30 * 60_000`, definitive "none" entries `FAILURE_TTL_MS = 5 * 60_000`; transient outcomes are not stored. A second `Map<normalizedUrl, Promise<string | undefined>>` shares one in-flight acquisition. `clear()` empties both maps, resets the plugin discovery and bumps an epoch; an acquisition that started before `clear()` resolves to its caller but does not store (the pattern of `DotnetRunner.ts:157,314-322`). `prewarm(sourceUrls)`: `for (const url of sourceUrls) void this.getAuthHeader(url);` — nothing else, no await, no timer. No timer anywhere in the directory; expiry is checked on read with `now()`.
11. Tests (`DefaultCredentialProvider.test.ts` and pure-function tests; fake runner scripted like P2.5/P2.6's; `createScratchDir` from `src/core/project/__fixtures__/scratch.ts` for plugin discovery; injected `env`, `now`, `fileExists`, `decrypt`, `logger`). Titles a gate looks for: `env: external feed endpoint matches by equality or path prefix in either direction`, `env: access token is used only for an Azure Artifacts host`, `env: malformed endpoint JSON is ignored without logging its content`, `config: clear-text password becomes a Basic header`, `config: encrypted password is decrypted through decryptPassword with an injected execFile on win32`, `config: DPAPI failure falls through to the provider`, `config: unresolved %VAR% placeholder is not used`, `config: missing username defaults to VssSessionToken`, `provider: runs the netcore plugin through the runner with the URL as one argv element` (asserts `args` deep-equals `[dllPath, '-U', url, '-N', '-F', 'Json']` for a URL containing `$(whoami)` and `cwd === options.cwd`; closes N15), `provider: answer without Username or Password yields no header`, `provider: is not started for a host that is not eligible`, `provider: ARTIFACTS_CREDENTIALPROVIDER_HOSTS extends the eligible hosts by host name`, `provider: NUGET_NETCORE_PLUGIN_PATHS wins over NUGET_PLUGIN_PATHS and an .exe entry is skipped`, `provider: stdout never reaches the logger` (injected logger; every call's arguments joined must not contain the password), `url: local, file and invalid source URLs yield undefined without any step`, `cache: a credential lives 30 minutes and a miss 5 minutes` (fake clock), `cache: timeout, cancellation and spawn failure are not cached`, `cache: concurrent calls share one acquisition`, `cache: clear empties the cache and an acquisition started before clear does not repopulate`, `prewarm: starts acquisitions for every URL and never rejects`, `header: encodes non-ASCII user name and password as UTF-8`, `join: finds the credential by source name case-insensitively and without a trailing slash`, `join: unknown URL yields undefined`, `azure: host and /_packaging/ path tests` (table: `pkgs.dev.azure.com`, `org.pkgs.visualstudio.com`, `tfs.corp.example/tfs/Col/_packaging/x/nuget/v3/index.json` true; `notpkgs.dev.azure.com.evil.test`, `example.test/pkgs.dev.azure.com/` false).
12. Docs and ledger: `docs/plans/findings-ledger.md` gains N55 "P2.7 gate `grep -rn "exec(" src/core → 0` is unsatisfiable (14 `RegExp.exec` calls in other items' files); replaced by the three VERIFY greps" (closed by this item) and N56 "`redact` does not mask a quoted JSON key (`{"Password":"x"}`); plugin stdout must never be logged" (assigned to P7.3 or a logging item; `src/core/logging/redact.ts` is not P2.7's file); N15 closed with the test title of step 11. CHANGELOG `[Unreleased]` `### Changed`: `**Credential lookup order is environment, nuget.config, then credential provider**` and `**Azure Artifacts Credential Provider runs as the netcore plugin through dotnet (netfx plugin no longer used)**`. ARCHITECTURE.md 2.0 section: a `src/core/credentials/**` row stating the three steps, the join, the cache lifetimes and "stdout of the plugin is never logged". `STATUS.md` records this ruling verbatim and lists under "Deviations": the row's literal gate and its replacement; the `.dll`-through-runner choice against the row's "argv `execFile`" wording and 1.x's netfx path; the env-first order against 1.x; the transient outcomes not cached against 1.x's 5-minute failure cache. Commit cites P2.7, ADR-003, ADR-005, N15, N55, N56.

DO NOT:
- Do not import `child_process` in `src/core/credentials`, and do not add `runExecutable` or any new export to `src/core/cli`; the only process starters are the injected `DotnetRunner` and `decryptPassword`.
- Do not edit `src/core/cli/sdk.ts`, `src/core/project/*`, `src/core/sources/*`, `src/core/versioning/*` or `src/core/logging/*` to make the literal `exec(` grep empty.
- Do not port 1.x `isValidUrl`'s dangerous-character regex (`CredentialService.ts:303-317`); use `isValidSourceUrl` plus the scheme check.
- Do not use the DPAPI-encrypted text as the password when decryption fails (`CredentialService.ts:192-202`).
- Do not cache a timed-out, cancelled or spawn-rejected plugin run, and do not add a timer for expiry.
- Do not log, include in an error, or pass to `onCommand` a header, password, token, plugin stdout or the content of an environment variable, with or without `redact`.
- Do not read `process.env`, `os.homedir()` or `process.platform` inside a method; take them as constructor dependencies with constructor defaults.
- Do not match Azure Artifacts or supported hosts with `includes()` on the whole URL.
- Do not read `NUGET_NETFX_PLUGIN_PATHS` or start an `.exe`.
- Do not touch `src/core/contracts.ts`, `src/protocol/**` or `docs/adr/**`; no sentinel.

CONTRACT CHANGE: none. `CredentialProvider` (`src/core/contracts.ts:265-271`) is implemented as declared; the constructor options are the implementation's, not the contract's. If P2.8 needs a per-context lookup shape that `lookupConfigCredential` cannot express, that is a P2.8 question, not a reason to widen the contract now.

VERIFY: `npx tsc --noEmit` → 0; `npx eslint src` → 0; `npx vitest run --project backend src/core/credentials` green with every title of step 11 present (`grep -c "provider: runs the netcore plugin through the runner with the URL as one argv element" src/core/credentials/*.test.ts` → 1; `grep -c "config: DPAPI failure falls through to the provider" src/core/credentials/*.test.ts` → 1); replacement for the row's gate, all three required: `grep -rnE "(^|[^.A-Za-z0-9_$])exec(Sync)?\(" src/core --include='*.ts'` → 0 lines; `grep -rn "promisify(exec)\|execAsync\|shell: true" src/core --include='*.ts'` → 0 lines; `grep -rln child_process src/core --include='*.ts'` → only paths under `src/core/cli/`; additionally `grep -rnE "\b(execFile|spawn|exec|execSync)\(" src/core/credentials --include='*.ts'` → 0 lines and `grep -rn "process.env\|os.homedir()\|process.platform" src/core/credentials --include='*.ts' | grep -v '\.test\.ts'` → only the constructor defaults of `DefaultCredentialProvider`; `grep -rn "NUGET_NETFX_PLUGIN_PATHS" src/core/credentials --include='*.ts'` → 0; `git status --short src/core/contracts.ts src/protocol docs/adr` → clean; `git diff --stat -- src/core/cli src/core/sources src/core/logging` → empty; `grep -n "N55\|N56" docs/plans/findings-ledger.md` → both present and N15 marked closed; `npm test` and `npm run bench` green; `npx vitest run --coverage` keeps `src/core/**` ≥ 85 % lines.

Files checked (absolute): /Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md; /Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md (lines 1-175, 203-238; credential mentions via grep); /Users/mattias/github/nuiget/docs/plans/STATUS.md (P1.10, P2.6, P2.7, P2.8 rows); /Users/mattias/github/nuiget/docs/plans/findings-ledger.md (S3, S5, N15, N54 rows; last id N54); /Users/mattias/github/nuiget/docs/adr/003-operation-queue-and-dotnet-runner.md (lines 25-54); /Users/mattias/github/nuiget/docs/adr/005-execution-context-and-outbound-policy.md (lines 18-50); /Users/mattias/github/nuiget/.github/instructions/core-boundaries.instructions.md; /Users/mattias/github/nuiget/src/services/CredentialService.ts (all 586 lines); /Users/mattias/github/nuiget/src/core/contracts.ts (34-40, 169-208, 240-294, 296-340); /Users/mattias/github/nuiget/src/protocol/domain.ts (143-150); /Users/mattias/github/nuiget/src/core/cli/index.ts; /Users/mattias/github/nuiget/src/core/cli/powershell.ts (all); /Users/mattias/github/nuiget/src/core/cli/DotnetRunner.ts (147-336, 504-524); /Users/mattias/github/nuiget/src/core/cli/validate.ts (60-144); /Users/mattias/github/nuiget/src/core/sources/index.ts; /Users/mattias/github/nuiget/src/core/sources/NuGetConfigReader.ts (1-40, 140-172); /Users/mattias/github/nuiget/src/core/sources/merge.ts (via grep: 2, 8, 22-44); /Users/mattias/github/nuiget/src/core/sources/DotnetSourceProvider.ts (1-80 via grep); /Users/mattias/github/nuiget/src/core/sources/STATUS.md (1-60, 100-198); /Users/mattias/github/nuiget/src/core/logging/index.ts; /Users/mattias/github/nuiget/src/core/logging/redact.ts (all; `redact` run on a plugin-shaped JSON answer: unchanged for a plain password, masked only for a JWT); /Users/mattias/github/nuiget/src/core/logging/redact.test.ts (via grep); /Users/mattias/github/nuiget/src/core/util/paths.ts and concurrency.ts (exports); /Users/mattias/github/nuiget/src/core/project/__fixtures__/scratch.ts (exports); /Users/mattias/github/nuiget/ARCHITECTURE.md (2.0 section heading and `src/core/sources` row via grep). Commands: `git status --short` (clean at 402acbd); `grep -rn "exec(" src/core --include='*.ts'` (14 lines, all `RegExp.exec`); `grep -rnE "(^|[^.A-Za-z0-9_$])exec(Sync)?\(" src/core --include='*.ts'` (0); `grep -rn "promisify(exec)\|execAsync\|shell: true" src/core --include='*.ts'` (0); `grep -rln child_process src/core --include='*.ts'` (6 files, all under `src/core/cli/`). The quarry worktree was not read (no `src/core/credentials` there per the brief). The ambient advisor was consulted once; it agreed with the approach and supplied the corrections on transient outcomes, the recorded deviation, N15's closure by argv, the `cwd` option, the `redact` finding, the env-first CHANGELOG line and the placeholder check on both fields, all folded in above.
````

## Exact next step (one item ID)

P2.8 (⚑ ADR-009 `Catalog`: write the ADR and fix the quarry's `Catalog.ts`; consult the `architecture-advisor`
before writing code).

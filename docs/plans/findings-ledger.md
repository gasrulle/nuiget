# nUIget findings ledger

One place for every finding that the 2.0 work has to close or consciously accept. Commits and handoff notes
cite the ids. Created by plan item P0.13 on 2026-10-12 from three sources:

1. the findings ledger of the audit of 2026-10-10 (`2026-10-10-audit-and-modernization-plan.md`, section 2;
   that plan is not in this repository, its ledger is reproduced unchanged in section 2 below);
2. Appendix A and B of `2026-10-11-nuiget-2.0-execution-plan.md` (corrections, new findings N1 to N24, defects
   of the paused 2.0 code);
3. findings made while executing the plan (N25 onwards).

## How to read and maintain it

- **Ids** (plan decision D12): `S` security, `Y` operations and sync, `F` project model, `M` multi-root,
  `P` performance, `U` user experience, `D` architecture smells, `T` tests and build; `N` new findings;
  `C-<group>-n` defects in the paused 2.0 code. Ids are never reused or renumbered.
- **The letter D is ambiguous** (N35): the execution plan numbers its decisions D1 to D13, and the original
  ledger numbers architecture smells D1 to D9. Write "finding D3" for a smell.
- **`P1` to `P8` are also phase names** in the execution plan. In this ledger a bare `P1` is the performance
  finding; plan work items always have a dot (`P1.2`).
- **Evidence line numbers** in section 2 refer to `main` at `0457c75` (v1.18.9). The code has moved since.
- **Status** is `open`, `partly closed`, `closed (<item>)`, `closed by design (<decision>)`, `accepted` or
  `moot in 2.0`. The item that closes a finding updates its row in section 1 in the same commit.
- **Counts** are given with the command that produces them (N23); a count without a command is a claim, not
  evidence.
- A new finding gets the next free `N` id, a row in section 1 and an entry in section 4.

## 1. Status of every finding

The fifth column names the plan work items or decisions that schedule or close a finding. The execution plan
schedules the new findings (N) explicitly. It does not map the original findings one by one: its work items
close them through the ADR invariants they implement, so those rows say "not mapped" until the item that closes
one records itself here.

| ID | Sev | Finding (short) | Correction (plan Appendix A) | Scheduled in / closed by | Status |
|---|---|---|---|---|---|
| S1 | H | Shell command strings | W: Free-text search query and webview `configFile` also interpolated unescaped. Moot in 2.0 (argv). | not mapped | open |
| S2 | M | Redundant, locale-dependent success classification | W: Locale affects output parsers too; pin env on every spawn; prefer JSON / `nuget config paths`. | not mapped | open |
| S3 | L | DPAPI decryption runs PowerShell through a shell string; input is base64-validated and passed… | — | not mapped | open |
| S4 | M | SSRF/redirect guard is host-string based (no resolved-address check, IPv4-mapped IPv6)… | C: Redirect decision already centralised; fetch loop is what is triplicated. | P1.9 (one implementation, `src/core/http/ssrf.ts`: IPv4-mapped, NAT64, 6to4, carrier-grade NAT, zone ids), P4.2 (check of the resolved address in `Transport`) | partly closed |
| S5 | L | Credential redaction is header-pattern based; CLI stderr / URL userinfo can leak into logs | W: `--password` on argv is inherent; token-only userinfo unredacted; toasts show raw stderr. | P1.5 (`redact`, `redactArgv`: userinfo with or without a password, headers, argv), P1.6 and P1.10 (applied to CLI output and commands) | partly closed |
| S6 | M | Main-panel CSP img-src is a fixed badge-host allow-list; icons resolved from private feeds are… | — | not mapped | open |
| Y1 | H | Handlers without try/catch never answer on failure | W: More unwrapped handlers; fixed by ADR-007 terminal-response guarantee. | not mapped | open |
| Y2 | H | Queue admission ignored | — | P2.1 (core: a refused submission is a ticket whose `completion` resolves with a `rejected` outcome), P2.9 (the host answers every `ops/*` request from the ticket) | open; core side done in P2.1 |
| Y3 | H | restoreProject and forced transitive restore bypass the OperationQueue | — | P2.9 (the quarry host submits restores to the queue as `PackageWorkflows.restore`; to be verified there) | open |
| Y4 | H | Shared debounce timer | — | not mapped | open |
| Y5 | H | skipNextUpdateCheckRef lingers | — | not mapped | open |
| Y6 | H | Scoped background merge resurrects deleted projects | W: Also drops live projects (`_sendInitialData` clears merge base). | not mapped | open |
| Y7 | M | Redundant refresh emission on full refresh | W: Real second reload. | not mapped | open |
| Y8 | M | Auto-selected project not persisted (two sites) → surfaces can restore different selections | — | not mapped | open |
| Y9 | L | Dead protocol traffic: restoreChanged is posted to the sidebar webview, which has no handler… | — | not mapped | open |
| Y10 | M | syncProject() awaits findProjects() before posting → rapid selections can arrive out of order | — | not mapped | open |
| Y11 | M | Bulk install notifies the other panel with only the first successful project path → scoped… | — | not mapped | open |
| Y12 | M | No request correlation on versions/metadata/readme/update responses; guards compare packageId… | W: Both surfaces + all-projects path. | not mapped | open |
| Y13 | L | Panel re-creation replays _cachedSearchQuery after a fixed 100 ms, before settings/sources… | W: `_webviewReady` write-only. | not mapped | open |
| Y14 | L | searchPackages staleness guard keys on query only (not source/prerelease/exactMatch) | — | not mapped | open |
| Y15 | M | queryAllProjectsUpdates returns [] silently when no remote source resolves (offline /… | — | not mapped | open |
| Y16 | M | _forceCheckPending re-run is fire-and-forget, no generation/abort, not cancelled on dispose →… | W: Untracked 2 s timer; no provider-level disposal guard. | not mapped | open |
| Y17 | L | NuGetPanel.refresh()/refreshScoped() bypass _postMessage (disposed guard) | N: Consistency only. | not mapped | open |
| Y18 | L | Six verbatim testSourceConnectivity().then(…) blocks, no .catch | — | not mapped | open |
| Y19 | H | Bulk install reports success from the reference edit only; restore outcomes are ignored in the… | — | not mapped | open |
| F1 | C | CPM read model wrong | C: Anchors `:329-334`/`:354`; read-side mechanism not SDK-specific. | not mapped | open |
| F2 | H | Regex .csproj parsing ignores Update=, VersionOverride, Condition (multi-TFM duplicates), XML… | W: Multi-TFM resolution arbitrary. | not mapped | open |
| F3 | M | Version handling: comparator is reasonable (zero-pads, 4-part, build metadata ignored… | — | not mapped | open |
| F5 | L | In-flight dedup exists for versions/metadata; inventory which paths bypass it (search, icons… | — | not mapped | open |
| M3 | M | .NET 10 dotnet package list performs an implicit restore — the "read" fallback in… | X: Closed by D13: `dotnet package list --no-restore`. | D13 | closed by design (D13) |
| M4 | M | Solution awareness: "All Projects" = every .csproj/fsproj/vbproj found by glob, not solution… | — | not mapped | open |
| M5 | M | Bespoke Node HTTP transport does not inherit VS Code proxy settings (http.proxy… | — | not mapped | open |
| P1 | H | Main panel and sidebar independently compute updates for the same project (checkPackageUpdates… | N: Per-surface glob clause holds for the sidebar path only. | not mapped | open |
| P2 | M | Two independent webview bundles (546 KB + 276 KB) — expected for two webview environments… | — | not mapped | open |
| P4 | L | HTTP/2 LRU eviction close()s a session that may have active streams (graceful close; impact… | — | not mapped | open |
| P5 | M | Health-monitor re-scheduling can overlap when a source mutation restarts it mid-pass | — | not mapped | open |
| P6 | L | aggregateAllProjectsTransitive linear find in nested loops | — | not mapped | open |
| P7 | L | getSources() returns the cached array by reference | — | not mapped | open |
| P8 | M | Benchmarks are micro-benchmarks of pure functions (parseSearchQuery ≈ 21 M ops/s) vs a… | N: Bench compare never fails; display-only. | P0.8, D8 | closed (P0.8: benchmark job is informational) |
| U1 | H | Sidebar row primary action button is hover-revealed with tabIndex={-1}; section-level handlers… | C: Four more `tabIndex={-1}` controls. | not mapped | open |
| U2 | H | No dialog semantics anywhere | C: Third dialog: remove-source confirm. | not mapped | open |
| U3 | H | Tab focus ring animates to transparent (tab-focus-fade) | — | not mapped | open |
| U4 | M | Theme risk: 71 hex colors (syntax highlighting, error states, charts), light overrides only for… | — | not mapped | open |
| U5 | M | 125 fixed px font sizes and fixed row/header heights: window zoom scales fine, but configured… | C: 125 is App.css alone; 138 combined; no tokens exist. | not mapped | open |
| U6 | M | Details/README tabs are divs without tablist semantics; severity partly color-only; icon-only… | N: Tabs are buttons without tablist semantics; close button unnamed. | not mapped | open |
| U7 | M | Reduced-motion override covers a subset; four different spinner/shimmer durations | W: Two incompatible reduced-motion mechanisms. | not mapped | open |
| U8 | M | Project switch clears selection/details immediately (flash). Any "keep details" fix needs a… | — | not mapped | open |
| U9 | M | Dropdowns absolutely positioned inside overflow:hidden parents → clipping; no shared popover… | — | not mapped | open |
| U10 | L | Terminology: UI "Uninstall" (29) vs protocol/progress "Remove/Removing". Keep "Uninstall" in UI… | — | not mapped | open |
| U11 | L | Sidebar hit targets 16–22 px; scrollbars unthemed; duplicate CSS blocks; !important in… | — | not mapped | open |
| U12 | M | No written interaction model | — | not mapped | open |
| D1 | — | No single owner of synced state | — | not mapped | open |
| D2 | — | Sync bus via static mutable class fields + executeCommand indirection | — | not mapped | open |
| D3 | — | Five refresh verbs | W: `refreshSources` is a sixth verb. | not mapped | open |
| D4 | — | Stringly-typed protocol | — | not mapped | open |
| D5 | — | God files: App.tsx 3,220 · NuGetPackageService.ts 2,474 · SidebarApp.tsx 1,926 ·… | — | not mapped | open |
| D6 | — | Business logic in message handlers and components | — | not mapped | open |
| D7 | — | Caching without a policy | — | not mapped | open |
| D8 | — | Legacy shims | — | not mapped | open |
| D9 | — | No execution context | — | not mapped | open |
| T1 | H | Webview coverage is low exactly where the state bugs are (App.tsx 44.7 %/31 % br). Existing… | — | not mapped | open |
| T2 | H | No Windows CI matrix | W: ExTester UI suite never runs in CI. | P0.8 | closed (P0.8: Windows unit matrix, e2e on VS Code 1.85.0, SDK 10 only by D13) |
| T3 | M | The cross-panel "integration" suite does not connect two webviews to one host (exercises… | W: 955 `as any`; 19 files with sleeps. | not mapped | open |
| T4 | M | CI/package:vsix use npm install with a committed lockfile (optional-dep drift) — fix root… | — | not mapped | open |
| T5 | M | VSIX ships .nvmrc, .vscode-test.mjs, tsconfig.test.json (verified) | W: `.editorconfig` ships; dead entries. | P0.10 | closed (P0.10) |
| T6 | L | engines.vscode ^1.85.0 / @types/vscode 1.85.0: fine as policy; decide the floor via actual… | — | not mapped | open |
| N1 | High | `--no-restore` on CPM projects writes `<Version>` into `.csproj`, NU1008 next restore (1.x `NuGetOperations.ts:132,209… | — | P0.0, P1.10, P6.1; 1.x optional P0.14 | open (P0.0 probe done: SDK 8 only; guard in P1.10, mutator in P6.3) |
| N2 | High | ExTester UI suite never runs in CI. | — | P0.8 | closed (P0.8, run 38227914633) |
| N3 | High | Quarry `.vscodeignore` drops `.claude/**`, `CLAUDE.md`, `.mcp.json`; `check:vsix` not in CI. | — | P0.8, P0.10 | closed (P0.8, P0.10) |
| N4 | Medium | Test files never type-checked. | — | P0.11 | partly closed (P0.11: 2.0 tests and shared helpers; 1.x tests excluded, see N30) |
| N5 | Medium | No release workflow, no dependabot. | — | P0.8, P8.3 | partly closed (P0.8: Dependabot; release workflow open until P8.3) |
| N6 | Medium | Exact pins `[x.y.z]` always reported updatable. | — | P1.3, P2.2, P4.8 | open (versioning side done in P1.3; fixture in P2.2, gating in P4.8) |
| N7 | Medium | README download sends no auth; temp path unvalidated; zip inflate unbounded. | — | P4.4 | open |
| N8 | Medium | Sidebar `_sendInitialData` clears scoped-merge base. | — | P2.11 scenario | open |
| N9 | Medium | Queued mutations discarded when the submitting surface is disposed. | — | P2.1, P2.9 | open |
| N10 | Medium | `_forceCheckScope` merge is dead code (copilot-instructions row wrong). | — | Appendix A; closed by QueryCoordinator | replacement landed (P1.8); the legacy row is deleted with the legacy code at P8.2 |
| N11 | Medium | All-projects update responses uncorrelated. | — | P3.3, P5.9 | open |
| N12 | Medium | `bulkRemoveConfirmed` before fallible work. | — | ADR-007 terminal response | open |
| N13 | Medium | Coverage thresholds global-only. | — | P0.11 | closed (P0.11: floor for src/webview/**; P1.2: floor of 85 % lines for src/core/**) |
| N14 | Medium | SSRF gaps (`127.0.0.0/8`, mapped v6, CGNAT, no resolved-address check). | — | P1.9, P4.2 | open |
| N15 | Medium | Credential-provider shell accepts `$()` in URL. | — | P2.7 | open |
| N16 | Medium | Locale-dependent parsers. | — | P2.6 | open |
| N17 | Low | `restoreSearchQuery` `source` vs `sources`. | — | Moot in 2.0 | moot in 2.0 |
| N18 | Low | No l10n policy. | — | D11 | closed by design (D11) |
| N19 | Low | Multi-TFM resolved versions arbitrary. | — | P2.2, P2.4 | open; reader side done in P2.2 (`AssetsReader.getResolvedVersionsByFramework`), the inspector uses it in P2.4 |
| N20 | Low | nuget.org identity by substring. | — | P2.6 | open |
| N21 | Low | Nested `nuget.config` not discovered. | — | P2.6 | open |
| N22 | Low | Stale `--enable-proposed-api` in e2e config. | — | P0.8 | closed (P0.8) |
| N23 | Low | Plan counts drift from reproducible greps. | — | Ledger states greps | open |
| N24 | Low | Vitest backend `include` omits `src/core`; gates would pass vacuously. | — | P0.11 | closed (P0.11) |
| N25 | Medium | SDK 10.0.401 rewrites `Directory.Packages.props` on every `dotnet package add --version`, even without a version change | — | P6.3 (dirty-file refusal, consumer invalidation) | open |
| N26 | Low | The guard hook sees Edit, Write and simple shell forms only; other writing tools of a session are not matched. | — | accepted limit; the L1 consultation and phase reviews are the backstop | accepted |
| N27 | Low | Builds do not clean `dist/`. | — | P7.2 or P8.1 | open |
| N28 | Low | `npm audit` reports four findings (1 high, 1 moderate, 2 low) through the Mocha 11 that `@vscode/test-cli` needs insid… | — | Dependabot pull requests for the owner | accepted |
| N29 | Medium | Four legacy tests call production code with a signature it does not have, so they assert less than their titles say | — | P5.12 (the 2.0 tests must cover sentinel guards for real) | open |
| N30 | Low | 55 type errors in 1.x tests, benchmarks and integration helpers (14 files with the three fixed ones). | — | P5.12, P8.2 (widen the include when the legacy tests go) | open |
| N31 | Low | `.github/copilot-instructions.md` 1.x gotcha rows give the sidebar watcher debounce as about 5 s. | — | P8.2 (the 1.x gotcha section is deleted) | open |
| N32 | Low | The CI UI job writes `ui-output.txt` into the repository root before `npm run test:ui` packages the VSIX, so that job'… | — | P7.2 | open |
| N33 | Low | The main program type-checks against Node 18.19 declarations while the VS Code 1.85 host is Node 18.15; 18.15.x declar… | — | covered at runtime by the `E2E (1.85.0)` CI job (ADR-000) | accepted |
| N34 | Low | The agent guidance that required `npm install` in CI cited `@emnapi/*` optional dependencies that had left the lockfil… | — | P0.8 (guidance rewritten, CI on `npm ci`) | closed (P0.8) |
| N35 | Low | The id letter D is used twice: | — | convention in this ledger: write "finding D3" for the smells | accepted |
| N36 | Low | The core import fence pattern `**/extension*` (literal from the plan) also matches a core module whose name starts wit… | — | rename such a module, or narrow the pattern in the item that needs it | accepted |
| N37 | Low | The `E2E (1.85.0)` CI job can fail before any test runs when the VS Code download is aborted | — | P7.2 (cache or pre-download VS Code); until then re-run the failed job | open |
| N38 | Low | The list of contract items in plan decision D6 is incomplete: P0.0 and P1.1a are missing. | — | the clause "the items that name them" governs; approval for P1.1a is in the P0 phase review | accepted |
| N39 | Low | The ritual's `npx tsc --noEmit` does not type-check the tests of 2.0 code. | — | run `npm run check-types` in its place (from P1.1a on); P7.5 corrects the wording | open |
| N40 | Low | Benchmarks are discovered only under `src/test/benchmarks/`; a bench file under `src/core/**` is silently not run. | — | P1.3, P1.4 (bench files in `src/test/benchmarks/`); P2.12 (move to core, D8) | open |
| N41 | Low | Repository rulesets make every push to `labs/2.0` and every tag push print "Bypassed rule violations"; the plan does not mention it. | — | owner (document it as expected or adjust the rulesets); sessions do not change repository settings | open |
| N42 | Low | The handoff note `src/protocol/STATUS.md` lies in a frozen path, so the guard denies its edit without the sentinel. | — | P1.1b (record the approval in `docs/plans/STATUS.md` first); P7.5 (exempt `STATUS.md` in the guard, or move the note) | open |
| N43 | Low | The domain comment of `floatingDepth` names 1 to 3 only; the versioning module also emits 0 and 4. | — | the next contract-change item that touches `domain.ts` (candidate P6.5) | open |
| N44 | Low | The first e2e test of the run waits a fixed 10 s for the suite's first `dotnet` command and can fail without product code running. | — | P5.12 (v2 e2e tests poll; legacy file retired); after the third sighting the `e2e` job warms `dotnet` up first | open; mitigated in CI |
| N45 | Low | `TieredCache` logs an unredacted store key, which can carry a source URL with userinfo, when a store write fails. | — | P2.10 (redacting `Logger` for the core) or P4.4 | open |
| N46 | Low | `redact` drops harmless text after a secret query parameter and rewrites some redacted headers with `=`. | — | accepted (the module prefers redacting too much) | accepted |
| N47 | Low | The CLI validators accept a leading `-` for positional arguments (package id, source name, local feed path). | — | P2.6 (reject a leading `-`); P1.10 did not take it (advisor ruling) | open |
| N48 | Low | Local gates ran without `DOTNET_ROOT` and `NUIGET_SDK_TESTS`, which CI sets; three runner tests depended on the difference. | — | P1.6 (tests fixed, gotcha row); P7.5 (ritual wording) | partly closed |
| N49 | Medium | `classifyAddress` treats all of 192.0.0.0/16, 198.51.0.0/16 and 203.0.0.0/16 as reserved; only one /24 in each is. | — | P4.2 (before `Transport` checks resolved addresses with it) | open |
| N50 | Low | A throwing `onCommand` hook turned a finished CLI step into a failed one (quarry workflow code). | — | P1.10 | closed |
| N51 | Low | The workflow passes a literal `isCpm: false` to `addPackageArgs`; correct while every CPM add/update is refused first, a trap from P6.3 on. | — | P6.3 | open |
| N52 | Low | `rootProject` reported an empty `<Project></Project>` as no project. | — | P2.2 | closed |

Corrections in Appendix A that do not belong to one finding id:

- `M1` (W): Must also move source CRUD, CLI search, `nuget locals` to the project dir.
- `M2` (W): Must gate `resolveIconUrl` nuget.org HEAD, `getPackageSize`, quick-search default.
- `AppA-8/9/13` (W): All line counts stale in both docs; watcher timing wrong in both; README documents the migration 2.0 deletes.
- `B:F1-NU1008` (W): Default bulk path is the failing one on SDK 8 (one probe).

Change codes: **W** widened, **N** narrowed, **C** confirmed with precision edits, **X** closed by a design
decision.

## 2. Original ledger (audit of 2026-10-10, unchanged)


Severity: **C** critical · **H** high · **M** medium · **L** low. IDs are stable for tracking across sessions.

#### 2.1 Security, CLI, privacy

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| S1 | H | **Shell command strings** for every dotnet call (`exec`); package ids/versions are regex-validated, but **project/config file paths** and quoted source URLs are not escaped (`"`, `$(…)`, backticks on POSIX; `%VAR%`/`^` on cmd.exe). Mitigated by `untrustedWorkspaces.supported:false`, still the wrong primitive. | `NuGetUtils.ts:161`; `NuGetCliService.ts:199-205, 245-252, 296-299, 317, 345-349`; `NuGetSourceService.ts:105,195,231`; `NuGetProjectService.ts:346`; `NuGetPackageService.ts:1008`; `NuGetConfigParser.ts:34` **[verified]** |
| S2 | M | **Redundant, locale-dependent success classification.** Non-zero exits *are* rejected by `execWithTimeout` (correct), but an exit-zero command with "error" anywhere in stderr (e.g. a warning text) is reported as failed; non-English SDK output changes behavior. | `NuGetCliService.ts:207, 254` **[verified; corrected from draft]** |
| S3 | L | DPAPI decryption runs PowerShell through a shell string; input is base64-validated and passed via `-EncodedCommand`, so this is consolidation, not an exploitable hole. | `CredentialService.ts:257, 288-292` **[verified]** |
| S4 | M | SSRF/redirect guard is host-string based (no resolved-address check, IPv4-mapped IPv6); redirect logic exists in three places. | `Http2Client.ts:14-51`, `NuGetService.ts:1033-1106`, `NuGetPackageService.ts:1278-1284` **[reported]** |
| S5 | L | Credential redaction is header-pattern based; CLI stderr / URL userinfo can leak into logs. | `NuGetLogger.ts:51-55` **[reported]** |
| S6 | M | Main-panel CSP `img-src` is a fixed badge-host allow-list; icons resolved from private feeds are blocked (falls back to default icon with console CSP errors) — backend custom-source icon HEAD requests + circuit breaker are wasted for most private feeds. Sidebar CSP has no remote `img-src` (docs claim `https:`). An origin allow-list is *not* the fix (icon CDNs, no auth on `<img>`, stale after source changes) → host-side icon fetch policy (§3). | `NuGetPanel.ts:1398`, `NuGetSidebarPanel.ts:1436` **[verified]** |
| **M2** | **H** | **Private package IDs leak to nuget.org.** `getPackageSearchMetadata()` always calls `https://api.nuget.org/v3/index.json` → search by `packageid:` for installed-package enrichment, before/regardless of configured private sources. | `NuGetPackageService.ts:444-452, 2211-2216` **[verified, new]** |

#### 2.2 Operations, request lifecycle, cross-panel sync

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| Y1 | H | **Handlers without `try/catch` never answer on failure** (`getPackageVersions`, `getPackageMetadata`, `fetchReadmeFromPackage`, `getSources`, `add/remove/enable/disableSource`, `getConfigFiles`): the global catch shows a toast; loading flags never clear. | `NuGetPanel.ts:258-262, 886-960, 1300-1313`; `NuGetSidebarPanel.ts:1017-1031` **[verified]** |
| Y2 | H | **Queue admission ignored** for install/update/remove/bulk*: `enqueue()` returns `false` when `MAX_WAITING=5` is exceeded → no `*Result`, permanent spinner (only `restoreProjectsBatch` handles it). **Also:** errors thrown *inside* queued work are swallowed by the queue (`console.error` + toast) and never produce a webview result — a host-level try/catch wrapper cannot fix this because the handler returns at enqueue time. | `NuGetPanel.ts:662-700, 1150-1157, 1313-1337`; `NuGetSidebarPanel.ts:852-947`; `OperationQueue.ts` **[verified]** |
| Y3 | H | **`restoreProject` and forced transitive restore bypass the OperationQueue** → `dotnet restore` can run concurrently with a mutation of the same `.csproj`. Design constraint for the fix: queue *top-level workflows only* — enqueueing a restore from inside an already-queued bulk op would deadlock. | `NuGetPanel.ts:361-367, 394-396` **[verified]** |
| Y4 | H | **Shared debounce timer** between `refresh` and `refreshScoped`: a scoped refresh within 300 ms cancels a pending full refresh (e.g. watcher refresh swallowed by a sidebar op). Splitting timers alone preserves redundant overlapping work → needs a union-of-scopes scheduler. | `App.tsx:711-780` **[verified]** |
| Y5 | H | **`skipNextUpdateCheckRef` lingers** when `refreshScoped` triggers `getInstalledPackages` and both the installed list *and* its metadata come back unchanged (the `[installedPackages]` effect never fires) → the next legitimate update check (e.g. after a prerelease toggle) is silently skipped. | `App.tsx:740-780, 451-459` **[verified; conditions narrowed]** |
| Y6 | H | **Scoped background merge resurrects deleted projects**: starts from `_pendingProjectUpdates.filter(p ≠ scoped)` and never reconciles with the live project list (incl. zero-project case). | `NuGetSidebarPanel.ts:254-262` **[verified]** |
| Y7 | M | **Redundant refresh emission on full refresh**: `fullRefresh → onRefreshAll → refreshSidebar() → checkUpdatesInBackground(true) → _notifyMainPanel() → NuGetPanel.refresh()`. Often coalesced by the 300 ms debounce / unchanged-data short-circuit, but it is a second refresh path that the docs claim does not exist. | `NuGetPanel.ts:725-754`, `NuGetSidebarPanel.ts:307-315, 620-632` **[verified; impact corrected]** |
| Y8 | M | Auto-selected project not persisted (two sites) → surfaces can restore different selections. | `NuGetSidebarPanel.ts:227-230, 1344-1347` **[verified]** |
| Y9 | L | Dead protocol traffic: `restoreChanged` is posted to the sidebar webview, which has no handler (restore state lives in the host + title-bar context key, which is fine). | `NuGetSidebarPanel.ts:555-567` **[verified; downgraded]** |
| Y10 | M | `syncProject()` awaits `findProjects()` before posting → rapid selections can arrive out of order. | `NuGetSidebarPanel.ts:571-590` **[verified]** |
| Y11 | M | Bulk install notifies the other panel with only the **first** successful project path → scoped re-check covers one project. | `NuGetOperations.ts:160-161` **[verified]** |
| Y12 | M | No request correlation on versions/metadata/readme/update responses; guards compare `packageId` case-sensitively or `projectPath` only → late responses for a previous version/prerelease state can populate the current selection. | `App.tsx:843-865, 887-917, 1363-1378` **[reported, consistent with host code]** |
| Y13 | L | Panel re-creation replays `_cachedSearchQuery` after a fixed 100 ms, before `settings`/`sources` arrive. | `NuGetPanel.ts:214-222` **[verified]** |
| Y14 | L | `searchPackages` staleness guard keys on `query` only (not source/prerelease/exactMatch). | `NuGetPanel.ts:560-620` **[verified]** |
| Y15 | M | `queryAllProjectsUpdates` returns `[]` silently when no remote source resolves (offline / local-only feeds) → UI says "no updates" instead of "sources unreachable"; results in completion order. | `NuGetOperations.ts:581-606` **[verified]** |
| Y16 | M | `_forceCheckPending` re-run is fire-and-forget, no generation/abort, not cancelled on dispose → late results mutate caches after disposal. | `NuGetSidebarPanel.ts:320-328, 384-396` **[verified]** |
| Y17 | L | `NuGetPanel.refresh()/refreshScoped()` bypass `_postMessage` (disposed guard). | `NuGetPanel.ts:124-136` **[verified]** |
| Y18 | L | Six verbatim `testSourceConnectivity().then(…)` blocks, no `.catch`. | `NuGetPanel.ts:704-868` **[verified]** |
| Y19 | H | Bulk install reports success from the **reference edit** only; restore outcomes are ignored in the final report. | `NuGetOperations.ts:87-165` **[verified]** |

#### 2.3 Project model, NuGet semantics, multi-root

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| F1 | C | **CPM read model wrong** (see summary). Separate concern: **CPM mutation behavior is SDK-dependent and unverified** — newer SDKs' `dotnet package add` can update the central version; older ones write `--version` into the project (NU1008). Must be verified per SDK before any write path ships. | `NuGetProjectService.ts:285-337, 349-373`; `NuGetUtils.ts:323-327` **[verified; write-path claim narrowed]** |
| F2 | H | Regex `.csproj` parsing ignores `Update=`, `VersionOverride`, `Condition` (multi-TFM duplicates), XML comments, `Directory.Build.props` package refs, imports, `$(Property)` expansion. Static XML walking **cannot** become authoritative (only the nearest `Directory.Packages.props` auto-imports; conditions must be *evaluated*, not captured). | `NuGetProjectService.ts:291-320` **[verified]** |
| F3 | M | Version handling: comparator is reasonable (zero-pads, 4-part, build metadata ignored, prerelease precedence) but malformed components collapse to `0` (`'unknown'` ≡ `0.0.0`, which is how F1 becomes "everything updatable"), and **version vs. version-spec vs. resolved-version are not distinct types** (a raw spec like `[1.0.0]` can reach a comparator). Needs a conformance table, not a rewrite by assumption. | `NuGetUtils.ts:314-436` **[verified; narrowed]** |
| F5 | L | In-flight dedup **exists** for versions/metadata; inventory which paths bypass it (search, icons, nuspec, readme) instead of adding a generic layer. | `NuGetPackageService.ts:82-83, 1304, 1691` **[verified; narrowed]** |
| **F6** | **M** | **Metadata inner cache key omits `source`** (`${id}@${version}`) while the dedupe key includes it → cross-feed metadata bleed. | `NuGetPackageService.ts:1691-1703` **[verified, new]** |
| **M1** | **H** | **Multi-root/SDK context inconsistency:** `getSources()` → `dotnet nuget list source` with `cwd = workspaceFolders[0]`; `restoreProject()` `cwd = workspaceFolders[0]`; install/update/remove `cwd = dirname(project)`. Different effective `nuget.config` hierarchy and `global.json` SDK for the same project; package-source mapping and `<clear/>` not modelled. | `NuGetConfigParser.ts:30-34`, `NuGetCliService.ts:345-349` vs `:201-205` **[verified, new]** |
| M3 | M | `.NET 10 dotnet package list` performs an **implicit restore** — the "read" fallback in `getInstalledPackages` is a mutation outside the queue. | `NuGetProjectService.ts:340-346`; .NET docs **[verified path; behavior per docs]** |
| M4 | M | Solution awareness: "All Projects" = every `*.csproj/fsproj/vbproj` found by glob, not solution membership; `packages.config` / non-SDK projects are not detected as unsupported (they show an empty/odd list). | `NuGetProjectService.findProjects` **[reported]** |
| M5 | M | Bespoke Node HTTP transport does **not** inherit VS Code proxy settings (`http.proxy`, `http.proxyStrictSSL`, `http.systemCertificates`) — corporate-proxy users may get failures the CLI does not have. | `Http2Client.ts`, `NuGetService.ts fetch*` **[reported; design concern]** |

#### 2.4 Performance

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| P1 | H | Main panel and sidebar **independently compute updates for the same project** (`checkPackageUpdates` vs `checkPackageUpdatesMinimal`), each re-running `findProjects()` globs and source resolution; no shared query ownership. | `App.tsx:1659-1686`, `NuGetSidebarPanel.ts:239-250` **[verified]** |
| P2 | M | Two independent webview bundles (546 KB + 276 KB) — expected for two webview environments; verify highlight.js subset and shared-chunk benefit by metafile before changing. | `dist/` **[verified sizes]** |
| P4 | L | HTTP/2 LRU eviction `close()`s a session that may have active streams (graceful close; impact unproven — needs a demonstrated failure before rework). | `Http2Client.ts:206-225` **[reported; narrowed]** |
| P5 | M | Health-monitor re-scheduling can overlap when a source mutation restarts it mid-pass. | `NuGetService.ts:252-258` **[reported]** |
| P6 | L | `aggregateAllProjectsTransitive` linear `find` in nested loops. | `utils/aggregateAllProjectsTransitive.ts:64-78` **[reported]** |
| P7 | L | `getSources()` returns the cached array by reference. | `NuGetSourceService.ts:43-60` **[reported]** |
| P8 | M | Benchmarks are micro-benchmarks of pure functions (`parseSearchQuery` ≈ 21 M ops/s) vs a single-machine baseline — noisy CI gate unrelated to user latency; the `[perf]` channel is the useful instrument. | `src/test/benchmarks/*` **[verified run]** |

#### 2.5 UX flow, visual design, accessibility

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| U1 | H | Sidebar row **primary action button is hover-revealed with `tabIndex={-1}`**; section-level handlers do provide Enter/Ctrl+Enter/Delete shortcuts, but they are undiscoverable, lack announcements, and the all-projects installed list has no equivalent handler. | `PackageRow.tsx:128-132`, `SidebarApp.css:340-354`, `SidebarApp.tsx:1132-1146` **[verified; narrowed]** |
| U2 | H | **No dialog semantics anywhere** (0 × `role="dialog"`/`aria-modal`): Source Settings overlay, multi-install popup — no focus trap/restore, inconsistent Escape. | grep; `SourceSettingsOverlay.tsx:85-95`, `PackageDetailsPanel.tsx:316-365` **[verified]** |
| U3 | H | Tab focus ring **animates to transparent** (`tab-focus-fade`). | `App.css:680-693` **[verified]** |
| U4 | M | Theme risk: 71 hex colors (syntax highlighting, error states, charts), light overrides only for README code, partial HC coverage, no `forced-colors`, `opacity` for disabled/stale. Counts are evidence to audit per-site, not proof each is wrong. | `App.css` **[verified counts]** |
| U5 | M | 125 fixed `px` font sizes and fixed row/header heights: window zoom scales fine, but configured `editor.fontSize`/`window.zoomLevel`-independent font settings and text enlargement are not honored; long ids clip. | `App.css`, `SidebarApp.css` **[verified counts]** |
| U6 | M | Details/README tabs are `div`s without tablist semantics; severity partly color-only; icon-only buttons rely on `title`; labels not associated; missing `aria-expanded`. | `PackageDetailsPanel.tsx:391-392, 470-518`, `SourceSettingsOverlay.tsx:92-143, 204-210` **[reported]** |
| U7 | M | Reduced-motion override covers a subset; four different spinner/shimmer durations. | `App.css:3549-3564` **[reported]** |
| U8 | M | Project switch clears selection/details immediately (flash). Any "keep details" fix needs a safety contract (retained details visibly tied to the old context or non-actionable until validated) to avoid operating on the wrong project. | `App.tsx:1452-1501` **[reported]** |
| U9 | M | Dropdowns absolutely positioned inside `overflow:hidden` parents → clipping; no shared popover layer; z-index magic numbers. | `App.css:866-910, 2849-2878` **[reported]** |
| U10 | L | Terminology: UI "Uninstall" (29) vs protocol/progress "Remove/Removing". Keep "Uninstall" in UI (matches Visual Studio); `remove` only in protocol. | grep **[verified]** |
| U11 | L | Sidebar hit targets 16–22 px; scrollbars unthemed; duplicate CSS blocks; `!important` in collapsed state. | `SidebarApp.css:196-215, 300-367, 582` **[verified !important]** |
| U12 | M | **No written interaction model**: how search/installed/updates modes relate, what "All Projects" means, where active project/source/operation scope is visible, how pending/stale/failed/partial/restored states differ, how a CPM change communicates its multi-project impact. Restructuring files without this yields "cleaner files, same confusing product". | — **[design gap]** |

#### 2.6 Architecture smells (why it is a quilt)

| ID | Finding |
|---|---|
| D1 | **No single owner of synced state** — project/source/prerelease/restore are persisted by three writers (`NuGetPanel.saveSettings`, sidebar pickers, extension migration) and reconciled with one-shot booleans. |
| D2 | **Sync bus via static mutable class fields + `executeCommand` indirection**; order-dependent, untestable in isolation. |
| D3 | **Five refresh verbs** with implicit contracts; no invariant anyone can test. |
| D4 | **Stringly-typed protocol** at the webview edge; partially typed on the host; the same concept has different field names per webview (`sourceChanged.source` vs `.selectedSource`). |
| D5 | **God files**: `App.tsx` 3,220 · `NuGetPackageService.ts` 2,474 · `SidebarApp.tsx` 1,926 · `InstalledTab.tsx` 1,616 · `NuGetSidebarPanel.ts` 1,447 · `NuGetPanel.ts` 1,414; facade wires sub-services through arrow-function "deps". |
| D6 | **Business logic in message handlers and components**, duplicated between surfaces (aggregation, optimistic reconciliation, version compare). |
| D7 | **Caching without a policy**: ≥10 ad-hoc caches with different TTL/eviction/invalidation + `WorkspaceCache` + webview `LRUMap`s, cleared by hand-synchronized `clear*` entry points; cache keys miss dimensions (F6). |
| D8 | **Legacy shims** for a client that ships with its server (`allProjectsInstalled*`, legacy `execWithTimeout` signature, `nuiget.noRestore` migration). With "no backward compatibility" these are pure deletions. |
| D9 | **No execution context**: project directory, SDK, effective NuGet config, feed identity/credential scope and artifact freshness are implicit/global (M1, M2, F6 are symptoms). |

#### 2.7 Tests, build, CI, packaging

| ID | Sev | Finding |
|---|---|---|
| T1 | H | Webview coverage is low exactly where the state bugs are (App.tsx 44.7 %/31 % br). Existing race/cancellation coverage exists in places (e.g. enqueue-time restore snapshot test, `NuGetPanel.test.ts:827`) — keep it. Missing: stale-response generations, sync echo sequences, deleted-project eviction, queue-full/exception-after-admission, README failure, dialog focus. |
| T2 | H | **No Windows CI matrix** (DPAPI, PowerShell, path casing, cmd.exe quoting are Windows-specific). No extension-host run at the **minimum supported VS Code version** vs current stable; no SDK matrix (8/9/10, missing SDK, unavailable pinned SDK). |
| T3 | M | The cross-panel "integration" suite does not connect two webviews to one host (exercises services/mocks); many host tests assert `expect.objectContaining({ type })` only; privates accessed via `(x as any)`; real `setTimeout` sleeps in `NuGetUtils.test.ts:597-672`. |
| T4 | M | CI/`package:vsix` use `npm install` with a committed lockfile (optional-dep drift) — fix root cause; actions pinned by tag; no e2e artifacts; no VSIX artifact. |
| T5 | M | VSIX ships `.nvmrc`, `.vscode-test.mjs`, `tsconfig.test.json` (**verified**). |
| T6 | L | `engines.vscode ^1.85.0` / `@types/vscode 1.85.0`: fine as policy; decide the floor via actual dependency/extension-host compatibility, not API wish-lists (l10n, TestController etc. already exist in 1.85). |

## 3. Corrections to the original ledger (execution plan, Appendix A)

Three-lens verification of the original findings against `main` produced these changes.

| ID | Change | Essence |
|---|---|---|
| S1 | W | Free-text search query and webview `configFile` also interpolated unescaped. Moot in 2.0 (argv). |
| S2 | W | Locale affects output parsers too; pin env on every spawn; prefer JSON / `nuget config paths`. |
| S4 | C | Redirect decision already centralised; fetch loop is what is triplicated. |
| S5 | W | `--password` on argv is inherent; token-only userinfo unredacted; toasts show raw stderr. |
| M1 | W | Must also move source CRUD, CLI search, `nuget locals` to the project dir. |
| M2 | W | Must gate `resolveIconUrl` nuget.org HEAD, `getPackageSize`, quick-search default. |
| M3 | X | Closed by D13: `dotnet package list --no-restore`. |
| F1 | C | Anchors `:329-334`/`:354`; read-side mechanism not SDK-specific. |
| F2 | W | Multi-TFM resolution arbitrary. |
| Y1 | W | More unwrapped handlers; fixed by ADR-007 terminal-response guarantee. |
| Y6 | W | Also drops live projects (`_sendInitialData` clears merge base). |
| Y7 | W | Real second reload. |
| Y12 | W | Both surfaces + all-projects path. |
| Y13 | W | `_webviewReady` write-only. |
| Y16 | W | Untracked 2 s timer; no provider-level disposal guard. |
| Y17 | N | Consistency only. |
| P1 | N | Per-surface glob clause holds for the sidebar path only. |
| P8 | N | Bench compare never fails; display-only. |
| U1 | C | Four more `tabIndex={-1}` controls. |
| U2 | C | Third dialog: remove-source confirm. |
| U5 | C | 125 is App.css alone; 138 combined; no tokens exist. |
| U6 | N | Tabs are buttons without tablist semantics; close button unnamed. |
| U7 | W | Two incompatible reduced-motion mechanisms. |
| D3 | W | `refreshSources` is a sixth verb. |
| T2 | W | ExTester UI suite never runs in CI. |
| T3 | W | 955 `as any`; 19 files with sleeps. |
| T5 | W | `.editorconfig` ships; dead entries. |
| AppA-8/9/13 | W | All line counts stale in both docs; watcher timing wrong in both; README documents the migration 2.0 deletes. |
| B:F1-NU1008 | W | Default bulk path is the failing one on SDK 8 (one probe). |

## 4. New findings

### N1 to N24 (execution plan, Appendix A)

| ID | Sev | Finding | Scheduled |
|---|---|---|---|
| N1 | High | `--no-restore` on CPM projects writes `<Version>` into `.csproj`, NU1008 next restore (1.x `NuGetOperations.ts:132,209,283,393`; 2.0 `PackageWorkflows.ts:51,100,171`). **P0.0 probe (2026-10-12):** SDK 10.0.401 writes the central version under `--no-restore`, puts no `<Version>` in the project, and the next restore succeeds; SDK 8.0.425 reproduces the corruption on the same fixture, so N1 as measured is SDK 8 behaviour (SDK 9 unprobed). D7 unchanged. Evidence: `src/core/cli/__fixtures__/sdk-probes/10.0.401.json`, `docs/adr/004-sdk-probes.md`. | P0.0, P1.10, P6.1; 1.x optional P0.14 |
| N2 | High | ExTester UI suite never runs in CI. | P0.8 |
| N3 | High | Quarry `.vscodeignore` drops `.claude/**`, `CLAUDE.md`, `.mcp.json`; `check:vsix` not in CI. | P0.8, P0.10 |
| N4 | Medium | Test files never type-checked. | P0.11 |
| N5 | Medium | No release workflow, no dependabot. | P0.8, P8.3 |
| N6 | Medium | Exact pins `[x.y.z]` always reported updatable. | P1.3, P2.2, P4.8 |
| N7 | Medium | README download sends no auth; temp path unvalidated; zip inflate unbounded. | P4.4 |
| N8 | Medium | Sidebar `_sendInitialData` clears scoped-merge base. | P2.11 scenario |
| N9 | Medium | Queued mutations discarded when the submitting surface is disposed. | P2.1, P2.9 |
| N10 | Medium | `_forceCheckScope` merge is dead code (copilot-instructions row wrong). | Appendix A; closed by QueryCoordinator |
| N11 | Medium | All-projects update responses uncorrelated. | P3.3, P5.9 |
| N12 | Medium | `bulkRemoveConfirmed` before fallible work. | ADR-007 terminal response |
| N13 | Medium | Coverage thresholds global-only. | P0.11 |
| N14 | Medium | SSRF gaps (`127.0.0.0/8`, mapped v6, CGNAT, no resolved-address check). | P1.9, P4.2 |
| N15 | Medium | Credential-provider shell accepts `$()` in URL. | P2.7 |
| N16 | Medium | Locale-dependent parsers. | P2.6 |
| N17 | Low | `restoreSearchQuery` `source` vs `sources`. | Moot in 2.0 |
| N18 | Low | No l10n policy. | D11 |
| N19 | Low | Multi-TFM resolved versions arbitrary. | P2.2, P2.4 |
| N20 | Low | nuget.org identity by substring. | P2.6 |
| N21 | Low | Nested `nuget.config` not discovered. | P2.6 |
| N22 | Low | Stale `--enable-proposed-api` in e2e config. | P0.8 |
| N23 | Low | Plan counts drift from reproducible greps. | Ledger states greps |
| N24 | Low | Vitest backend `include` omits `src/core`; gates would pass vacuously. | P0.11 |

### N25 onwards (found while executing the plan)

| ID | Sev | Finding | Found in | Addressed by |
|---|---|---|---|---|
| N25 | Medium | SDK 10.0.401 rewrites `Directory.Packages.props` on every `dotnet package add --version`: blank lines and the final newline are stripped, even when the version is unchanged and under `--no-restore`. Evidence: `src/core/cli/__fixtures__/sdk-probes/10.0.401.json`, `docs/adr/004-sdk-probes.md`. | P0.0 | P6.3 (dirty-file refusal, consumer invalidation) |
| N26 | Low | The guard hook sees Edit, Write and simple shell forms only. Shell rewrites of frozen paths (`python3 - <<EOF`, `sed -i`, redirection), directory removals such as `git rm -r src/protocol`, and `*.test.mjs` deletions pass. Widened in P1.1a: the hook matcher is `Edit\|Write\|Bash` and the guard returns no decision for any other tool, so a session's other writing tools are not covered. The P1.1a session also had `NotebookEdit` and a tool that runs commands in the user's terminal (`mcp__terminal__run_in_terminal`); neither was used. Evidence: `scripts/hooks/guard.mjs`, `.claude/settings.json`. | P0.5 | accepted limit; the L1 consultation and phase reviews are the backstop |
| N27 | Low | Builds do not clean `dist/`. After switching entry sets, files of the other set (for example the 1.x CSS after `--v2`) remain, `check:vsix` passes and they would be packaged. | P0.10 | P7.2 or P8.1 |
| N28 | Low | `npm audit` reports four findings (1 high, 1 moderate, 2 low) through the Mocha 11 that `@vscode/test-cli` needs inside a Node 18 extension host. Development-only, never in the VSIX. The override that hid them made the e2e suite unable to start on VS Code 1.85. | P0.8 | Dependabot pull requests for the owner |
| N29 | Medium | Four legacy tests call production code with a signature it does not have, so they assert less than their titles say: `src/webview/NuGetSidebarPanel.test.ts:2000-2032` (`sentinel guards`: constructor gets 3 of 4 arguments, `resolveView` an ignored second one; the `not.toHaveBeenCalled` assertions are vacuous); `src/test/benchmarks/project-parsing.bench.ts:33-36` (private method, ignored second argument); `src/webview/app/components/InstalledTab.test.tsx:246-249` (`projects` is not a prop); `src/test/integration/NuGetPanel.integration.test.ts:43-49` (`dependencyGroups` is not on `PackageMetadata`). | P0.11 | P5.12 (the 2.0 tests must cover sentinel guards for real) |
| N30 | Low | 55 type errors in 1.x tests, benchmarks and integration helpers (14 files with the three fixed ones). They are excluded from `tsconfig.vitest.json` instead of fixed. Reproduce: a strict config over `src` with `types: [node, vitest/globals]`, excluding `src/test/e2e` and `src/test/ui`. | P0.11 | P5.12, P8.2 (widen the include when the legacy tests go) |
| N31 | Low | `.github/copilot-instructions.md` 1.x gotcha rows give the sidebar watcher debounce as about 5 s. The code uses 2000 ms and a 1000 ms re-arm (`src/webview/NuGetSidebarPanel.ts:151,376`). ARCHITECTURE.md was corrected in P0.12. | P0.12 | P8.2 (the 1.x gotcha section is deleted) |
| N32 | Low | The CI UI job writes `ui-output.txt` into the repository root before `npm run test:ui` packages the VSIX, so that job's test VSIX contains the log (18 files instead of 17). The published `vsix` artifact comes from the build job and is not affected. | P0.8 | P7.2 |
| N33 | Low | The main program type-checks against Node 18.19 declarations while the VS Code 1.85 host is Node 18.15; 18.15.x declarations are incompatible with TypeScript 6. APIs added in 18.16 to 18.19 pass type-checking. | P0.9 | covered at runtime by the `E2E (1.85.0)` CI job (ADR-000) |
| N34 | Low | The agent guidance that required `npm install` in CI cited `@emnapi/*` optional dependencies that had left the lockfile in `660b78b`. | P0.8 | P0.8 (guidance rewritten, CI on `npm ci`) |
| N35 | Low | The id letter D is used twice: decisions D1 to D13 in the execution plan and architecture-smell findings D1 to D9 in the original ledger. | P0.13 | convention in this ledger: write "finding D3" for the smells |
| N36 | Low | The core import fence pattern `**/extension*` (literal from the plan) also matches a core module whose name starts with "extension". | P0.7 | rename such a module, or narrow the pattern in the item that needs it |
| N37 | Low | The `E2E (1.85.0)` CI job can fail before any test runs: `@vscode/test-cli` aborted the download of VS Code 1.85.0 three times within one second ("Error downloading, retrying … aborted", "Failed to download and unzip VS Code 1.85.0"). Seen once, on run 38233521574 for a documentation-only commit; `gh run rerun 38233521574 --failed` passed. | P0.13 | P7.2 (cache `.vscode-test` or pre-download with back-off); until then re-run the failed job |
| N38 | Low | Plan decision D6 lists the items that may change the frozen contracts as P0.9, P1.1b, P2.8, P4.1 and P6.2. The list is incomplete: the row of P0.0 names `docs/adr/004-sdk-probes.md`, and the row of P1.1a names `src/protocol/**` and `src/core/contracts.ts` and says "sentinel required". P0.0 also added an index entry to `docs/adr/README.md`. | P0 phase review | the clause "change only in the items that name them" governs; the phase review in `docs/plans/STATUS.md` records the approval for the P1.1a sentinel. The plan text is the owner's to correct |
| N39 | Low | Plan §2.2 steps 3 and 5 run `npx tsc --noEmit`, which checks `tsconfig.json` only, and that program excludes `src/**/*.test.ts`. The tests of 2.0 code are checked by `tsc -p tsconfig.vitest.json`, which runs only inside `npm run check-types`. An item outside host, services and esbuild never runs that locally, so a type error in its tests shows up in CI (job Build & Package) after the push. | P0 phase review | from P1.1a on the session runs `npm run check-types` wherever the ritual says `npx tsc --noEmit`; P7.5 corrects the wording of the plan and `RUN.md` |
| N40 | Low | `vitest.config.mts` sets `benchmark.include` to `src/test/benchmarks/**/*.bench.ts`, and `src/test/benchmarks/run.mjs` selects the derived `backend (bench)` project. A bench file under `src/core/**` is not run and nothing reports that. The gates of P1.3 and P1.4 ("`npm run bench` runs the file") need the file under `src/test/benchmarks/`. | P0 phase review | P1.3 and P1.4 place their bench files in `src/test/benchmarks/`; P2.12 moves the benches into core (D8) and names the configuration change |
| N41 | Low | Two repository rulesets restrict the refs the plan pushes: `labs` (id 14504177, `refs/heads/labs/**/*`, rules `update`, `creation`, `required_status_checks`, `required_linear_history` and others) and `tags` (id 12525027, all tags, rules `creation`, `update`, `required_linear_history`). The repository admin role is a bypass actor with mode `always`, and sessions push with the owner's credentials. Every push therefore succeeds and prints `remote: Bypassed rule violations`: "3 of 3 required status checks are expected", "Waiting for Code Scanning results" and "Cannot update this protected ref" for the branch (push of `ac64e72`); "Cannot create ref due to creations being restricted" and "This branch must not contain merge commits" (`89f4426`, a merge on `main`) for a tag. No force or admin flag is involved. Neither the plan nor `RUN.md` mentions the rulesets, so the message reads like a violation. Evidence: `gh api repos/gasrulle/nuiget/rulesets/14504177`, the push of `7d407df` and of the tag `labs/2.0-P0-done`. | P0 phase boundary | owner: note in `RUN.md` that the message is expected, or change the rulesets. A session never changes repository settings |
| N42 | Low | The guard treats every path under `src/protocol/**` as frozen, including the directory's handoff note `src/protocol/STATUS.md`. Without `.claude/.contract-change` an Edit of the note is denied, and the denial message asks to record the advisor's answer "in the directory's STATUS.md", the file it has just refused. Decision D6 creates the sentinel only after the recorded approval, so the approval of a contract item cannot be recorded in that note first. Evidence: `scripts/hooks/guard.mjs` (frozen paths), the denied Edit in P1.1a. | P1.1a | P1.1b recorded the approval in `docs/plans/STATUS.md` ("Advisor decisions"), created the sentinel, then copied the answer into the note; the advisor confirmed that order. P7.5 decides between exempting `STATUS.md` in the guard and moving the note out of the frozen path |
| N43 | Low | `src/protocol/domain.ts:21` documents `floatingDepth` as "major=1, minor=2, patch=3" only. `src/core/versioning/VersionRange.ts` also emits 0 (`*`, `*-*`) and 4 (a prerelease wildcard after a full version, `1.0.0-*`), and 1.x emitted 3 for that last case (`src/services/NuGetUtils.ts:277`). Nothing consumes the field in 2.0 yet. | P1.3 | the next advisor-approved contract-change item that touches `domain.ts` (candidate P6.5, with its own sentinel); the comment then becomes ``/** For floating versions: the position of the wildcard counted in fixed components (`1.*` = 1 major, `1.0.*` = 2 minor, `1.0.0.*` = 3 patch; 0 for `*`; 4 for a prerelease wildcard such as `1.0.0-*`). */`` |
| N44 | Low | Either `E2E` CI job can fail in `Update Flow › install old version then update to latest` (`src/test/e2e/update-flow.e2e.test.ts:36-75`) without any product code path running: 1.3 s after the extension host starts, the test sends the suite's first `dotnet` command (`dotnet add … --no-restore`) through an integrated terminal, sleeps a fixed 10 s (`:45`) and asserts the `.csproj` content (`:48-51`); the `e2e` job has no `dotnet` warm-up step (the `test` job runs `dotnet --version`, `ci.yml:102`). Seen twice. Run 38247897134 on b8bfb9c, `E2E (1.85.0)`: failure 10.07 s after the suite started, 29 of 30 tests passing, `E2E (stable)` of the same run green (same test, 30009 ms), the five earlier 1.85.0 runs of the day green; `gh run rerun 38247897134 --failed` → green (`E2E (1.85.0)` and `Build & Package` success). Run 38263689535 on d3abc12 (P1.9, which changes nothing the e2e job builds), `E2E (stable)` on VS Code 1.141.0: the same first assertion failed 10.05 s after the suite started, `E2E (1.85.0)` of the same run green; `gh run rerun 38263689535 --failed` → green. So the flake is not tied to one VS Code version; two sightings in about a dozen runs of the day. Third sighting: run 38274861212 on 1fa8f6e (P2.2, which changes nothing the e2e job builds), `E2E (1.85.0)`: `Update Flow` started 16:05:11.81, the first test failed at 16:05:21.85 with the same assertion, 29 of 30 passing, `E2E (stable)` green; `Build & Package` was skipped because it needs the e2e job; `gh run rerun 38274861212 --failed` issued. On a failed first assertion the test also skips `installTerminal.dispose()` (`:52`). 28 fixed `setTimeout` sleeps exist in 8 of the 9 legacy e2e files; those 8 files are among the 22 of this ledger's count of test files that call `setTimeout(`, whose label says unit tests. | P1.3 | until the legacy e2e files are retired, re-run the failed job; a second identical failure on the same SHA is a stop-and-ask (warm-up step in the `e2e` job, or polling in the test); amended by the P1 phase review (2026-10-12): on the third sighting on any SHA the session adds, without a further brief and as a commit of its own citing N44, a warm-up step to the `e2e` job of `.github/workflows/ci.yml` after `setup-dotnet` and before the tests (`run: dotnet --version && dotnet msbuild -version`), updates this row and the gotcha row "A red CI run is not always a code failure" in the same commit, and re-runs (done after the third sighting: step `Warm up dotnet` in the `e2e` job; a further sighting with the step in place is a stop-and-ask); P3.5 and P5.12 write the v2 e2e tests with bounded polling of the project file instead of fixed sleeps; P5.12 retires the legacy file |
| N45 | Low | `TieredCache` logs the whole store key when a write to the persistent store fails (`src/core/cache/TieredCache.ts:369-372`, quarry code). A key carries the source URL (`cacheKeys` in `CachePolicy.ts`), and a source URL can carry userinfo. `src/core/logging` offers the functions `redact` and `redactArgv`, not a logger: a 2.0 module that logs must call them itself, and this one does not. | P1.5 | P2.10 (the `Logger` the composition root hands to the core applies `redact` to every message), or P4.4 when the cache gets its first consumer; until then nothing constructs a `TieredCache` |
| N46 | Low | `redact` redacts more than the secret in two cases, by its design ("err on the side of redacting too much"). After a secret `key=value` in a query string, the rest of the text up to the next whitespace is redacted with it, so harmless parameters such as `&take=20` are lost from the log line. A redacted header whose name contains `Api-Key` is written as `X-Api-Key=[REDACTED]` instead of `X-Api-Key: [REDACTED]`. No secret leaks. Evidence: `src/core/logging/redact.test.ts`, tests `redacts secret query-string parameters` and `redacts a header value up to the end of its line and leaves the next line alone`. | P1.5 | accepted; a later item that needs the lost context narrows the free-text pattern and extends the tests |
| N47 | Low | The validators of `src/core/cli/validate.ts` accept a value that starts with `-` for arguments that the builders of `commands.ts` place positionally: a package id (`dotnet package add <id>`), a source name, and a local feed path for a source URL (`dotnet nuget add source <url>`). Arguments are argv entries, so nothing is executed, but the CLI would read such a value as an option. `packageSearchArgs` already rejects a query that starts with `-`. The quarry code has the gap and the item P1.6 does not name it; NuGet ids cannot start with `-`. | P1.6 | P2.6 (source commands): reject a leading `-` in `isValidPackageId`, `isValidSourceName` and the local-path branch of `isValidSourceUrl`, with tests. P1.10, the first caller of `addPackageArgs`, did not take it: its row does not name `src/core/cli/validate.ts`, and the ruling of 2026-10-12 (`src/core/ops/STATUS.md`) keeps validation in that file and leaves it to P2.6; the workflow has no check of its own |
| N48 | Low | The local gates of a session can run in an environment that differs from CI in a way a test reads. The CI runners set `DOTNET_ROOT` (`actions/setup-dotnet`) and `NUIGET_SDK_TESTS=1`; the shell of the P1.6 session had neither. `DefaultDotnetRunner` resolves its executable from `DOTNET_ROOT`, and three quarry tests asserted the text `Could not start "dotnet"` without injecting `resolveExecutable`, so they passed locally and failed on both runners (run 38256767668). Evidence: `src/core/cli/STATUS.md`. | P1.6 | fixed in P1.6 for the three tests; from P1.6 on, an item that touches `src/core/cli` or code that runs `dotnet` also runs its tests with `DOTNET_ROOT=<sdk directory> NUIGET_SDK_TESTS=1` before the push (gotcha row); P7.5 adds it to the ritual |
| N49 | Medium | `classifyAddress` in `src/core/http/ssrf.ts` decides the class of an IPv4 address from its first two octets (`classifyIPv4Octets(a, b)`, quarry code). The documentation ranges are /24 blocks (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, and 192.0.0.0/24), but the function marks all of 192.0.0.0/16, 198.51.0.0/16 and 203.0.0.0/16 as `reserved`. Measured: `192.0.43.8`, `198.51.44.1` and `203.0.178.191` are `reserved`, and `isSafeRedirectTarget('https://192.0.43.8/', …)` is `false`; these are ordinary public addresses. Today the effect is that a redirect to an IP literal in those blocks is refused. Once `Transport` checks the resolved address of a host name with the same function (ADR-005), a feed hosted there cannot be reached after a redirect. The same two-octet rule is right for 10/8, 172.16/12, 192.168/16, 100.64/10, 169.254/16 and 198.18/15. The helper `embeddedV4` (`ssrf.ts:105`) also has a conditional whose two branches are the same expression. Not named by P1.9, file left identical to the quarry. | P1.9 | P4.2, before the resolved-address check uses the function: classify the three /24 blocks by their third octet, with tests for a public neighbour of each; simplify `embeddedV4` |
| N50 | Low | In the quarry's `PackageWorkflows.ts` the `onCommand` hook (the host's transcript logger) was called inside the `try` block of the CLI step, between the return of `runner.run` and the evaluation of its result (`:194-195`, `:221-222` of the quarry file). An exception of the hook, for example a disposed output channel, was therefore caught as a failure of the step: a `dotnet package add` that had already changed the project file was reported as `edit: { ok: false }`, and the restore was skipped. | P1.10 | fixed in P1.10: `forwardCommand` catches the exception and logs a redacted warning; test `a throwing onCommand does not change the outcome` |
| N51 | Low | The workflow feeds the guard of `addPackageArgs` a literal: `PackageWorkflows.ts:223` passes `isCpm: false`, so the builder's refusal of `noRestore` with `isCpm` (`src/core/cli/commands.ts:71-73`) is never reached from this path. That is correct while `admitEdit` refuses every CPM `add` and `update` before an argv is built (test `cpm: never emits --no-restore` over all workflows), and a trap from P6.3 on, when the gate starts to admit CPM adds. The P1.10 ruling asked in prose for "never a literal" and showed the literal in its code; the P1 phase review kept the code and retracted the prose. | P1.10, P1 phase review | P6.3: when the body of `admitEdit` becomes `ProjectMutator.canMutate`, pass the project's real value and run a CPM add with `noRestore: false`; rewrite `cpm: never emits --no-restore` in the same item so that it still asserts that no argv contains `--no-restore` |
| N52 | Low | `rootProject` in the quarry's `src/core/project/xml.ts` returned `undefined` for a project without attributes and children (`<Project></Project>`, `<Project />`): the parser reads such an element as an empty string, and the function accepted objects only. An empty `Directory.Build.props` or `Directory.Packages.props` therefore read as "no project root". Found by the first test written for the module; no caller existed yet. | P2.2 | fixed in P2.2: `rootProject` returns `{}` for the empty string; test `reads an empty project as a project without content` |

## 5. Defects in the paused 2.0 code (execution plan, Appendix B)

The plan summarises these per module group; the work items carry the detail. The ids below number the
headline defects in the order the plan lists them, so that salvage commits can cite them.

| ID | Defect | Items | Status |
|---|---|---|---|
| C-cli-logging-1 | 2 test bugs | P1.5, P1.6 | closed (P1.6) |
| C-cli-logging-2 | Negative-caching of transient probes | P1.5, P1.6 | closed (P1.6) |
| C-cli-logging-3 | CPM `--no-restore` only documented | P1.5, P1.6 | closed (P1.6: `addPackageArgs` throws for `noRestore` with `isCpm`; P1.10: the workflows refuse every CPM `add` and `update` before an argv exists, test `cpm: never emits --no-restore` over all workflows) |
| C-cli-logging-4 | Backslash blacklist | P1.5, P1.6 | closed (P1.6) |
| C-cli-logging-5 | Provenance dropped | P1.5, P1.6 | closed (P1.6; contract side in P1.1b) |
| C-cli-logging-6 | Caller env overrides fixed env | P1.5, P1.6 | closed (P1.6; contract side in P1.1b) |
| C-cli-logging-7 | 5 test files missing | P1.5, P1.6 | closed (P1.5: `redact.test.ts`; P1.6: `commands`, `validate`, `sdk` and `powershell` tests) |
| C-state-core-1 | QueryCoordinator 0 tests | P1.7, P1.8 | closed (P1.8) |
| C-state-core-2 | `carryOver` leak | P1.7, P1.8 | closed (P1.8) |
| C-state-core-3 | Scope table vs ADR | P1.7, P1.8 | closed (P1.7) |
| C-state-core-4 | Verbatim path compare | P1.7, P1.8 | closed (P1.7) |
| C-state-core-5 | Source validation against previous project | P1.7, P1.8 | open; contract side done in P1.7 (`SessionStore.reconcile` JSDoc), closes at P2.10 when the composition root reconciles after a project change |
| C-cache-http-1 | Transport untested + untracked | P1.4, P1.9, P4.2 | open |
| C-cache-http-2 | DNS outside deadline | P1.4, P1.9, P4.2 | open |
| C-cache-http-3 | TieredCache unintegrated | P1.4, P1.9, P4.2 | open |
| C-cache-http-4 | Icon data URIs persisted up to ~128 MB | P1.4, P1.9, P4.2 | open; cache side done in P1.4 (the persistent tier has a budget of 8 MiB), closes at P4.4 when icons go through `TieredCache` |
| C-cache-http-5 | Proxy claim unimplemented | P1.4, P1.9, P4.2 | open; ADR side done in P1.1b (ADR-005 without `undici`), closes at P4.1 |
| C-feeds-1 | 9 of 17 files missing | P4.3 to P4.9 | open |
| C-feeds-2 | Transient outage → 24 h miss | P4.3 to P4.9 | open |
| C-feeds-3 | No OutboundPolicy implementation | P4.3 to P4.9 | open |
| C-feeds-4 | Ctor shapes mismatch composition root | P4.3 to P4.9 | open |
| C-project-catalog-1 | Inspector/evaluator/mutator/references/context missing | P2.2 to P2.8, P6 | open |
| C-project-catalog-2 | Catalog blocks on evaluator | P2.2 to P2.8, P6 | open |
| C-project-catalog-3 | Fabricated context | P2.2 to P2.8, P6 | open |
| C-project-catalog-4 | Conditions dropped | P2.2 to P2.8, P6 | open; central side done in P2.2 (a guarded `PackageVersion` is returned as `conditioned`), references in P2.4 |
| C-project-catalog-5 | Per-project resolved versions | P2.2 to P2.8, P6 | open |
| C-project-catalog-6 | Catalog undocumented | P2.2 to P2.8, P6 | open |
| C-ops-1 | OperationQueue v2 missing | P1.10, P2.1 | closed (P2.1: `DefaultOperationQueue`, 16 tests) |
| C-ops-2 | N1 | P1.10, P2.1 | closed for the workflows (P1.10: `admitEdit` refuses CPM `add`/`update` until P6.3; tests `cpm: refuses add and update until the mutator`, `cpm: never emits --no-restore`) |
| C-ops-3 | Cancel-between-steps | P1.10, P2.1 | closed for the workflows (P1.10: test `cancel between edit and restore yields cancelled`; bulk restores after an abort are marked cancelled) |
| C-ops-4 | Progress payload incomplete | P1.10, P2.1 | closed for the workflows (P1.10: every report carries `kind`, `projectPaths`, `packageIds`); the queue stamps `opId` in P2.1 |
| C-ops-5 | OpId literal | P1.10, P2.1 | closed (P1.1b: `rejected(reason, opId)`; P2.1: the queue passes the ticket's `opId` to the builder for refused, failed and cancelled outcomes, test `admits one running and five waiting workflows and refuses the next with its opId stamped`) |
| C-ops-6 | Unredacted stdout | P1.10, P2.1 | closed for the workflows (P1.10: argv, stdout, stderr and error texts pass `redact` before `onCommand`, an outcome or the log) |
| C-protocol-host-1 | Composition root against imagined APIs | P1.1a, P1.1b, P2.9, P2.10 | open; contract side done in P1.1b (`onProgress`, `ProjectMutator`, `resourceKeys.sources`), closes at P2.10 |
| C-protocol-host-2 | Guards not exhaustive | P1.1a, P1.1b, P2.9, P2.10 | closed (P1.1a) |
| C-protocol-host-3 | `runOperation` hack | P1.1a, P1.1b, P2.9, P2.10 | open |
| C-protocol-host-4 | `forceRestore` bypasses ticket | P1.1a, P1.1b, P2.9, P2.10 | open |
| C-protocol-host-5 | No handler tests | P1.1a, P1.1b, P2.9, P2.10 | open |
| C-protocol-host-6 | CI lacks drift check | P1.1a, P1.1b, P2.9, P2.10 | closed (P1.1a) |
| C-tooling-1 | Sidebar exempt from boundary | P0.7, P0.8, P0.10 | closed (P0.7, P0.8, P0.10) |
| C-tooling-2 | Core may import host | P0.7, P0.8, P0.10 | closed (P0.7, P0.8, P0.10) |
| C-tooling-3 | `.vscodeignore` regression | P0.7, P0.8, P0.10 | closed (P0.7, P0.8, P0.10) |
| C-tooling-4 | Ci.yml untouched | P0.7, P0.8, P0.10 | closed (P0.7, P0.8, P0.10) |
| C-tooling-5 | `check:vsix` incomplete | P0.7, P0.8, P0.10 | closed (P0.7, P0.8, P0.10) |

## 6. Reproducible counts

Counts quoted in findings drift. These commands reproduce the ones that matter; the values are from
2026-10-12 on `labs/2.0`.

| Count | Command | Value |
|---|---|---|
| `as any` in unit tests (T3; the plan counted 955) | `grep -rEo "as any" src --include='*.test.ts' --include='*.test.tsx' \| wc -l` | 959 |
| Unit test files that call `setTimeout(` (T3; a proxy for "files with sleeps", the plan counted 19) | `grep -rlE "setTimeout\(" src --include='*.test.ts' --include='*.test.tsx' \| wc -l` | 22 |
| Fixed `px` font sizes (U5) | `grep -cE "font-size:\s*[0-9.]+px" src/webview/app/App.css src/webview/sidebar/SidebarApp.css` | 125 and 13 |
| Unit tests | `npx vitest run` | 68 files, 2227 tests and 1 skipped; 2228 with `NUIGET_SDK_TESTS=1` |
| End-to-end tests | `npm run test:e2e` | 30 |
| UI tests | `npm run test:ui -- --storage /tmp/nuiget-ui` | 31 |
| Type errors in 1.x tests, benchmarks and helpers (N30) | strict `tsc` over `src` with `types: [node, vitest/globals]`, without `src/test/e2e` and `src/test/ui` | 55 |
| Files in the VSIX | `npx vsce ls \| wc -l` after a production build | 15 |

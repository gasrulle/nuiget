# nUIget 2.0 — item tracker

One row per work item of `2026-10-11-nuiget-2.0-execution-plan.md`, in execution order. `RUN.md` reads this file to pick
the next item and updates the row when the item closes. Status values: `open`, `in-progress`, `done`, `blocked`, `skipped`
(owner decision). The `commit` column holds the SHA on `labs/2.0` that closed the item; findings are tracked in
`findings-ledger.md`.

| ID | Phase | Item | Status | Commit | Date | Notes |
|---|---|---|---|---|---|---|
| P0.0 | P0 | SDK 10 CPM probe (local, 10.0.401) | done | 1d26aeb | 2026-10-12 | SDK 10.0.401: `--no-restore` add is CPM-safe (differs from SDK 8, reproduced as control); D7 unchanged. N1 row updated in plan Appendix A; P0.13 folds it into findings-ledger.md. Candidate finding for P0.13 and the P0.2 gotcha seed: SDK 10 reformats Directory.Packages.props on every `package add --version`. |
| P0.1 | P0 | Branch; this plan at docs/plans/2026-10-11-nuiget-2.0-execution-plan.md; copy ADR-000..008 | done | b8a97a8 | 2026-10-11 | Plan, ADR-000..008, UX model landed on main |
| P0.2 | P0 | Agent resources split | done | 7c16686 | 2026-10-12 | Handoff notes for items without a `src/` directory live in `.github/STATUS.md` (P0.3 and P0.8 reuse it). "Modernization plan in progress" bullet was absent on main; added fresh. |
| P0.3 | P0 | .claude/agents/architecture-advisor.md (frontmatter name, description, tools | done | b377c1e | 2026-10-12 | Agent verified in a fresh session (`claude -p --agent architecture-advisor`); its first answer is in `.github/STATUS.md`. A session that predates this commit cannot call it through the Agent tool and uses the same command instead. |
| P0.4 | P0 | .claude/settings.json allow | done | 5bf061e | 2026-10-12 | Allowlist committed by the owner; the scripts it names arrive in P0.10 and P1.1a |
| P0.9 | P0 | ADR-000 amendments | done | 583ef41 | 2026-10-12 | Node 18 types via the exact-pinned alias `@types-host/node` (`@types/node@18.19.130`) and `typeRoots`; no legacy Node-18 violation found, no `src/` change. D4 added to the ADR-000 amendments on advisor approval (the old Consequences bullet contradicted it). Handoff note in `.github/STATUS.md`. |
| P0.5 | P0 | L2 hooks via the update-config skill | done | 24cf07b | 2026-10-12 | Guard is live and fail-closed (`onFailure: block`). `scripts/hooks/index.js` makes the literal `node --test scripts/hooks` work on Node 22+. Focus/skip rule applies to test sources only. Known holes (shell rewrites of frozen paths) are listed in `.github/STATUS.md`, the note for repo-level items. |
| P0.6 | P0 | Build switch | done | a0282b2 | 2026-10-12 | Ceilings 299921 / 600685 / 304097 bytes (extension / webview / sidebar), enforced by `node esbuild.mjs --production --analyze`. `.vscode/tasks.json` gained the `watch:v2` tasks on advisor approval. `src/extension.next.ts` has no test until its test file is in a vitest project. |
| P0.7 | P0 | ESLint fences per §3 (port quarry rules; protect sidebar-next; add /host/, /extension* to  | done | 9ecac1f | 2026-10-12 | Fences built from one `LAYERS` array; allow-listed files keep their layer's other denials. The webview fence also denies sibling paths (`**/app/**`, `**/sidebar/**`, `../NuGet*`), measured as necessary. `vitest.config.mts` and the `lint` script changed on advisor approval. |
| P0.10 | P0 | Packaging (runs before P0.8) | done | dc6fb8a | 2026-10-12 | VSIX file list 18 → 15: `.nvmrc`, `.vscode-test.mjs`, `tsconfig.test.json` no longer ship. `check:vsix` also requires the two icons that host code loads without a manifest entry. Candidate finding for P0.13: builds do not clean `dist/`, so stale files of the other entry set can be packaged. |
| P0.8 | P0 | CI rewrite (runs after P0.10) | done | 98bcdd1 | 2026-10-12 | Jobs: Lint (+ hook tests), Test on ubuntu and windows, E2E on VS Code 1.85.0 and stable, UI, Build & Package (`check:vsix`, `vsix` artifact), Benchmark (informational). On advisor approval: `package:vsix` uses `npm ci`; the `overrides` entry that forced the test CLI onto Mocha 12 was removed because the e2e runner could not load on VS Code 1.85 (4 development-only audit findings as a result; candidate finding for P0.13). `ci.yml` runs `npm run lint` and `npm run check:vsix`. First run 38227914633 green on all eight jobs. Nit for P7.2: the UI job's `ui-output.txt` lies in the repository root while `package:vsix` runs, so that job's test VSIX contains it (the `vsix` artifact from the build job does not). |
| P0.11 | P0 | Test infrastructure | done | 3a6f919 | 2026-10-12 | `check-types` now runs three programs: main, `tsconfig.test.json` (e2e/UI) and the new `tsconfig.vitest.json` (2.0 tests and shared helpers, 0 errors). Type-checking every test showed 58 errors, 55 of them in 1.x tests; on advisor decision those files are left out of the type-checked set until P5.12/P8.2 instead of being edited. Webview coverage floor: lines 64, statements 62, functions 54, branches 52. `src/extension.next.test.ts` is in the backend include for P2.10. |
| P0.12 | P0 | ARCHITECTURE.md coexistence | done | 7c75217 | 2026-10-12 | 2.0 section with ADR links, module map placeholder, coexistence table and a shared-tooling subsection that is now the truth for CI and packaging; 20 legacy H2s marked (the agent-resources H2 is not 1.x and is unmarked). All eleven ARCHITECTURE.md rows of the audit plan's Appendix A were re-verified against the code and corrected. Not corrected, not this item's file: the watcher timing in `.github/copilot-instructions.md` (1.x gotcha rows say about 5 s; the code uses 2 s and a 1 s re-arm). |
| P0.13 | P0 | Tracker docs/plans/STATUS.md (row per item) and docs/plans/findings-ledger.md (original le | done | 2dcd3c6 | 2026-10-12 | Tracker has all 81 plan items. Ledger: 66 original findings (unchanged), 29 corrections, N1 to N24 from the plan, N25 to N36 found during P0 (the candidate findings that earlier rows mention), and 44 numbered `C-<group>-n` defects. The original findings are not mapped to work items in the plan; an item that closes one records itself in the ledger. CI run 38233521574 failed once in `E2E (1.85.0)` on a VS Code download abort (N37) and passed when the failed job was re-run; the follow-up commit records that. |
| P0.14 | P0 | Optional (owner elects) | skipped |  | 2026-10-12 | Owner decision: skipped. P0.0 shows SDK 10 noun-first add is CPM-safe; the 1.x hazard (N1) affects only SDK 8/9 users (verb-first), both EOL 10 Nov 2026. |
| P1.1a | P1 | Protocol salvage (sentinel required) | done | ac64e72 | 2026-10-12 | Nine files copied from the quarry working tree, byte-identical; the two named edits only (`REQUEST_TYPES`/`EVENT_TYPES` from records checked with `satisfies`, `PromiseLike` in `contracts.ts`). 7 protocol tests; `docs/protocol.md` lists 42 requests and 11 events and regenerates unchanged. The drift check runs in the Lint job of CI. Sentinel approval is in the P0 phase review. Closes C-protocol-host-2 and -6; adds N38 to N42 to the ledger and widens N26. From this item on `npm run check-types` runs wherever the ritual says `npx tsc --noEmit` (N39). `SdkInfo` still has `nounFirstSyntax`: P1.1b removes it. Handoff note: `src/protocol/STATUS.md`. |
| P1.1b | P1 | The contract-change item (sentinel required; advisor checkpoint before starting) | done | dd1ed73 | 2026-10-12 | Checkpoint and diff review are under "Advisor decisions" below. Applied: `onProgress`, `rejected(reason, opId)`, `ProjectMutator` (`canMutate`, `previewCpmImpact`), `resourceKeys.sources(projectDir)`, request `readme/image` (43 requests), `sourcesUnavailable?` on `search/query`, `generation?` on the ok response envelope, the `sourceUrl`/`sourceUrls` naming rule, the new `SdkInfo` with `CapabilityProvenance`, the `env` wording, `sdk-too-old`; ADR-002 to ADR-008 amended inline. `AddPackageOptions.isCpm` is not a contract change: P1.6 does it in `src/core/cli/commands.ts`. 11 protocol tests. Diff review: PASS WITH FIXES, two ADR sentences corrected (D7 scope in ADR-004, SDK floor wording in ADR-003). Left by the review to later items: P6.3 (props file "modified after any add" is stricter than the probe), P6.2 (which run reads the override flag), P7.5 (surface marker in `docs/protocol.md` notes), P4.1 (HTTP/1.1 fallback sentence in ADR-005), P2.9 (confirm the name `HostServices.mutator` cited in `contracts.ts`). Done in one session. |
| P1.2 | P1 | src/core/util/ (events, concurrency, fs, paths, topo); fix concurrency.ts:79; port diamond | done | c485d16 | 2026-10-12 | Ten files copied from the quarry working tree, byte-identical. One fix, the one the item names: `concurrency.ts:79` (`no-useless-assignment`). 49 tests (47 from the quarry, 2 ported: empty and diamond). `src/core/util` at 99.27 % lines; the floor of 85 % lines for `src/core/**` is in `vitest.config.mts` and was shown to fail when it is not met. No `index.ts` and no bench: the item names neither. Handoff note: `src/core/util/STATUS.md`. |
| P1.3 | P1 | src/core/versioning/ + isUpdateCandidate returns false for exact (test exact pin is not an | done | b8bfb9c | 2026-10-12 | Five files copied from the quarry working tree, byte-identical. `isUpdateCandidate` returns false for an exact pin; test `exact pin is not an update candidate` added and one assertion of a quarry test rewritten on advisor ruling (stop-and-ask, answer in `src/core/versioning/STATUS.md`). `floatingDepth` wording aligned in the module only; the gap in the frozen domain comment is N43. 62 tests, 96.15 % lines. Bench `src/test/benchmarks/core-versioning.bench.ts` (13 benchmarks) runs under `npm run bench`; it has no baseline entry, so the informational CI job Benchmark fails on its keys until P2.12 saves the baseline (the run stays green). N6: versioning side done. CI: run 38247897134 red in E2E (1.85.0) on the legacy e2e timing flake N44 (ruling in src/core/versioning/STATUS.md); gh run rerun --failed → green. |
| P1.4 | P1 | src/core/cache/ + deleteByPrefix, clearPackages, invalidationToCacheScopes, 8 MB byte budg | done | 7188bcf | 2026-10-12 | Five files copied from the quarry working tree, byte-identical; one line of its tests changed (`PromiseLike` in the helper, salvage gate 5). New: `TieredCache.deleteByPrefix`, `TieredCache.clearPackages`, `invalidationToCacheScopes` and `packageKeyPrefixes` in `CachePolicy.ts`, and a budget of 8 MiB over the persistent tier, measured on the stored JSON and enforced on write and on load. The quarry had none of them and no call site names them; the choices and their grounds are in `src/core/cache/STATUS.md`. 47 tests (32 + 15), 98.63 % lines. Bench `src/test/benchmarks/core-cache.bench.ts` (8 benchmarks), no baseline entry until P2.12. CI of P1.3 before this item: run 38250297800 for the docs commit `25e9a82` green; Benchmark (informational) failing on the missing baseline entries, as expected. CI: run 38252365465 green; Benchmark (informational) failing on the missing baseline entries. The first `git push` of the commit was rejected by the remote with a bare "(failure)" and no rule named; remote head, ruleset and authentication were unchanged, and the same push succeeded on the second attempt (N41). |
| P1.5 | P1 | src/core/logging/ + redact.test.ts (port NuGetLogger.test.ts:17-83; add token-only userinf | done | effc1e4 | 2026-10-12 | `redact.ts` and `index.ts` copied from the quarry working tree, byte-identical and unchanged by the item. `redact.test.ts` written: 25 tests, 10 ported from `NuGetLogger.test.ts:17-86`, the four the item names (token-only userinfo, `Proxy-Authorization`, `Cookie`, quoted `--password`), the rest of the patterns and `redactArgv`. All four named cases passed against the quarry implementation. 100 % lines. Findings: N45 (the cache logs an unredacted store key; the core has redaction functions, no redacting logger), N46 (two cases of over-redaction, accepted). S5 partly closed. CI: run 38254066961 green; Benchmark (informational) failing on the missing baseline entries. |
| P1.6 | P1 | src/core/cli/ | done | e080e1f | 2026-10-12 | Ten files copied from the quarry working tree; the raw copy was red exactly where the item says (3 type errors on `nounFirstSyntax`, 2 lint errors, 2 failing tests). Done as named: noun-first only, `supported = major >= 10`, CPM capability `verified` only for a major with a probe fixture (SDK 10), probe cache keeps definitive answers only, fixed environment wins, `addPackageArgs` rejects `--no-restore` with `isCpm`, source URL validation accepts Windows and UNC paths and URL punctuation, `PromiseLike`. Four test files written. 138 tests + 1 gated by `NUIGET_SDK_TESTS` (139 with the real SDK), 99.25 % lines for the directory, 98.50 % for `src/core/**`. Beyond the item: a rejected credential no longer appears in the error. Findings: N47 (leading `-` in positional arguments). C-cli-logging-1, -2 and -4 to -7 closed; -3 partly, P1.10 closes it. Quarry note for the directory was stale. Details and every changed quarry test: `src/core/cli/STATUS.md`. CI: run 38256767668 for `e080e1f` red in both Test jobs, the same three runner tests: the runners set `DOTNET_ROOT`, the local shell did not, and the tests asserted the executable name without fixing it (N48). Reproduced locally, fixed forward in the next commit by injecting `resolveExecutable` in those tests (assertions unchanged); first of the two red runs RUN.md §5.3 allows. Fix commit `2f903e7`; CI run 38257338887 green on both Test jobs (the runner tests pass on Windows) and on all other required jobs. |
| P1.7 | P1 | src/core/session/ + src/core/queries/scopes.ts (+tests); matchesProjectPaths normalizes wi | done | 32642aa | 2026-10-12 | Five files copied from the quarry working tree, byte-identical. `scopeMatchesKey` takes an optional `platform` and compares project paths after `normalizeProjectPath`; three new tests, among them the win32 one. One quarry test line fixed for the type checker (`resourceKeys.sources()` without its argument). `src/core/contracts.ts:66-72`: the JSDoc of `SessionStore.reconcile` corrected under the advisor approval of 2026-10-12 ("Advisor decisions" below; sentinel `P1.7`, removed after the one edit); no signature changes. 62 tests, 100 % lines for both directories. C-state-core-3 and -4 closed; -5 contract side done, closes at P2.10. Handoff note: `src/core/session/STATUS.md`. CI: run 38259051082 green on all required jobs. |
| P1.8 | P1 | QueryCoordinator.ts (apply uncommitted refactor; fix carryOver leak); write QueryCoordinat | done | 91d1144 | 2026-10-12 | `QueryCoordinator.ts` and `index.ts` copied from the quarry working tree, byte-identical. Two changes: `invalidate` records the new generation of every key, and the `carryOver` leak is fixed with a `carried` set whose keep-alive ends when a consumer joins the recompute, it settles, the next invalidation or a release. `QueryCoordinator.test.ts` written: 17 tests with the seven named titles, no timers; a negative control against the unfixed quarry file fails the three tests on the changed behaviour. `src/core/contracts.ts:138-145` (`InvalidationEvent`): `keys` is `Array<{ key; generation }>`, under the advisor approval of 2026-10-12 ("Advisor decisions" below; sentinel `P1.8`, removed after the one edit). The protocol event, ADR-002:56 and ADR-008:21 are deferred by that ruling: see the rows of P2.9, P2.10 and P3.3. 49 tests in the directory, 98.33 % lines for the coordinator. C-state-core-1 and -2 closed. Handoff note: `src/core/queries/STATUS.md`. CI: run 38261883144 green on all required jobs. |
| P1.9 | P1 | src/core/http/ssrf.ts + ssrf.test.ts (port Http2Client.test.ts; add mapped-v6, NAT64, 6to4 | done | d3abc12 | 2026-10-12 | `ssrf.ts` copied from the quarry working tree, byte-identical and unchanged by the item. New: `index.ts` (exports ssrf only) and `ssrf.test.ts`, 70 cases: the 1.x redirect cases of `Http2Client.test.ts` ported, and the eight named additions (mapped-v6, NAT64, 6to4, CGNAT, zone id, 303, same-host exemption, 127.0.0.0/8), all passing against the quarry implementation. 95.83 % lines. The quarry's untracked `Transport.ts` was not copied (P4.2). Finding N49 (Medium): the classifier treats three /16 blocks as reserved where only a /24 is; scheduled for P4.2. S4 partly closed. Handoff note: `src/core/http/STATUS.md`. CI: run 38263689535 red in `E2E (stable)` on the legacy e2e timing flake N44 (second sighting, first on the stable entry; the item changes nothing that job builds); `gh run rerun 38263689535 --failed` → green on all required jobs; Benchmark (informational) failing on the missing baseline entries. |
| P1.10 | P1 | src/core/ops/PackageWorkflows.ts (+test) with uncommitted edits | done | 08f94e3 | 2026-10-12 | Two files copied from the quarry working tree, byte-identical; the raw copy had 2 type errors and 13 of 16 tests red, all from the verb-first builders that P1.6 removed. Rewritten along the ⚑ ruling of the `architecture-advisor` (verbatim in `src/core/ops/STATUS.md`; no contract change, no sentinel): one admission gate before any argv (`admitEdit`: SDK detectable, SDK 10 or newer for every edit including `remove`, CPM `add`/`update` refused until P6.3; a failed lookup refuses with its own message), noun-first argv only, CPM `remove` allowed, restores never gated, cancel between edit and restore → `cancelled`, exported `stepStatus`/`outcomeStatus`, progress with `kind`/`projectPaths`/`packageIds` on every report, redaction before `onCommand`, outcomes and the log, `RESTORE_TIMEOUT_MS` from cli (the restore limit drops from the quarry's 180 s to 120 s), exported `EditRequest`. 57 tests: the 16 of the quarry rewritten and listed by title, the three named ones, and the rest of the ruling's list; nine mutations of the file were each caught. 97.74 % lines. Beyond the item: a throwing `onCommand` no longer turns a finished command into a failed step (N50). N47 stays with P2.6 by the ruling. C-cli-logging-3 closed; C-ops-2, -3, -4 and -6 closed for the workflows. N44 widened to both E2E jobs. Open for the phase review: `single()` and the bulk workflows differ when the restore is off and the signal aborts after the edit. Handoff note: `src/core/ops/STATUS.md`. CI: run 38267328292 green on all required jobs, the Windows test job included; Benchmark (informational) failing on the missing baseline entries. |
| P1.fix-1 | P1 | Phase review P1, blocking 1: `single()` reports a cancel after the edit like the bulk workflows when the restore is switched off | done | c25e922 | 2026-10-12 | `src/core/ops/PackageWorkflows.ts`: `restoreStep` decides in one place, the option before the signal, and `single()` no longer checks the signal itself. With the restore switched off and an abort after a finished edit the outcome is `completed` with `restore: { ok: true, skipped: true }`; with a restore wanted it stays `cancelled`. Two tests with the titles the review names; 59 tests in the directory. ARCHITECTURE row for `src/core/ops` amended. From the review's non-blocking list: N51 added (the literal `isCpm: false`, P6.3), N44 rule amended (third sighting on any SHA: warm-up step in the `e2e` job), notes on the rows of P2.9, P6.3 and P7.2. Handoff note: `src/core/ops/STATUS.md`. CI: run 38270450667 green on all required jobs; tag `labs/2.0-P1-done` set on this commit and pushed. |
| P2.1 | P2 | src/core/ops/OperationQueue.ts + index.ts + tests | done | d7a5d8b | 2026-10-12 | Written from ADR-003 and the contract; the quarry has no queue. `DefaultOperationQueue`: one running and five waiting, FIFO, admission decided in `submit`, a ticket whose `completion` resolves exactly once (`rejected` with the ticket's `opId` when full or disposed, `failed` after a throw, `cancelled` when cancelled before the start; the last two derived from the caller's `rejected` outcome), start on a microtask so a listener attached after `submit` sees the first chunk, `onProgress` with `opId`, `onDidChange`, `waitIdle`, `dispose`. The ticket settles and the slot frees in the same turn; the first test run showed `isBusy` still true for whoever awaited the ticket. 16 queue tests (75 in the directory); seven mutations each caught. `index.ts` exports the queue and the workflows. Bench `src/test/benchmarks/core-ops.bench.ts` (3 benchmarks), no baseline entry until P2.12. C-ops-1 and C-ops-5 closed; Y2 core side done, host side P2.9. `PackageWorkflows.ts` untouched. Handoff note: `src/core/ops/STATUS.md`. CI: run 38272679860 green on all required jobs; Benchmark (informational) failing on the missing baseline entries. |
| P2.2 | P2 | src/core/project/{xml,discovery,assets,central}.ts through the gate + tests on fixtures (B | done | 1fa8f6e | 2026-10-12 | Four modules and the fixtures copied from the quarry working tree, byte-identical; the raw copy type-checked and linted clean and had no test. Changes: `central.ts` returns a `Condition`-guarded `PackageVersion` as `conditioned`; `AssetsReader.getResolvedVersionsByFramework` added (from `targets`, runtime-specific targets folded into their framework); `rootProject` accepts an empty `<Project></Project>` (N52, found by the first test). Fixtures as the row orders: `.gitignore` exception for `__fixtures__/**/obj/`, `project.assets.json` moved to `cpm/App/obj/`, `Pinned` `[1.0.0]` in the central props with a reference in `App.csproj`, the `.scratch/probe` project tracked as `multitfm/`. Four test files written, 80 tests, among them the named cases (BOM, malformed XML, version as attribute and as element, `lastPropertyValue`, cyclic roots, lock-file union, `classifyProject` table). No `index.ts` (P2.4). Gotcha row for fixture `obj/` and scratch directories. N19 reader side and C-project-catalog-4 central side done. Handoff note: `src/core/project/STATUS.md`. CI: run 38274861212 red in `E2E (1.85.0)` on N44, its third sighting (both Test jobs green, the Windows one included); `gh run rerun --failed` → green on all required jobs. By the rule of the P1 phase review the `e2e` job then got a `dotnet` warm-up step in a commit of its own, `74178f2` (CI run 38276223197 green; the step took about 3 s). |
| P2.3 | P2 | src/core/project/references.ts (getProjectReferences, getProjectDependencyMap ported from  | done | ef96051 | 2026-10-12 | `references.ts` written from `NuGetProjectService.ts:235-282`: the two functions as free functions, the same signatures and map shape. It reads `ProjectReference` items with `xml.ts` instead of a regular expression (comments, quoting, `;` lists; wildcards and MSBuild expressions skipped) and converts backslash paths before resolving them, which 1.x does not do on macOS and Linux (N53, Medium: multi-project operations are unordered there in 1.x). Keys and values of the map are normalized with `normalizeProjectPath`, as `PackageWorkflows` expects. 9 tests with the three named cases (diamond, cycle, missing file), checked through the sort the workflows use. No `index.ts` (P2.4). Handoff note: `src/core/project/STATUS.md`. CI: run 38277865396 green on all required jobs. |
| P2.4 | P2 | src/core/project/inspector.ts — new StaticProjectInspector({ assets, stopDirs }) implement | done | 7b84421 | 2026-10-12 | Written from the plan row and the ⚑ ruling of the `architecture-advisor` (verbatim in `src/core/project/STATUS.md`; no contract change, no sentinel); the quarry has no inspector. `StaticProjectInspector({ assets, stopDirs })`: references from the nearest `Directory.Build.props` and the project, the decided rules for `Include`, `Update`, `Version`, `VersionOverride`, framework conditions, CPM through the three files, dedupe, `resolvedVersion` per framework, and the four unsupported reasons. Rulings beyond the row: an `unresolved` row always has `version: ''`; `definedIn` is absent for the project file; a guarded `Update` applies, is ignored or makes the row `unresolved` by how it overlaps the row's frameworks; a malformed props file makes the project `parse-failed`, so that a CPM project cannot appear as an ordinary one (D7); `index.ts` uses named exports. 25 tests with the eight titles of the row; nine mutations each caught. No fixture contradicts a rule; two show what a restore would refuse with NU1008 and are reported as written. C-project-catalog-4 closed for tier 1. For the P2 phase review: one reading goes past a line of the ruling and has no test: a `central-override` row whose item is declared in `Directory.Build.props` names that file in `definedIn` (the ruling's DO NOT says no `definedIn` on such rows; its steps 7 and 8 set it for props-declared items of other declarations). Handoff note: `src/core/project/STATUS.md`. CI: run 38281221752 green on all required jobs. |
| P2.5 | P2 | src/core/project/context.ts + revision.ts | done | 28fa9a7 | 2026-10-12 | New, from the contract; the quarry has neither file. `ProjectContextProvider.get` answers `{ context, unsupported? }`: SDK through the runner (below 10 → `unsupported: 'sdk-too-old'` with the complete context; undetected → no `sdk`, not unsupported), `configFiles` from `dotnet nuget config paths` (nearest first; `[]` when the command fails), `sourceUrls` of the enabled sources from the `SourceProvider` interface (a failure rejects: no sources and unknown sources are different facts), `revision` from `revision.ts` (hash over path, mtime and size of the project, the nearest props and targets files, `global.json` and the config files). 13 tests with a fake `dotnet`; `pins SDK 8 through global.json and reports sdk-too-old` uses the fixture `__fixtures__/sdk8/` and the fake; one gated test runs the real SDK and is the tracked evidence for the order of the config chain on SDK 10. Not blocked by P2.6: only the interface of the source provider is used. `index.ts` unchanged. C-project-catalog-3: provider exists, the Catalog uses it in P2.8. Handoff note: `src/core/project/STATUS.md`. CI: run 38282986269 green on all required jobs; the real-SDK test ran on both platforms. |
| P2.6 | P2 | src/core/sources/ minimal | done | 402acbd | 2026-10-12 | Written along the ⚑ ruling of the `architecture-advisor` (verbatim in `src/core/sources/STATUS.md`; no contract change, no sentinel); the quarry has nothing tracked for the directory. Seven modules: a `nuget.config` parser that keeps document order, `NuGetConfigReader` (sources, disabled sources, credentials with `%VAR%` and DPAPI, package source mapping, `<clear />`), `mergeConfigChain` (a nearer entry replaces a farther one whole, never a union), `matchMapping`, `DefaultOutboundPolicy` (enabled sources only; with a mapping only the sources of the winning pattern, and none when those are unavailable), `parseListSourceOutput`, `DotnetSourceProvider` (listing per project directory through the runner, kept until invalidated, a failed listing rejects; add, remove, enable and disable with redacted errors). Evidence for the listing format: the tracked capture `__fixtures__/list-source/10.0.401.txt` and a gated test that runs the same configuration live. 46 tests with every title the ruling names, among them `private-only configuration never yields nuget.org`; seven mutations each caught. N47 done here by the ruling (`src/core/cli/validate.ts`, three tests). N16, N20 and N21 closed for 2.0; N54 added (DPAPI entropy, unverified, P7.3). Two parser defects of the first draft were found by its own tests. Handoff note: `src/core/sources/STATUS.md`. CI: run 38286637876 green on all required jobs; the real-SDK listing test ran on both platforms. |
| P2.7 | P2 | src/core/credentials/ | done |  | 2026-10-12 | Port of 1.x `CredentialService` behind `CredentialProvider`, along a stop-and-ask ruling of the `architecture-advisor` (verbatim in `src/core/credentials/STATUS.md`; no contract change, no sentinel). The stop-and-ask: the row's gate `grep "exec(" src/core` → 0 also matches `RegExp.exec` in 14 places of other items and cannot hold; it is replaced by three greps (N55). `DefaultCredentialProvider`: environment, then `nuget.config`, then the Azure Artifacts Credential Provider; a DPAPI failure falls through instead of sending the encrypted text as 1.x does; the plugin runs as the netcore `.dll` through the dotnet runner with the URL as one argument (closes N15), the `.exe` plugin of 1.x is not used; 30 minutes for a header, 5 for "none", nothing kept for a timeout or a failed start; hosts recognized by host name; the plugin's output is never logged (N56: `redact` does not mask a quoted JSON key). `credentialForUrl` joins a URL to the name-keyed credentials of the merged config chain. 32 tests with every title of the ruling; six mutations each caught. Handoff note: `src/core/credentials/STATUS.md`. |
| P2.8 | P2 | ADR-009 Catalog (use-case layer over QueryCoordinator); fix Catalog.ts | open |  |  |  |
| P2.9 | P2 | src/host/ through the gate | open |  |  | From the P1.8 ruling: `resources/invalidated` must carry the same `keys: Array<{ key; generation }>` shape as `InvalidationEvent` (P1.8 ruling of 2026-10-12) so the host forwards the core event unchanged; this is a `src/protocol/messages.ts` edit with `docs/protocol.md` regeneration and inline amendments of ADR-002:56-59 and ADR-008:20-23 under its own approval and sentinel, before P3.3 starts. From the P1 phase review: the host's `isCpmProject` for `PackageWorkflows` is memoized per project for the duration of one operation (or reuses the inspector result of P2.4); the workflow asks once per request. Its guards for an empty `packages` list keep an empty batch from reaching the workflow. |
| P2.10 | P2 | Replace the P0.6 placeholder src/extension.next.ts with the quarry root fixed against real | open |  |  | From the P1.7 ruling: reconcile with the newly selected project's enabled source URLs immediately after the `selectedProject` intent is applied (C-state-core-5); the intermediate broadcast between `apply` and `reconcile` is acceptable only if the harness scenario in P2.11 shows both surfaces converge. From the P1.8 ruling: `resources/invalidated` must carry the same `keys: Array<{ key; generation }>` shape as `InvalidationEvent` (P1.8 ruling of 2026-10-12) so the host forwards the core event unchanged; this is a `src/protocol/messages.ts` edit with `docs/protocol.md` regeneration and inline amendments of ADR-002:56-59 and ADR-008:20-23 under its own approval and sentinel, before P3.3 starts. |
| P2.11 | P2 | Two-surface harness on the new protocol (src/test/harness/ | open |  |  |  |
| P2.12 | P2 | Benches (queue, scopes) + ARCHITECTURE 2.0 (module map, outcomes, Catalog, context) + CHAN | open |  |  |  |
| P3.1 | P3 | src/webview/shared/tokens.css (spacing, radius, rows, icons, z-index, motion, em typograph | open |  |  |  |
| P3.2 | P3 | Listbox/Row a11y decision (interaction model §5 vs axe nested-interactive) | open |  |  |  |
| P3.3 | P3 | bus/useMessageBus.ts (stale discard by id and generation) + store slices session, projects | open |  |  | From the P1.8 ruling: compare the ok response's `generation` with the generation listed for the same key in the latest `resources/invalidated` event, never with the event's own `generation` (a sequence number); `keys` lists only keys the coordinator has seen. |
| P3.4 | P3 | Sidebar slice | open |  |  |  |
| P3.5 | P3 | e2e src/test/e2e/v2-sidebar.e2e.test.ts (noun-first dotnet package commands only) + ExTest | open |  |  |  |
| P3.6 | P3 | Re-base the estimate; advisor review of the slice; adjust P4/P5 ordering. | open |  |  |  |
| P4.1 | P4 | Proxy/certificate investigation before Transport lands | open |  |  |  |
| P4.2 | P4 | Transport.ts + Transport.test.ts with local http/http2 servers (GET/HEAD/JSON+BOM, 5-redir | open |  |  |  |
| P4.3 | P4 | Feeds A | open |  |  |  |
| P4.4 | P4 | Feeds B | open |  |  |  |
| P4.5 | P4 | nuspec.ts + offline.ts + tests. | open |  |  |  |
| P4.6 | P4 | search.ts (API multi-source, CLI JSON extraction after warn : lines, exact-match grouping, | open |  |  |  |
| P4.7 | P4 | registration.ts (listed-only) + vulnerability.ts + tests. | open |  |  |  |
| P4.8 | P4 | updates.ts (isUpdateCandidate gating; policy racing; empty ≠ unknown; sourcesUnavailable)  | open |  |  |  |
| P4.9 | P4 | Wire feeds into Catalog + extension.next.ts (remove REMOVAL GATE | open |  |  |  |
| P4.10 | P4 | Benches + ARCHITECTURE 2.0 (feeds, transport, policy, caching) + CHANGELOG. | open |  |  |  |
| P5.1 | P5 | Primitives round 2 | open |  |  |  |
| P5.2 | P5 | Store slices updates, search, details, sources, transitive, allProjects. | open |  |  |  |
| P5.3 | P5 | Main shell (header, unified search, tab bar, split layout) < 300 lines. | open |  |  |  |
| P5.4 | P5 | Feature installed (main) incl | open |  |  |  |
| P5.5 | P5 | Feature updates (main + sidebar section) | open |  |  |  |
| P5.6 | P5 | Feature search (main + sidebar browse), quick-search, enrichment chunks, ui/navigateToPack | open |  |  |  |
| P5.7 | P5 | Feature details (tabs, version selector, README via ported markdownSetup with post-sanitiz | open |  |  |  |
| P5.8 | P5 | Feature sources (settings dialog, CRUD, config picker, remove confirm). | open |  |  |  |
| P5.9 | P5 | Feature all-projects (streaming with generations, multi-install picker, per-folder groupin | open |  |  |  |
| P5.10 | P5 | Sidebar parity | open |  |  |  |
| P5.11 | P5 | Theme pass | open |  |  |  |
| P5.12 | P5 | Test rewrite per §8 ids | open |  |  |  |
| P5.13 | P5 | contributes.* table (5 settings, 12 commands, 21 when-clauses, 3 context keys) | open |  |  |  |
| P6.1 | P6 | scripts/probe-sdk.mjs producing tracked JSON for SDK 10 (per-TFM -getItem:PackageReference | open |  |  |  |
| P6.2 | P6 | evaluator.ts (MsBuildProjectEvaluator | open |  |  |  |
| P6.3 | P6 | mutator.ts (canMutate, previewCpmImpact, dirty-file refusal, consumer invalidation/restore | open |  |  | From the P1 phase review (N51): when `admitEdit`'s body becomes `ProjectMutator.canMutate`, the literal `isCpm: false` in `edit()` of `src/core/ops/PackageWorkflows.ts` (`:223` at P1.fix-1; the review cites `:225` of `08f94e3`) must become the project's real value and a CPM add must run with `noRestore: false` (D7, in any phase); the test `cpm: never emits --no-restore` is rewritten in the same item and must still assert that no argv contains `--no-restore`; N51 closes there. |
| P6.4 | P6 | UI | open |  |  |  |
| P6.5 | P6 | NuGetVersion conformance table doc + property tests. | open |  |  |  |
| P7.1 | P7 | Orphan-state sweep (9 legacy nuget.* keys + nuiget.sdkVersionCache) + CHANGELOG Breaking:  | open |  |  |  |
| P7.2 | P7 | Perf | open |  |  | From the P1 phase review: measure whether a cold restore of a multi-TFM project fits the 120 s limit; if not, change `RESTORE_TIMEOUT_MS` in `src/core/cli/DotnetRunner.ts:11`, never a local constant in the workflow. |
| P7.3 | P7 | Windows | open |  |  |  |
| P7.4 | P7 | A11y manual checklist (owner-run | open |  |  |  |
| P7.5 | P7 | Docs | open |  |  |  |
| P7.6 | P7 | Acceptance cut | open |  |  |  |
| P8.1 | P8 | Flip PR (entries only, no renames) | open |  |  |  |
| P8.2 | P8 | Legacy deletion PR per the retirement map (src/services/ except what core re-exports, src/ | open |  |  | Widen the `tsconfig.vitest.json` include to all tests and delete its exclusion comment when the legacy tests go (P0.11). |
| P8.3 | P8 | Release | open |  |  |  |

## Phase gates

One subsection per finished phase (`RUN.md` §6): the gate line of the plan with the results of running it, then
the phase review of the `architecture-advisor` subagent, verbatim.

### P0 — Trunk foundation (2026-10-12)

Gate run on `labs/2.0` @ `3043428` (macOS, Node v24.21.0, npm 11.19.0, .NET SDK 10.0.401). The plan's gate line
says "green on `main`"; decision D4 and `RUN.md` §0 put all work on `labs/2.0`, so the gate ran there.

```text
npm ci                 → exit 0 · added 647 packages, and audited 648 packages · 4 vulnerabilities (2 low,
                         1 moderate, 1 high), development-only (N28)
npm run check-types    → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json)
npm run lint           → exit 0
npm test               → exit 0 · Test Files 44 passed (44) · Tests 1591 passed (1591)
npm run bench          → exit 0 · Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npm run package:vsix   → exit 0 · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 527.93 KB)
                         (15 payload files, extension.vsixmanifest and [Content_Types].xml)
npm run check:vsix     → exit 0 · check:vsix: OK
npx vsce ls            → 15 files; none under src/, .claude/ or docs/
CI green on both OSes  → run 38236993111 for 3043428: success
node esbuild.mjs --v2  → exit 0 · [development] Build complete, three bundles (run after package:vsix;
                         node esbuild.mjs --production afterwards puts the 1.x bundles back in dist/)
node --test scripts/hooks → tests 26 · pass 26 · fail 0
hook live probe        → Edit of docs/adr/README.md without .claude/.contract-change was denied:
                         "nUIget guard: docs/adr/README.md is a frozen contract path (plan D6). …";
                         git status --short stayed empty
advisor answers a brief → the phase review below
vitest backend include → 'src/core/**/*.test.ts', 'src/protocol/**/*.test.ts', 'src/host/**/*.test.ts' are in
                         the backend project of vitest.config.mts; no test file exists under src/core yet
                         (the file listing is P1.2's check)
```

Landed as commit `7d407df`; CI run 38239107642 green on all eight jobs; tag `labs/2.0-P0-done` pushed. Both
pushes printed the "Bypassed rule violations" notice of the repository rulesets (N41).

Phase review (`architecture-advisor`, brief `PHASE REVIEW P0`, 2026-10-12), verbatim:

```text
VERDICT: PASS

BLOCKING: none

Correction to the brief first (agent rule: say when the brief is wrong about the tree). The frozen-path statement "changed only in P0.0 (004-sdk-probes.md), P0.1 and P0.9" is incomplete: commit 1d26aeb (P0.0) also edited `/Users/mattias/github/nuiget/docs/adr/README.md` (lines 19-22, a "Supplements" list linking `004-sdk-probes.md`). The P0.0 plan row (plan line 183) names `docs/adr/004-sdk-probes.md` only. The edit is index-only, changes no decision text, pre-dates the hook (P0.5), and is recorded as a deviation in `/Users/mattias/github/nuiget/src/core/cli/STATUS.md:47`. It is not a defect; it belongs in the record. `git log origin/main..HEAD -- docs/adr src/protocol src/core/contracts.ts` lists exactly 1d26aeb and 583ef41; `src/protocol/**` and `src/core/contracts.ts` do not exist on the branch.

NON-BLOCKING:
1. Local gate for 2.0 items does not type-check their tests. Plan §2.2 step 5 runs `npx tsc --noEmit` (main program, `tsconfig.json`, which excludes `src/**/*.test.ts`); `tsc -p tsconfig.vitest.json` runs only inside `npm run check-types`, which the step list reaches only through `npm run package:vsix` (host/service/esbuild items). CI's Build & Package job runs `npm run check-types` (`.github/workflows/ci.yml`, "Type check" step), so a core item with type errors in its tests is caught only after the push. Practice for P1.1a onward: run `npm run check-types` wherever the ritual says `npx tsc --noEmit`; P7.5 may fold that wording into RUN.md/plan §2.2 (owner's documents, not a phase-review edit).
2. Benchmarks are discovered only under `src/test/benchmarks/`: `vitest.config.mts` `benchmark.include` is `['src/test/benchmarks/**/*.bench.ts', 'src/test/benchmarks/benchmark.test.ts']`, and `src/test/benchmarks/run.mjs` selects the derived `backend (bench)` project. P1.3's gate ("`npm run bench` runs the file" for `core-versioning.bench.ts`) therefore needs the bench at `src/test/benchmarks/core-versioning.bench.ts`; a bench under `src/core/**` is silently not run unless P1.3 names `vitest.config.mts` (a config change outside its row, so a stop-and-ask). D8's move of benches into core and their type-checking belong to P2.12, as `tsconfig.vitest.json` lines 30-33 already say.
3. D6's parenthetical list of contract items (plan line 50: P0.9, P1.1b, P2.8, P4.1, P6.2) is not exhaustive: it omits P0.0 (row names `docs/adr/004-sdk-probes.md`) and P1.1a (row names `src/protocol/**`, `src/core/contracts.ts`, "sentinel required", plan line 207). Plan text drift; the operative clause is "the items that name them". Record as a ledger finding in P1.1a's commit; do not edit the plan in a phase review.
4. Hook tool coverage: `scripts/hooks/guard.mjs:207-212` acts only when `tool_name` is exactly `Edit`, `Write` or `Bash` and returns `undefined` for every other tool. If the implementing session has another file-writing tool (a multi-edit or notebook-edit variant), a frozen-path write through it is not denied. N26 in `docs/plans/findings-ledger.md:128,332` covers shell forms, not this case. P1.1a confirms the session's tool inventory on first sentinel use and widens N26 if another writing tool exists.
5. Known text drift, recorded: the P0 gate (plan line 201) says "green on `main`"; D4 and RUN.md §0 put all work on `labs/2.0`, where the gate was run. No action.
6. `.github/STATUS.md` (handoff note for repo-level items) is headed `commit 7c75217` and its "Exact next step" still says P0.14 owner decides; the owner's 3043428 set P0.14 to `skipped` without rewriting the note. Harmless; the next repo-level item rewrites it. P1.1a's handoff note is `src/protocol/STATUS.md`.

QUESTION 2 (P1.1a sentinel): your reading is right, on two independent grounds, and this review is the recorded advisor approval for the P1.1a sentinel under either reading.
- Ground 1: D6's operative clause is "change only in the items that name them"; the P1.1a row (plan line 207) names `src/protocol/**` and `src/core/contracts.ts`, is titled "Protocol salvage (sentinel required)", and itself specifies two contract edits (`satisfies Record<…, true>` on `REQUEST_TYPES`/`EVENT_TYPES`; `PromiseLike` replaces `Thenable` in `contracts.ts`). P0.8's row defers the `docs:protocol:check` CI step to P1.1a and the P0.4 tracker row expects the `docs:protocol*` scripts from P1.1a, so the plan treats P1.1a as the item that creates the protocol. The parenthetical list in D6 is demonstrably incomplete (non-blocking 3), so its omission of P1.1a carries no weight.
- Ground 2: D6's alternative clause "an advisor-approved contract-change item … creates the sentinel after the advisor's recorded approval" is satisfied once this answer is pasted into `docs/plans/STATUS.md`; copy the two paragraphs above into `src/protocol/STATUS.md` under "Advisor decisions" as well.
Mechanics for P1.1a: set the tracker row `in-progress`; create `.claude/.contract-change` with content exactly `P1.1a` (the hook tests existence only, `guard.mjs:205`); it is gitignored (`.gitignore:55`), so `git status --short` stays clean. Scope is only what the row lists: the copy, the two named contract edits, `scripts/gen-protocol-docs.mjs`, `docs/protocol.md`, the two `package.json` scripts, the `ci.yml` step; "No other contract changes in this item" is literal. If the quarry's `contracts.ts` or `src/protocol/**` imports a core module that a later item creates (P1.2 util, P1.7 session, and so on), the item is blocked, never stubbed and never trimmed; paste the quarry's import lines into the brief if that happens. Delete the sentinel before committing: `guard.mjs:159-165` denies every `git commit` while it exists. Copying from the quarry with Bash `cp` is not intercepted by the guard (N26), so the copy succeeds even without the sentinel; the sentinel is still required by D6 and the commit denial enforces the end state. Expect `npm run lint` to cover the new script (`lint` script lints `scripts/`), `npx vitest run --project backend src/protocol` to pick up `src/protocol/**/*.test.ts` (`vitest.config.mts` backend include), `npm run check-types` to type-check those tests (`tsconfig.vitest.json` include) and the sources against Node 18 (`tsconfig.json` `typeRoots`/`@types-host/node`), and `npm run check:vsix` to pass (`scripts/**` and `docs/**` are in `.vscodeignore`).

CHECKED:
- Commits 1d26aeb, 7c16686, b377c1e, 583ef41, 24cf07b, a0282b2, 9ecac1f, dc6fb8a, 98bcdd1, 3a6f919, 7c75217, 2dcd3c6, 9e2ebbc, 3043428 via `git log --oneline origin/main..HEAD`, `git diff --stat origin/main..HEAD` (52 files, +3774/-368), `git diff origin/main..HEAD` for every file named below, `git show --stat 1d26aeb`, `git show 583ef41:.github/STATUS.md`, `git show 3a6f919:.github/STATUS.md`, `git show 24cf07b:.github/STATUS.md`.
- Tests: `git diff --diff-filter=D` and `--diff-filter=R` on the range → none; grep of the range for added `.only(`/`.skip(`/`.todo(` → none; `src/test/helpers/frontend.tsx` change is type-only. Per-item: P0.0 fixture parsed with node (`sdk`, `probedOn`, `platform`, 10 `commands` each with the five schema keys plus `id`/`continueFrom`, four `verdict` booleans; redaction grep clean); P0.2 `grep -c '^## 1.x gotchas'` = 1, `^## 2.0 gotchas` = 1, `.claude/rules/core-boundaries.md` present; P0.3 `.claude/agents/architecture-advisor.md` frontmatter (`tools: Read, Grep, Glob, Bash`, `model: fable`), CLAUDE.md "2.0 execution protocol"; P0.5 `scripts/hooks/guard.mjs` (frozen paths, sentinel, focus/skip, `--no-verify`, force push, commit-while-sentinel, test rm/mv), `guard.test.mjs` titles incl. "allows the same edits while the sentinel exists" and "denies any commit while the sentinel exists", `.claude/settings.json` hooks (`onFailure: block`), `.gitignore:55`; P0.6 `esbuild.mjs` (`--v2` entries, `node18`/`chrome114`, ceilings 299921/600685/304097, metafiles to `out/esbuild`), three placeholders and their tests, `launch.json` "Run 2.0", `tasks.json` `watch:v2`, `package.json` `watch` explicit list; P0.7 `eslint.config.mjs` `LAYERS` (core denies react/react-dom/vscode values with `allowTypeImports`, `**/host/**`, `**/extension*`, `**/webview/**`, legacy; webview denies `**/core/**`, vscode, legacy + sibling patterns; host denies react, legacy), `LEGACY_IMPORT_ALLOWLIST = []`, `src/test/lint/allowlist.test.ts`, `.github/instructions/core-boundaries.instructions.md` matches the fences; P0.8 `ci.yml` (push on `labs/**`, SHA-pinned actions, `npm ci --no-audit --no-fund`, ubuntu+windows unit matrix, e2e 1.85.0+stable via `VSCODE_TEST_VERSION`, UI job with `--storage /tmp/nuiget-ui`, `check:vsix` step, VSIX/e2e/UI artifacts, bench `continue-on-error` per D8, dotnet 10.0.x only, `NUIGET_SDK_TESTS=1`), `dependabot.yml`, `.vscode-test.mjs` (`--enable-proposed-api` dropped), `overrides` removal recorded in the 1.x gotchas and N28; P0.9 ADR-000 diff (D2, D4, D9, D10, D11, D13, breaking convention), `package.json` `@types-host/node` = `npm:@types/node@18.19.130`, `tsconfig.json` `typeRoots`, ⚑ consultation recorded verbatim; P0.10 `.vscodeignore`, `scripts/check-vsix-contents.mjs` (`ALLOWED_PATTERNS`, manifest-derived `requiredFiles`), `src/test/lint/vsix-contents.test.ts` present; P0.11 `check-types` three programs, `tsconfig.vitest.json` include/exclude, `vitest.config.mts` backend include (`src/core/**`, `src/protocol/**`, `src/host/**`, `src/extension.next.test.ts`, `src/test/lint/**`), coverage excludes (`src/_wip/**`, `__fixtures__`, `src/protocol/**`, `src/core/contracts.ts`), webview ratchet 64/62/54/52 against measured 64.92/62.72/54.88/52.79, `src/_wip` excluded in tsconfig/eslint/vitest/coverage, `benchmarks/README.md` informational, ⚑ consultation (58 errors) recorded verbatim; P0.12 `grep -c '(1.x — removed at P8)' ARCHITECTURE.md` = 20 = legacy H2 count (21 H2s after the 2.0 section minus the unmarked "Repository Assistance Resources"), 2.0 section with ADR table, module map, coexistence table, shared tooling; P0.13 tracker 81 rows = 81 plan `P#.#` ids (script, none missing), ledger N1..N37 and 44 `C-` rows; P0.14 row `skipped` by owner.
- Salvage gate (plan §3): no salvaged directory exists yet; `grep -rn "Thenable\|child_process"` over `src/extension.next.ts`, `src/webview/main`, `src/webview/sidebar-next`, `src/core` → none.
- Not verified by me: gate command outputs, VSIX file list and CI run conclusions (38236993111, 38234744779, 38233521574) are taken from the brief; my shell was limited to inspection commands and I ran no gate, build or `gh` command. The tree was clean at 3043428 (`git status --short` empty).
```

### P1 — Salvage the leaf modules (2026-10-12)

Gate run on `labs/2.0` @ `08f94e3` (macOS, Node v24.21.0, npm 11.19.0, .NET SDK 10.0.401), with `DOTNET_ROOT`
set to the SDK directory and `NUIGET_SDK_TESTS=1` as on the CI runners (N48). The gate line of the plan:
"`npx tsc --noEmit` → 0 with all P1 dirs present, no stubs; `npm test` green and the backend run lists
`src/core/**` files; every P1 dir has a valid `STATUS.md`; `src/core/**` coverage ≥ 85 % lines."

```text
npx tsc --noEmit        → exit 0
npm run check-types     → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; the test programs are
                          what the bare command does not check, N39)
P1 directories present  → src/protocol and src/core/{cache,cli,http,logging,ops,queries,session,util,
                          versioning}, with src/core/contracts.ts; 64 tracked files outside __fixtures__
no stubs                → grep for "not implemented", "TODO: stub" and "throw new Error('stub" in src/core
                          and src/protocol (tests excluded): no match. No module of a later item exists:
                          no src/core/ops/OperationQueue.ts or index.ts (P2.1), no src/core/project,
                          sources, credentials or feeds, no src/core/http/Transport.ts (P4.2), no src/host
npm test                → exit 0 · Test Files 63 passed (63) · Tests 2130 passed (2130)
backend run lists src/core/** → npx vitest run --project backend --reporter=verbose names 19 test files
                          under src/core and src/protocol, the same 19 that git tracks there: cache 1,
                          cli 5, http 1, logging 1, ops 1, queries 2, session 1, util 5, versioning 1,
                          protocol 1
STATUS.md per directory → 10 notes (src/protocol and the nine directories of src/core); each has the
                          seven sections of the plan's §2.5 template
coverage of src/core/** → npx vitest run --coverage exit 0 · 1558 of 1585 lines, 98.30 % (floor 85 %,
                          enforced by vitest.config.mts) · per directory: cache 98.64, cli 99.26,
                          http 95.83, logging 100, ops 97.74, queries 98.72, session 100, util 99.28,
                          versioning 96.15
frozen paths            → changed in P1 by ac64e72 (P1.1a), dd1ed73 (P1.1b), 32642aa (P1.7, one JSDoc)
                          and 91d1144 (P1.8, InvalidationEvent.keys), each under a recorded approval;
                          .claude/.contract-change does not exist
tests removed or skipped → git diff --diff-filter=D labs/2.0-P0-done..HEAD: no file; no added .only(,
                          .skip( or .todo( under src
CI                      → run 38267328292 for 08f94e3: success on all required jobs (Lint, Test on ubuntu
                          and windows, E2E 1.85.0 and stable, UI, Build & Package); Benchmark
                          (informational) failing on the baseline entries that P2.12 saves
```

Red CI runs during the phase, each closed before the next item started: 38247897134 (P1.3, N44, re-run
green), 38256767668 (P1.6, three tests that read `DOTNET_ROOT`, fixed forward in `2f903e7`, N48),
38263689535 (P1.9, N44 on the stable entry, re-run green).

Phase review (`architecture-advisor`, brief `PHASE REVIEW P1`, 2026-10-12), verbatim:

```text
VERDICT: PASS WITH FIXES

The brief is correct about the tree. Every path:line it cites matched what I read: `/Users/mattias/github/nuiget/src/core/ops/PackageWorkflows.ts:66-70` (abort check before `restoreStep` in `single()`), `:222-225` (`isCpm: false` under the comment that `admitEdit` ran first), `:283-292` (`restoreChanged`: `skipRestore` at :285-288, then the abort at :289-292), `:299-306` (`forwardCommand`), `/Users/mattias/github/nuiget/src/core/cli/DotnetRunner.ts:11` (`RESTORE_TIMEOUT_MS = 120_000`); the four frozen-path commits (`git log labs/2.0-P0-done..HEAD -- docs/adr src/protocol src/core/contracts.ts` lists exactly ac64e72, dd1ed73, 32642aa, 91d1144; the P1.7 hunk is comment-only on `SessionStore.reconcile`, the P1.8 hunk is `InvalidationEvent.keys` plus the two JSDoc lines); `.claude/.contract-change` absent; 64 tracked files outside `__fixtures__`; 19 test files under `src/core` and `src/protocol` (cache 1, cli 5, http 1, logging 1, ops 1, queries 2, session 1, util 5, versioning 1, protocol 1); no deleted file in the range and no added `.only(`/`.skip(`/`.todo(` under `src`; `git status --short` shows only ` M docs/plans/STATUS.md`. The claim "no test pins the `single()` side" is right: `skips restore when the toggle is off and marks the step skipped` (test :91) never aborts, and `cancel between edit and restore yields cancelled` (:157) runs with `skipRestore: false`.

BLOCKING:
1. `/Users/mattias/github/nuiget/src/core/ops/PackageWorkflows.ts:66-70` and `:247-253` — `single()` reports `cancelled` with `restore: { ok: false, skipped: true, error: 'cancelled' }` when `options.skipRestore` is true and the signal aborts after a finished edit; the bulk path (`restoreChanged`, :285-292) reports `{ ok: true, skipped: true }` and `completed` in the same situation. The asymmetry is not intended; it is a slip in my P1.10 ruling, whose step-7 code sample was written for the `skipRestore: false` path and did not consider the option. Neither ADR-003:26-27 nor ADR-007:21-22 fixes a precedence between "skipped by option" and "cancelled", so this ruling does: a step the user switched off was never going to run, so a cancel cannot have skipped it, and `{ ok: false, skipped: true, error: 'cancelled' }` for that step tells the UI (and `ops/completed`, `messages.ts:190`) that the cancel prevented work it did not. The bulk order is right and `single()` aligns to it. Item `P1.fix-1`, files: `src/core/ops/PackageWorkflows.ts`, `src/core/ops/PackageWorkflows.test.ts`, `src/core/ops/STATUS.md`, `ARCHITECTURE.md` (2.0 section, ops row at :87), `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`. The exact fix, so that one place decides:
   - `restoreStep` (:247-253): after the `if (options.skipRestore) { return { ok: true, skipped: true }; }` return, insert `if (ctx.signal.aborted) { return { ok: false, skipped: true, error: CANCELLED }; }` before the `restoring` report.
   - `single()` (:66-71): replace the ternary with `if (edit.ok) { restore = await this.restoreStep(ctx, request.projectPath, options, scope); }`. The `ctx.signal.aborted` check then lives only in `restore()`, `editSequence`, `restoreStep` and `restoreChanged`.
   - Tests, two new titles, nothing removed or weakened: `a cancel after the edit with the restore switched off is completed` (single: `makeRunner(() => ({}), { afterRun: () => ctx.controller.abort() })`, `{ skipRestore: true }`; expect `status 'completed'`, `edit { ok: true }`, `restore { ok: true, skipped: true }`, `runner.calls` length 1, reports `['running']`) and `bulk: a cancel after the last edit with the restore switched off is completed` (`bulkUpdate` with two packages, abort in `afterRun` of the second add, `{ skipRestore: true }`; expect both results `completed`, `restores` equal to `[{ projectPath: projectA, ok: true, skipped: true }]`, status `completed`, no restore spawned). `cancel between edit and restore yields cancelled` (`skipRestore: false`) stays as it is and keeps the `cancelled` shape.
   - `ARCHITECTURE.md:87`: the sentence "an abort between the two yields `cancelled` with the edit reported as done and the restore as skipped" gains "when a restore was wanted; with the restore switched off the operation is `completed`, because nothing remained to cancel".
   - `src/core/ops/STATUS.md`: rewrite per §2.5 with the fix commit, drop the asymmetry entry under Deviations, add this answer under Advisor decisions. No CHANGELOG entry (the 2.0 ops line at `CHANGELOG.md:14` stands; nothing user-facing changes before 2.0 ships). No gotcha row.
   - VERIFY: `grep -n "ctx.signal.aborted" src/core/ops/PackageWorkflows.ts` → four hits, none inside `single()`; `npx vitest run --project backend src/core/ops` → 59 passed and the two new titles listed; `npm run check-types` → 0; `npx eslint src` → 0; `npm test`, `npm run bench` green; `npx vitest run --coverage` keeps `src/core/**` ≥ 85 %; CI green on the fix commit; then the P1 gate line is re-run and pasted (RUN.md §6 step 2) before the tag `labs/2.0-P1-done`.

NON-BLOCKING:
1. (question b) `PackageWorkflows.ts:222-225`, the `isCpm: false` literal. My P1.10 ruling contradicted itself: step 3 fixed `admitEdit` to `Promise<StepOutcome | undefined>` (mirroring `MutationDecision`, `contracts.ts:343`), which cannot carry the lookup result, while the step-4 prose and the DO NOT line asked for "never a literal"; the code sample and VERIFY are the operative text, the implementer followed them correctly, and the prose is retracted. The code stays as it is. D7 is live and tested across all eight edit workflows and `restore()` (`cpm: never emits --no-restore`); what is dead in this path is only the builder's defence in depth (`src/core/cli/commands.ts:71-73`), and the hazard date is P6.3, when the gate starts admitting CPM adds. Assigned to P6.3. In `P1.fix-1`'s commit: add a ledger row N51 ("the builder guard of `addPackageArgs` is fed a literal `isCpm: false` by the workflow; correct while `admitEdit` refuses every CPM add/update, a trap from P6.3 on") and a P6.3 tracker note: "when `admitEdit`'s body becomes `ProjectMutator.canMutate`, the literal `isCpm: false` at `PackageWorkflows.ts:225` must become the project's real value and a CPM add must run with `noRestore: false` (D7, in any phase); the test `cpm: never emits --no-restore` is rewritten in the same item and must still assert that no argv contains `--no-restore`; N51 closes there."
2. (question c) `forwardCommand` (`:299-306`) is accepted. The change is inside the item's named source (§2.1), it restores ADR-003's rule that output is logged but never decides success, it is tested (`a throwing onCommand does not change the outcome`) and recorded (N50, closed). No action.
3. N44 (the fixed 10 s sleep in `src/test/e2e/update-flow.e2e.test.ts:45`). The re-run rule stands for P2: two sightings in about a dozen runs, both green on re-run, nothing in the tree builds on the test, and no P2 item names either candidate file. One amendment, because the trigger "a second identical failure on the same SHA" may never fire when re-runs pass: on the third sighting on any SHA, the session adds a warm-up step to the `e2e` job of `.github/workflows/ci.yml` (after `setup-dotnet`, before the tests: `run: dotnet --version && dotnet msbuild -version`, which pays the first-use setup and the MSBuild load the first `dotnet add` otherwise pays inside the 10 s) as its own one-line commit citing N44, updates the N44 ledger row and the "A red CI run is not always a code failure" gotcha row in the same commit, re-runs, and needs no further brief. The polling rewrite of the legacy test stays with P5.12; the owner may elect it earlier (as with P0.14). This is not an `OWNER MUST DECIDE` stop.
4. `isCpmProject` and `runner.sdkVersion` are asked once per request (n times for a bulk of n in one project). The runner caches the SDK per directory (`DotnetRunner.ts:155,307`), so only `isCpmProject` costs; P2.9, which supplies it from the host, memoizes it per project for the duration of one operation (or P2.4's inspector result is reused). No change in `src/core/ops`.
5. The three behaviour changes against the quarry (bulk with a cancellation is `cancelled`, `restore()` reports a cancelled step as `cancelled`, an undetectable SDK refuses) are what the ruling ordered and what ADR-003's outcome set and D13's fail-closed reading require; no action. The restore limit of 120 s is what the row orders ("`RESTORE_TIMEOUT_MS` from cli"); P7.2 measures whether a cold restore of a multi-TFM project fits and, if not, changes `src/core/cli/DotnetRunner.ts:11` (cli's file), never a local constant in the workflow.
6. The opening `running` report of a bulk without `current`/`total`, the explicit `restore()` with `packageIds: []` and no opening report, admission before argument validation, and `bulkStatus` returning `completed` for an empty batch are all acceptable readings of the ruling; P2.9's empty-`packages` guards keep an empty batch from reaching the workflow. No action.
7. The `projectDependencies` fakes keyed by `normalizeProjectPath` are right (the dependency's comment at `PackageWorkflows.ts:27` says "normalized"), and CI on windows-latest confirms it. No action.
8. Handoff notes: all ten have the seven §2.5 sections; eight are headed with the parent commit ("parent of the P1.x commit") and two with their own commit. Consistent enough to read; P7.5 may standardise the header. No action now; `P1.fix-1` rewrites the ops note with its own SHA.

QUESTION (a): not intended. The bulk order is right (option first, then cancel); align `single()` as blocking 1 says. It is a `P1.fix`, not a P2.1 note: P2.1's row names `OperationQueue.ts`, `index.ts` and their tests only, so P2.1 editing `PackageWorkflows.ts` would be a stop-and-ask under §2.1, and P2.11's harness scenarios ("surface disposed with pending ops") would otherwise pin the asymmetric shape.

QUESTION (b): confirmed as coded; the ruling's prose is retracted (non-blocking 1); P6.3 takes the real value with N51 and the tracker note.

QUESTION (c): accepted (non-blocking 2).

CHECKED:
- `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; plan §1-§3 (lines 41-159), P1 rows and gate (203-219), P2 rows (221-238), Appendix B (424-436); `docs/plans/RUN.md` §5-§9; `docs/plans/STATUS.md` whole file (tracker rows P1.1a-P1.10, P1 gate block, the P1.1b checkpoint and diff review, the P1.7 and P1.8 rulings); `docs/plans/findings-ledger.md` N38-N50 (both tables) and every C row; the ten handoff notes' headers and sections; `src/core/ops/STATUS.md` whole file including the P1.10 ruling.
- Commits: `git log --oneline labs/2.0-P0-done..HEAD` (13), `git diff --stat` (86 files, +14056/-158), `git diff --name-only` filtered outside `src/core`, `src/protocol`, `docs/plans` (17 files: `.github/copilot-instructions.md`, `ci.yml`, `ARCHITECTURE.md`, `CHANGELOG.md`, seven ADRs, `docs/protocol.md`, `package.json`, `scripts/gen-protocol-docs.mjs`, two bench files, `vitest.config.mts`; each named by a P1 row or a docs duty), `git show` of 32642aa and 91d1144 on the frozen paths, `--diff-filter=D` (none), grep of the range for `.only(`/`.skip(`/`.todo(` (none).
- Per item: P1.1a `satisfies Record<RequestType, true>` and `Record<EventType, true>` (`guards.ts:33,39`), `docs:protocol`/`docs:protocol:check` scripts (`package.json:305-306`), the CI step (`ci.yml:79`), `PromiseLike` in `contracts.ts:31`; P1.1b both blocking fixes of its diff review present (`docs/adr/004-project-model.md:49-51`, `003:42-47`); P1.2 `concurrency.ts:79` and the empty/diamond topo tests; P1.3 `isUpdateCandidate` `exact` branch and the named test; P1.4 `deleteByPrefix`, `clearPackages`, `invalidationToCacheScopes`, `packageKeyPrefixes`, `DEFAULT_STORE_BYTES = 8 * 1024 * 1024`; P1.5 the four named redact tests; P1.6 `capabilitiesFor` (`supported = major >= 10`, `'verified'` only with a fixture), `{ ...process.env, ...options.env, ...FIXED_ENV }` (`DotnetRunner.ts:188`), transient probes not cached (`:302-317`), `it.skipIf` at `:237` and `:806`, the `no-throw-literal` and `no-control-regex` directives, `never builds the verb-first form`, no `nounFirstSyntax` anywhere in `src/core`, the inverted validator cases (`validate.test.ts:108-121,176`), the named titles `caches a non-zero probe`, `retries after a spawn failure or timeout`, `forces the fixed CLI environment over caller variables`, `cpm: addPackageArgs rejects --no-restore`; P1.7 `scopes.ts` normalizes with `platform` (`:65-74,100`), the win32 test, the `reconcile` JSDoc; P1.8 the seven literal titles plus the two carry-over titles, `keys: Map<ResourceKey, number>` (`QueryCoordinator.ts:99`), the `entry.current !== computation` guard, 13 `carried` hits, `InvalidationEvent` as ruled; P1.9 `http/index.ts` exports ssrf only, the eight named additions by title; P1.10 the whole source and test file, `AddPackageOptions.isCpm?` and the guard (`commands.ts:12-24,68-73`), `OperationStatus`/`StepOutcome`/`OperationOutcome`/`BulkOutcome` (`domain.ts:262-318`), `OperationRunContext`/`ProjectMutator` (`contracts.ts:87-91,343-354`), ADR-003 whole, ADR-007:17-22, `messages.ts:152-160,188-190`.
- Salvage gate (plan §3) over `src/core` and `src/protocol`: `grep -rn Thenable` → none; `vscode` value imports → none; imports from host/services/webview/extension → none; React → none; `grep -rln child_process --include='*.ts'` → `src/core/cli/*` only; stub markers (`not implemented`, `TODO: stub`, `throw new Error('stub`, `TODO`, `FIXME`) → none in sources; a heuristic grep for Node ≥ 20 globals found only the `Transport.fetch` interface method name (`contracts.ts:260`); the authoritative Node-18 check is `npx tsc --noEmit` with `@types-host/node@18` (P0.9), which the brief reports at 0. No module of a later item exists (`ls src/core`: cache, cli, contracts.ts, http, logging, ops, queries, session, util, versioning; no `src/host`).
- `ARCHITECTURE.md` 2.0 module map rows for every P1 directory (`:79-90`); `CHANGELOG.md` `[Unreleased]` entries for every P1 item (`:12-21,40`); `vitest.config.mts` coverage floor for `src/core/**` (`:48-50`); `.github/copilot-instructions.md` 2.0 gotchas (from the system context).
- Taken from the brief, not run by me (inspection only): every gate exit code and count (tsc, check-types, eslint, `npm test` 63/2130, bench 16/101+1, package:vsix, check:vsix, docs:protocol:check), the coverage percentages, the verbose 19-file listing, the CI conclusions (38267328292 and the three red runs with their re-runs), and the quarry excerpts cited in the P1.10 ruling. The gate conditions of the plan line are consistent with the tree I inspected.
```

Blocking 1 is item `P1.fix-1` in the tracker. Gate re-run on the tree of the P1.fix-1 commit (`08f94e3` plus the
fix), same environment:

```text
npx tsc --noEmit        → exit 0
npm run check-types     → exit 0
no stubs, P1 directories → unchanged: the fix touches PackageWorkflows.ts and its test only
npm test                → exit 0 · Test Files 63 passed (63) · Tests 2132 passed (2132)
backend run lists src/core/** → the same 19 test files under src/core and src/protocol
STATUS.md per directory → 10 notes, seven sections each; src/core/ops/STATUS.md rewritten for the fix
coverage of src/core/** → npx vitest run --coverage exit 0 · 1560 of 1587 lines, 98.30 % (floor 85 %) ·
                          ops 97.77, the other directories unchanged
src/core/ops            → npx vitest run --project backend src/core/ops: 59 passed, both new titles listed;
                          grep -n "ctx.signal.aborted" PackageWorkflows.ts: four hits, none in single()
npx eslint src, npm run lint, npm run bench, npm run package:vsix, npm run check:vsix,
npm run docs:protocol:check → all exit 0 (bench 16 files, 101 passed | 1 skipped; VSIX 17 files, 528.84 KB)
frozen paths            → untouched by the fix; .claude/.contract-change does not exist
CI                      → see the tracker row of P1.fix-1; the tag labs/2.0-P1-done is set on that commit
                          once its run is green
```

## Advisor decisions

Answers of the `architecture-advisor` subagent that have to be on record before the sentinel
`.claude/.contract-change` may exist (plan D6), verbatim. The handoff note of the directory repeats them; it lies
in a frozen path and cannot be written before the sentinel exists (N42).

### P1.1b — checkpoint before starting (2026-10-12)

Brief: plan §2.4 form, item P1.1b, on `labs/2.0` @ `ac64e72` with all gates green and no edit made. It listed
the twelve contract changes and seven ADR amendments of the plan row, marked the ones whose shape the row does
not give (3, 4, 5, 7, 8, 11, ADR-005, the form of the amendments), pasted the quarry lines it relied on, and
asked what exactly is to be declared in P1.1b. Answer:

```text
DECISION: Option 1. Every OPEN point is ruled below; nothing in the row is the owner's. Rulings on the open points: 3 = `ProjectMutator` with the two query members P6.3 names (`canMutate`, `previewCpmImpact`) over named request/decision types, no `apply`; 4 = `resourceKeys.sources(projectDir)` with a required argument; 5 = literal request name `'readme/image'` placed in the Package details group, payload `{ url: string; sourceUrl?: string }`, result `{ url: string; dataUri: string | null }`; 7 = `generation?: number` on the ok variant of `ResponseEnvelope` only (not on result types, not on `StreamEnvelope`), with an optional fourth parameter on `makeOk`; 8 = the naming rule is recorded in ADR-007 and its consequences are exactly: the three `source?: string` payload fields → `sourceUrl?`, the two `resourceKeys` parameters → `sourceUrl`, `search/query.sources?: string[]` → `sourceUrls?`; `selectedSource`, `search/autocomplete.sources`, `removedUrl`, `disabledUrl`, `NuGetSource.url`, `FailedSource.url` keep their names; 9 = export the union as `CapabilityProvenance`; 11 = no contract edit in P1.1b, the P1.6 row carries `AddPackageOptions.isCpm`; ADR-005 = strike `undici`, make the proxy sentence equal to the `Transport` comment at `src/core/contracts.ts:238-242`, name `ProjectExecutionContext` as the context contract, leave the configuration matrix and the vendoring decision to P4.1; amendments are written inline in the form ADR-000 used in P0.9, not as appended sections; the N42 order (tracker, sentinel, protocol note) is right.

WHY: I verified every path:line in the brief against `labs/2.0` @ ac64e72 and all hold: `src/core/contracts.ts:98` has `rejected: (reason: string) => T`, `:173-174` says "merged over the sanitized base env", `:185-192` still declares `nounFirstSyntax`, `:307-314` declares `CpmImpactPreview`; `src/protocol/domain.ts:69` lacks `sdk-too-old` and `:225` is `sources: (): ResourceKey => 'sources'`; `src/protocol/messages.ts:131` lacks `sourcesUnavailable` while `:121` and `:127` already carry it as optional; `src/protocol/envelope.ts:48-50` is the two-variant union; ADR-005 says "via `https.Agent`/`undici` proxy agent" and ADR-006 says "`readme/image` lazily". Three facts the brief did not carry decide the open points: (i) ADR-000's amendment of P0.9 (commit 583ef41) is inline, a header line `Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P0.9: …)`, a Context paragraph and rewritten bullets, so appended sections would give the ADR set two forms and force readers to compute the effective decision from two texts; (ii) `tseslint.configs.recommended` is on (`eslint.config.mjs:92`) and includes `no-empty-object-type`, so option (c) for the mutator (an empty interface) is lint-red, and P6.3's row names core/project and host but not `contracts.ts`, so deferring members guarantees an unplanned contract-change item later; (iii) `domain.ts:260` already has `OperationKind = 'install' | 'update' | 'remove' | 'restore'` and the house shape for a failed result is `{ ok: false; error }` (`contracts.ts:257` `SourceMutationResult`, `domain.ts:272` `StepOutcome`, P1.10's refusal `{ ok:false, error:'…' }`), so the mutator reuses both instead of inventing `add` and `reason`. For 4, ADR-005 resolves sources per project directory and `SourceProvider.listSources(projectDir)` (`contracts.ts:264`) is per directory, so a bare `'sources'` key has no meaning and an optional argument would create two keys for one resource. For 5, the name `readme/image` appears in ADR-006 and in three plan rows (P1.1b, P4.4, P5.7) that are executed literally and that P7.5's drift script may grep; results echoing a request field is the house pattern (`package/versions` echoes `packageId`, `updates/get` echoes `projectPath`, `search/query` echoes `query`); `sourceUrl?` lets the host confine credentials to the README's own feed (ADR-006 "same host-side fetch … auth"), and a `null` data URI is ADR-006's "shown as links when the fetch fails". For 7, ADR-002 says "Request ids correlate RPC; generations establish freshness", which is a transport-level property, one declaration on the envelope serves every resource request without enumerating which results are resources, the guard `isResponseEnvelope` needs no change for an optional field, and streams need no generation because ADR-002 invariant 2 terminates a request whose generation is superseded with `StaleQueryError`, so a chunk never outlives its generation and chunks are dropped by request id alone. For 8, ADR-007's Context already names "the same concept had different field names per surface" as the problem it solves, so that is where the rule belongs; `ProjectExecutionContext.sourceUrls` (`contracts.ts:290`) and `BulkPackageRef.sourceUrl` (`messages.ts:42`) are the precedent. For 11, `AddPackageOptions` is an argv-builder option type internal to `src/core/cli`, not a cross-module contract, and moving it would make P1.6's copy of `commands.ts` collide with a declaration in `contracts.ts`, forcing a delete-and-reimport; that loses work if P1.6 is interrupted. For ADR-005, the P4.1 row (plan line 257) owns "supported configuration and matrix; decide on vendoring a proxy agent" and D6 lists P4.1 as the ADR-005 contract item, so P1.1b writes only what is already decided and already stated in `contracts.ts:238-242`.

DO:
1. Paste this answer under a new `## Advisor decisions` section in `docs/plans/STATUS.md` (date 2026-10-12, item P1.1b) and set the P1.1b tracker row to `in-progress`. Then create `.claude/.contract-change` with content exactly `P1.1b`. Then copy this answer verbatim into `src/protocol/STATUS.md` under "Advisor decisions" (N42 order: tracker first, sentinel second, frozen note third).
2. `src/core/contracts.ts`, import block at lines 10-23: add `OperationKind` to the type import from `'../protocol/domain'` (it is not imported today; `check-types` fails without it).
3. `src/core/contracts.ts:86-102`, `OperationQueue`: add after `onDidChange`:

        /** Fires for every `report()` of a running workflow with `opId` stamped; the host forwards it as the `ops/progress` event. */
        readonly onProgress: Event<OperationProgress>;

   and change the third parameter of `submit` to:

        /** Builds the terminal outcome when the queue refuses the work. `opId` is the ticket's id, so a rejected outcome is correlated like any other (C-ops-5). */
        rejected: (reason: string, opId: string) => T,

4. `src/core/contracts.ts:173-174`: replace the `env` comment with:

        /** Extra environment variables, merged under the fixed CLI environment (ADR-003): a caller can add variables but cannot override `DOTNET_CLI_UI_LANGUAGE`, `DOTNET_NOLOGO`, `DOTNET_CLI_TELEMETRY_OPTOUT`, `NO_COLOR` or `TERM`. */

   (plain "under"; the bold in the plan row is emphasis, not text).
5. `src/core/contracts.ts:185-192`: replace `SdkInfo` with:

        /** Where a capability value comes from. `'verified'` is used only when a tracked probe fixture proves it (`src/core/cli/__fixtures__/sdk-probes/`). */
        export type CapabilityProvenance = 'verified' | 'documented' | 'assumed' | 'unverified';

        export interface SdkInfo {
            version: string;
            major: number;
            /** `major >= 10` (D13). A project that resolves an unsupported SDK is `unsupported: 'sdk-too-old'` and read-only. */
            supported: boolean;
            /** `dotnet package add` writes the central version of a Central Package Management project (ADR-004 supplement). */
            cpmAwareAdd: boolean;
            /** P1.6 produces `'verified'` for SDK 10 from the P0.0 fixture and `'unverified'` otherwise; the other two values are reserved by the plan row. */
            cpmAwareAddProvenance: CapabilityProvenance;
        }

6. `src/core/contracts.ts`, after `CpmImpactPreview` (line 314), add:

        /** The three reference edits the mutator decides on; a restore is not a mutation of the project file. */
        export type MutationKind = Exclude<OperationKind, 'restore'>;

        export interface MutationRequest {
            kind: MutationKind;
            packageId: string;
            /** Target version for `install`/`update`; absent for `remove` and for `install` of the latest version. */
            version?: string;
        }

        /** `ok: false` carries the explanation the UI shows (D7 refusal, SDK below 10, dirty props file, unverified CPM capability). */
        export type MutationDecision = { ok: true } | { ok: false; error: string };

        /**
         * ADR-004 tier 3. Decides whether a reference edit may run in `context` and previews its Central Package
         * Management impact. Provenance checks (`cpmAwareAddProvenance === 'verified'`, D7) live here and nowhere else.
         * Implemented in P6.3; `HostServices.mutator` is absent until then (P2.9). Any further member is a contract change of its own.
         */
        export interface ProjectMutator {
            canMutate(context: ProjectExecutionContext, request: MutationRequest): Promise<MutationDecision>;
            /** `undefined` when the project is not CPM or the package has no central entry. */
            previewCpmImpact(context: ProjectExecutionContext, packageId: string, toVersion: string): Promise<CpmImpactPreview | undefined>;
        }

7. `src/protocol/domain.ts:69`: replace with:

        /** `sdk-too-old`: the SDK the project resolves is below 10 (D13); the message is "requires .NET SDK 10 or newer". */
        export type UnsupportedProjectReason = 'packages-config' | 'non-sdk-style' | 'parse-failed' | 'not-found' | 'sdk-too-old';

8. `src/protocol/domain.ts:225`: replace with:

        /** Sources effective for one project directory (ADR-005 resolves sources per `projectDir`; the plan row's `cwd` is that directory). */
        sources: (projectDir: string): ResourceKey => `sources:${projectDir}`,

   and `:232-235`: rename the parameter `source` to `sourceUrl` in both `versions` and `metadata` (the key text `… ?? 'all'` is unchanged):

        versions: (packageId: string, sourceUrl: string | undefined, includePrerelease: boolean): ResourceKey =>
            `versions:${packageId.toLowerCase()}|${sourceUrl ?? 'all'}|${includePrerelease ? 'pre' : 'stable'}`,
        metadata: (packageId: string, version: string, sourceUrl: string | undefined): ResourceKey =>
            `metadata:${packageId.toLowerCase()}@${version.toLowerCase()}|${sourceUrl ?? 'all'}`,

9. `src/protocol/messages.ts:131`: replace with:

        'search/query': { payload: { query: string; sourceUrls?: string[]; includePrerelease: boolean; take?: number; exactMatch?: boolean }; result: { query: string; results: PackageSearchResult[]; sourcesUnavailable?: boolean }; chunk: { kind: 'metadata'; packages: PackageMetadataLite[] } };

   `:135-137`: change `source?: string` to `sourceUrl?: string` in the payloads of `package/versions`, `package/metadata` and `package/readme` (nothing else on those lines changes). Insert between `package/readme` (line 137) and `package/prewarm` (line 138), so it inherits the "Package details" group:

        /** Lazily fetches one README image host-side with the icon fetch's auth, size cap and policy (ADR-006). `dataUri` is `null` when the fetch failed or policy blocked it; the webview then renders a link. */
        'readme/image': { payload: { url: string; sourceUrl?: string }; result: { url: string; dataUri: string | null } }; // main

10. `src/protocol/guards.ts:23`: add `'readme/image': true,` to the line that holds the `package/*` entries. `tsc` enforces the rest.
11. `src/protocol/envelope.ts:48-50`: replace with:

        export type ResponseEnvelope<T extends RequestType = RequestType> =
            | {
                kind: 'response'; id: string; type: T; ok: true; result: RequestResult<T>;
                /** Generation of the `QueryCoordinator` resource the result was computed for (ADR-002); present only when the handler read a resource. A webview discards a result whose generation is below the last `resources/invalidated` generation it saw for that key (ADR-008). */
                generation?: number;
            }
            | { kind: 'response'; id: string; type: T; ok: false; error: ProtocolError };

   and `:84-86`: replace `makeOk` with:

        export function makeOk<T extends RequestType>(id: string, type: T, result: RequestResult<T>, generation?: number): ResponseEnvelope<T> {
            return generation === undefined
                ? { kind: 'response', id, type, ok: true, result }
                : { kind: 'response', id, type, ok: true, result, generation };
        }

   The key is omitted when undefined, so `protocol.test.ts:38` and any future `toStrictEqual` hold. `isResponseEnvelope`, `StreamEnvelope`, `makeStream` and `isStreamEnvelope` are unchanged.
12. `src/protocol/protocol.test.ts`: add cases (a) `REQUEST_TYPES` contains `'readme/image'` and `isRequestEnvelope(makeRequest('readme/image', { url: 'https://example.test/a.png' }))` is true; (b) `resourceKeys.sources('/w/App')` equals `'sources:/w/App'` and `resourceKeys.versions('Pkg', undefined, false)` equals `'versions:pkg|all|stable'`; (c) `makeOk('a', 'installed/get', <InstalledResult>, 3)` has `generation` 3 and passes `isResponseEnvelope`, and `'generation' in makeOk('a', 'projects/list', { projects: [] })` is false. No other test changes; `src/protocol/index.ts` is `export *`, so no barrel edit.
13. ADR amendments, inline in ADR-000's form: change each header to `Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: <topics>)`, add one Context sentence that the amendment records the P1.1b contract changes and plan decisions D7 and D13, and rewrite the affected bullets; git holds the history. Content per ADR:
    - 002: replace the sentence "Scopes merge: `workspace ⊇ project ⊇ package`; a `sources` scope invalidates search/updates/metadata keys." with the scope table and the merge table exactly as in the brief's `scopes.ts:11-17` and `:128-141` excerpts (workspace → every key; project{paths} → `projects`, `allProjects:*`, `installed:<p>`, `updates:<p>|*`, `transitive:<p>`; package{paths, ids} → everything project matches plus `versions:<id>|*`, `metadata:<id>@*`; sources → `sources`, `updates:*`, `allProjects:updates*`, `versions:*`, `metadata:*`; metadata{ids} → `versions:<id>|*`, `metadata:<id>@*`; merge: workspace + any → workspace; project + project → project (paths ∪); project + package → package; package + package → package (paths ∪, ids ∪); metadata + metadata → metadata; metadata + project|package → package; sources + sources → sources; sources + metadata → sources; sources + project|package → workspace). Add: keys are `sources:<projectDir>`; `parseKey` splits at the first `:` so their kind is `sources`; `search/query` is not a cached resource, so the old word "search" named nothing and no row was lost; the generation a webview compares against travels on the ok response envelope (ADR-007/008). State that `src/core/queries/scopes.ts` (P1.7) must equal these tables (C-state-core-3).
    - 003: queue bullet: `submit(label, run, rejected)` where `rejected(reason, opId)` stamps the ticket's `opId` on refused outcomes; `onProgress: Event<OperationProgress>` is forwarded by the host as `ops/progress`. Runner bullet: environment list becomes `DOTNET_CLI_UI_LANGUAGE=en`, `DOTNET_NOLOGO=1`, `DOTNET_CLI_TELEMETRY_OPTOUT=1`, `NO_COLOR=1`, `TERM=dumb` (the P1.6 row asserts `TERM === 'dumb'`), applied last: `{ ...process.env, ...options.env, ...FIXED_ENV }`, so a caller's `env` adds variables and never overrides the fixed ones (C-cli-logging-6). New bullet "SDK floor (D13)": only noun-first `dotnet package add/remove/list --project` is issued; `sdkVersion()` returns `SdkInfo` with `supported = major >= 10` and `undefined` only when `dotnet` is missing or its output unparseable; workflows refuse edits when `!sdk.supported` with "requires .NET SDK 10 or newer". Replace the Consequences line 38 with: "`dotnet package list` is issued only with `--no-restore` (D13 closes M3); without it the command restores implicitly and is never used." Do not describe `package list` as the project-model read path (ADR-004 tiers 1 and 2 are).
    - 004-project-model: tier 1 gains the `props` declaration (`PackageReference` declared in an imported props file such as `Directory.Build.props`) and `InstalledPackage.definedIn` (absolute path of the declaring file when it is not the project); tier 2 becomes a properties run followed by per-target-framework runs that return `PackageReference` and `PackageVersion` items and the override-enabled flag (P6.2); tier 3: "verified per SDK major" becomes "SDK 10 only (D13); `cpmAwareAdd` and `cpmAwareAddProvenance` come from the tracked probe fixture (004-sdk-probes), `'verified'` only from a fixture", the mutator is the `ProjectMutator` interface in `src/core/contracts.ts` (`canMutate`, `previewCpmImpact`), and "until it lands (P6.3) 2.0 refuses `add`/`update` on CPM projects unconditionally and never passes `--no-restore` to `package add` on a CPM project; `remove` stays allowed (D7)". Extend the closing sentence so unsupported formats include "a project whose resolved SDK is below 10 (`sdk-too-old`, read-only, D13)". Reference finding 2 of 004-sdk-probes (props file rewritten by every `add --version`) as an input to the mutator; do not edit 004-sdk-probes.md.
    - 005: replace the `Transport` bullet with the `contracts.ts:238-242` wording: "`Transport` honours VS Code `http.proxy`, `http.proxyStrictSSL`, `http.proxySupport` and `http.systemCertificates` by routing HTTP/1.1 through Node's `https` module (which the extension host patches for proxies); HTTP/2 is used only when no proxy is configured. One redirect/SSRF implementation; same-origin-only auth forwarding; redirect targets are re-validated by resolved address when the hostname is not an IP literal. `undici` is not a dependency. P4.1 records the supported configuration matrix and decides whether a proxy agent is vendored (`docs/adr/005-proxy-matrix.md`)." Add to the first bullet: "The context is `ProjectExecutionContext` in `src/core/contracts.ts` (`projectPath`, `projectDir`, `workspaceFolder`, `sdk`, `configFiles`, `sourceUrls`, `revision`); `sdk.supported === false` marks the project `unsupported: 'sdk-too-old'` and read-only (D13, P2.5); `revision` keys the evaluator cache (ADR-004)."
    - 006: replace "README images are rewritten through the same host-side fetch (`readme/image` lazily) or shown as links when the fetch fails." with "README images are fetched lazily through the `readme/image` request (`{ url, sourceUrl? }` → `{ url, dataUri | null }`) with the same host-side fetch, auth, size cap and policy as icons; `dataUri: null` means the webview renders the image as a link (fetch in P4.4, rewriter in P5.7)."
    - 007: record the 43rd request `readme/image`; `generation?` on the ok response variant (not on streams; streams are dropped by request id); and the naming rule: "A string or string-array field that holds a source URL is `sourceUrl`/`sourceUrls`; a field that holds a source name is `sourceName`; a field holding `NuGetSource` or `{ name; url }` objects is `sources`; `SessionSnapshot.selectedSource` keeps its name because its value is a selection (`'all'` or a URL)." List the renames of step 8 and 9 as its consequences.
    - 008: "stale resources by generation" means `useMessageBus.request` exposes the ok response's `generation` so `useResource` can discard a result older than the last `resources/invalidated` generation for its key; chunks are discarded by id only.
    `docs/adr/README.md` needs no change (it lists titles and statuses, not dates).
14. Run `npm run docs:protocol` after the last `messages.ts` edit; `docs/protocol.md` must say `## Requests (43)`. Update `ARCHITECTURE.md:43` from "42 requests" to "43 requests" and add one sentence in the 2.0 section that an ok response may carry `generation`. CHANGELOG `## [Unreleased]` `### Changed`: one headline-only bullet for the 2.0 contract changes (a `**Breaking:**` entry is not needed; the 2.0 protocol is unreleased). No new gotcha row unless one surfaces.
15. Ledger: do not close any C-id. Add "contract side done in P1.1b" to C-cli-logging-5 and -6 (close at P1.6), C-state-core-3 (ADR side; close at P1.7), C-cache-http-5 (ADR side; close at P4.1), C-ops-5 (close at P2.1), C-protocol-host-1 (close at P2.10). Record under N42 that the order of step 1 was used and P7.5 still decides the fix. Add a tracker note to the P1.8 row: `InvalidationEvent.keys` "carries per-key generations" is a change to `src/core/contracts.ts:128-134`, so P1.8 needs its own sentinel and recorded approval (not P1.1b's to do; the row does not name it).
16. Gates: `npm run check-types`, `npx eslint src`, `npx vitest run --project backend src/protocol`, `npm test`, `npm run bench`, `npm run docs:protocol:check`. Then rewrite `src/protocol/STATUS.md` per plan §2.5 while the sentinel is still present.
17. Second brief, as the row requires ("Advisor reviews the diff before merge"): send `git diff -- src/core/contracts.ts src/protocol docs/adr docs/protocol.md` to the `architecture-advisor`, paste the answer into both STATUS files, act on it. Only then delete `.claude/.contract-change` (`guard.mjs:159-165` denies `git commit` while it exists), commit with the `git-commit` skill citing P1.1b, D7, D13, ADR-002..008, C-ops-5, C-cli-logging-5/-6, C-state-core-3, C-cache-http-5, C-protocol-host-1, N42; push to `labs/2.0`; wait for green CI.
18. Two sessions: the row allows ending a session with the sentinel present and frozen-path edits uncommitted (the row overrides §2.2 step 8 for this item). Record that state in `docs/plans/STATUS.md` (the sentinel is gitignored and invisible to `git status`); on resuming, this answer remains the recorded approval and the sentinel is recreated if missing. Never move modifications of tracked files to `src/_wip/`.

DO NOT:
- Do not add an `apply`/`execute` member to `ProjectMutator`, and do not use `kind: 'add'` or `{ ok: false; reason }`; reuse `OperationKind` and `{ ok; error }`.
- Do not make the `sources()` argument optional or keep a bare `'sources'` key.
- Do not name the request `package/readmeImage`, and do not add a `// README` group comment above it (it would start a new group in `docs/protocol.md`).
- Do not put `generation?` on result types or on `StreamEnvelope`, and do not change `isResponseEnvelope`.
- Do not make `sourcesUnavailable` required; its siblings at `messages.ts:121,127` are optional.
- Do not rename `selectedSource`, `search/autocomplete.sources`, `removedUrl`, `disabledUrl`, `NuGetSource.url` or `FailedSource.url`.
- Do not move `AddPackageOptions` or `RemovePackageOptions` into `contracts.ts`.
- Do not change the four-value `CapabilityProvenance` union; the row fixes it even though P1.6 produces only two values.
- Do not edit the plan: the P2.9 gate reads "≥ 42 request cases", which 43 satisfies.
- Do not append "Amendments" sections to ADRs or leave superseded sentences standing; rewrite inline as ADR-000 did.
- Do not edit `docs/adr/000`, `001`, `004-sdk-probes.md` or `docs/adr/README.md`; do not create ADR-009 (P2.8).
- Do not touch `InvalidationEvent` (`contracts.ts:128-134`); that is P1.8's change under its own approval.
- Do not write `src/protocol/STATUS.md` before the sentinel exists, and do not commit while it exists.
- Do not skip the diff-review brief of step 17.

CONTRACT CHANGE: item P1.1b, sentinel `.claude/.contract-change` with content `P1.1b`. Frozen files: `src/core/contracts.ts`; `src/protocol/domain.ts`, `src/protocol/messages.ts`, `src/protocol/envelope.ts`, `src/protocol/guards.ts`, `src/protocol/protocol.test.ts`, `src/protocol/STATUS.md`; `docs/adr/002-query-coordinator.md`, `003-operation-queue-and-dotnet-runner.md`, `004-project-model.md`, `005-execution-context-and-outbound-policy.md`, `006-icons-and-csp.md`, `007-protocol.md`, `008-webview-architecture.md`. Generated: `docs/protocol.md`. Non-frozen docs duties: `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`. `AddPackageOptions.isCpm` is not a contract change and is executed by P1.6 in `src/core/cli/commands.ts`; the P1.1b note records that the row entry is satisfied there.

VERIFY:
- `npm run check-types` → exit 0; `npx eslint src` → 0 errors, 0 warnings.
- `npx vitest run --project backend src/protocol` → Tests 10 passed (7 existing + 3 new), or more if (a)-(c) are split; `npm test` → all files passed; `npm run bench` → passed.
- `npm run docs:protocol:check` → "docs/protocol.md is up to date", exit 0; `grep -c '## Requests (43)' docs/protocol.md` → 1; `grep -c "readme/image" docs/protocol.md` → ≥ 1.
- `grep -n nounFirstSyntax src/core/contracts.ts` → no match; `grep -n "source?: string" src/protocol/messages.ts` → no match; `grep -n "sourceUrls?: string\[\]" src/protocol/messages.ts` → 1 match; `grep -n "sources: (projectDir: string)" src/protocol/domain.ts` → 1 match; `grep -n "'sdk-too-old'" src/protocol/domain.ts` → 1 match; `grep -n "rejected: (reason: string, opId: string)" src/core/contracts.ts` → 1 match; `grep -n "onProgress: Event<OperationProgress>" src/core/contracts.ts` → 1 match; `grep -n "interface ProjectMutator" src/core/contracts.ts` → 1 match; `grep -n "generation?: number" src/protocol/envelope.ts` → 1 match.
- `grep -n undici docs/adr/005-execution-context-and-outbound-policy.md` → no match; `grep -c "Amended: 2026-10-12 (plan item P1.1b" docs/adr/00{2,3,4-project-model,5,6,7,8}*.md` → 1 per file; `grep -n "43 requests" ARCHITECTURE.md` → 1 match.
- `ls .claude/.contract-change` → "No such file or directory" at commit time; `git status --short` → clean after the commit; the diff-review answer is present in both STATUS files; CI run on `labs/2.0` green.
```

### P1.1b — review of the diff before the commit (2026-10-12)

Brief: the uncommitted diff of the frozen files on top of `ac64e72`, with eight numbered points where the
checkpoint answer had to be interpreted. Both blocking defects were fixed with the given text before the
commit. Answer:

```text
VERDICT: PASS WITH FIXES

BLOCKING:
1. `docs/adr/004-project-model.md:49-51` misstates the scope of plan decision D7. The paragraph "Until the mutator lands (plan item P6.3), 2.0 refuses `add` and `update` on CPM projects unconditionally and never passes `--no-restore` to `package add` on a CPM project; `remove` stays allowed, because it edits only the project's own reference (plan decision D7)." puts both rules under one expiry. D7 (plan line 51) says the `--no-restore` prohibition holds "in any phase"; only the refusal lifts at P6.3. A literal P6.3 implementer reads the current text as permission to pass `--no-restore` once the mutator exists, which is the N1 hazard D7 exists to prevent, and the 2.0 gotcha row ("CPM and `--no-restore`") states the rule without expiry, so the ADR now contradicts both. My checkpoint DO text for 004 bundled the two clauses the same way; the defect is in my wording, not in the session's transcription. Replace lines 49-51 with:

       2.0 never passes `--no-restore` to `package add` on a CPM project, in any phase (plan decision D7).
       Until the mutator lands (plan item P6.3), it also refuses `add` and `update` on CPM projects
       unconditionally; `remove` stays allowed, because it edits only the project's own reference.

2. `docs/adr/003-operation-queue-and-dotnet-runner.md:42-43` is internally inconsistent. "only the noun-first commands `dotnet package add/remove/list --project` are issued" contradicts lines 38-39 of the same ADR (`restore`, `nuget list source`), ADR-004 tier 2 (`dotnet msbuild … -getProperty`), ADR-005 line 17-18 (`dotnet nuget list source`) and the P2.5 row (`dotnet nuget config paths`). P1.6 copies `commands.ts` with those builders and would hit the ADR-mismatch stop-and-ask trigger on its first day; fixing the sentence then needs another sentinel. My checkpoint wording ("only noun-first … is issued") was too broad. Replace the first sentence of the bullet (lines 42-43, up to "are issued.") with:

       - SDK floor (plan decision D13): package references are added, removed and listed only with the
         noun-first commands `dotnet package add/remove/list --project`; the verb-first forms
         `dotnet add/remove/list <proj> package` are never issued.

   The rest of the bullet (`sdkVersion()` … "requires .NET SDK 10 or newer") stays.

After both edits: `npm run check-types`, `npm run lint`, `npm test`, `npm run docs:protocol:check` again (the ADRs are not inputs to any of them, so the results will not change, but the §2.5 note must quote a run made on the final tree); then rewrite `src/protocol/STATUS.md` per §2.5 while the sentinel is still present (N42), listing under "Deviations": 11 tests instead of 10, the superseded `undici` VERIFY line (ruling 1 below), and the two ADR sentences corrected on review; paste this answer into both STATUS files; delete `.claude/.contract-change`; commit; push; wait for CI.

NON-BLOCKING:
1. `docs/adr/004-project-model.md:45-47`: "the mutator treats the file as modified after any add" is stricter than the evidence. `docs/adr/004-sdk-probes.md:109-113` (finding 2) and its row `add-no-version` → "unchanged (not even reformatted)" show that only `add --version` rewrites the props file; the probe's own Consequences (line 125-126) say "after any `add --version`". Stricter is safe, so it stands; P6.3 decides whether to keep the conservative rule or align the sentence with the fixture.
2. `docs/adr/004-project-model.md:24-29` (tier 2): the sentence assigns "whether version overrides are enabled" to the per-target-framework run. That is an MSBuild property (`CentralPackageVersionOverrideEnabled`), so P6.2 may move it to the properties run; the ADR states intent, and P6.2's row ("properties run, per-TFM runs, `PackageVersion` items, override-enabled flag") owns the exact argv. No change now.
3. `docs/protocol.md:36`: the Notes cell of `readme/image` renders the JSDoc text and the trailing `// main` surface marker as one string ("… renders a link. main"). `scripts/gen-protocol-docs.mjs:49-59` joins every comment of a member; the generator is not in P1.1b's files and the output is exactly what the generator produces, so `docs:protocol:check` is right to pass. P7.5 (docs drift script) should give surface markers their own column.
4. `docs/adr/005-execution-context-and-outbound-policy.md:29-35`: aligning the `Transport` sentence to `src/core/contracts.ts:248-251` dropped the previous clause "and falls back to HTTP/1.1". P4.1 owns ADR-005 (plan line 257, D6) and decides whether the fallback is restated in the configuration matrix.
5. `CHANGELOG.md:32`: "Completed the 2.0 protocol and core contracts" overstates; P1.8 (`InvalidationEvent.keys`, tracker note already added) and P2.8 (ADR-009) change the frozen files again. A more exact headline is "**Applied the P1.1b contract changes and amended ADR-002 to ADR-008 to match**". CHANGELOG is P1.1b's file, so this may be done now or left; it is not a defect of the contracts.
6. `src/core/contracts.ts:341` names `HostServices.mutator`, a type that lives in the quarry's `src/host/services.ts` and reaches this tree in P2.9. The forward reference is prose and matches the P2.9 row ("drop `mutator` until P6") and the P6.3 row ("`HostServices.mutator` restored"); P2.9 should confirm the name when `services.ts` lands.

RULINGS:
1. (a): keep both `undici` mentions (header and the sentence "`undici` is not a dependency."). The VERIFY line `grep -n undici … → no match` was written to prove the old phrase "via `https.Agent`/`undici` proxy agent" is gone and is superseded by the DO text; its replacement check is `grep -c undici docs/adr/005-execution-context-and-outbound-policy.md` → 2, both negations. Record it in the §2.5 note as a superseded check, not a deviation.
2. Accepted: 11 tests. The VERIFY text allowed "or more if (a)-(c) are split"; the `generation: 0` case pins the `=== undefined` guard (a falsy check would drop it) and the `toStrictEqual` on the whole envelope proves the key is absent rather than `undefined`; the readme/image ok response through `isResponseEnvelope` costs nothing and covers the guard's `'result' in value` branch for the new type.
3. Accepted: `text` fences inside the list item satisfy the markdown instruction (language identifier present); the one-line merge row "metadata + project | package" is unambiguous; ledger ids belong in commits, the tracker and the ledger, not ADR prose (ADR-000's amendment cites plan items and decisions only), so "`src/core/queries/scopes.ts` (plan item P1.7) implements both tables and must equal them" is the right sentence.
4. Accepted, same reasoning; placing the fixed-environment and SDK-floor text in the "Dotnet runner" list is correct, subject to blocking defect 2.
5. Keep the tier-2 text (the `-getProperty` list was already in the ADR before this item; the per-TFM `-getItem:PackageReference;PackageVersion` is the P6.1 row verbatim); see non-blocking 2 for the override flag. The second tier-3 paragraph is where D7 lives and must be corrected as in blocking defect 1; the props-file sentence stands (non-blocking 1).
6. Accepted: `eslint.config.mjs` has no `max-len` rule, the record line is a data table, and `tsc` enforces exhaustiveness through `satisfies Record<RequestType, true>`; keep `'readme/image': true` between `package/readme` and `package/prewarm` so it stays in the "Package details" group of the generated docs.
7. Accepted: the file header (`src/core/contracts.ts:1-8`) is not named by the row and is consistent with `core-boundaries` (types from `vscode` are allowed, values are not); `InvalidationEvent` (`:132-138`) untouched is correct and the P1.8 tracker row now carries the note; `OperationKind` in the import is required by `MutationKind`.
8. Accepted: `ARCHITECTURE.md` "43 requests" (`:43`), the `generation` sentence (`:49-51`), `ProjectMutator` in the contracts paragraph (`:59-61`) and the module-map rows are correct and stay inside the 2.0 section. CHANGELOG bullet is headline-only under `### Changed` as required; see non-blocking 5 for its wording.

CHECKED:
- `.github/agents/architecture-advisor.agent.md`; plan §1-§3 (lines 30-159) and rows P1.1a, P1.1b, P1.6, P1.7, P1.8, P2.5, P2.9, P4.1, P4.4, P5.7, P6.1, P6.2, P6.3, P7.5; `docs/plans/STATUS.md:158-323` (the checkpoint answer, compared step by step with the diff) and the P1.1b / P1.8 tracker rows.
- `git status --short`; `cat .claude/.contract-change` → `P1.1b`; `git diff --stat` (19 files); `git diff -- src/core/contracts.ts src/protocol/{domain,envelope,guards,messages}.ts src/protocol/protocol.test.ts docs/adr docs/protocol.md ARCHITECTURE.md CHANGELOG.md docs/plans/STATUS.md docs/plans/findings-ledger.md src/protocol/STATUS.md`; `git diff -- docs/adr/README.md docs/adr/000-*.md docs/adr/001-*.md docs/adr/004-sdk-probes.md` → empty.
- Every contract edit against the checkpoint's declarations: `OperationQueue.onProgress`, `rejected(reason, opId)`, `DotnetRunOptions.env` comment, `CapabilityProvenance` + `SdkInfo` (no `nounFirstSyntax`), `MutationKind`/`MutationRequest`/`MutationDecision`/`ProjectMutator` (`canMutate`, `previewCpmImpact`, no `apply`), `UnsupportedProjectReason` with `'sdk-too-old'`, `resourceKeys.sources(projectDir)` required argument, `sourceUrl` parameters, `search/query` `sourceUrls?` and optional `sourcesUnavailable` (siblings at `messages.ts:121,127` optional), three `sourceUrl?` payloads, `readme/image` in the Package details group with `// main`, `generation?` on the ok variant only, `makeOk` fourth parameter omitting the key when `undefined`, `isResponseEnvelope`/`StreamEnvelope`/`makeStream` unchanged (`guards.ts:80-88`), `index.ts` is `export *`.
- `src/protocol/domain.ts:42,56,58` (`'props'` in `VersionDeclaration`, `definedIn?`) and `:298-306` (`OperationProgress.opId`) back the ADR-004 and ADR-003 sentences; `src/core/contracts.ts:248-251` (the `Transport` comment ADR-005 now equals), `:291-302` (`ProjectExecutionContext` fields named in ADR-005), `:132-138` (`InvalidationEvent` unchanged).
- `docs/adr/000-release-and-compatibility-policy.md:1-12` (amendment form matched by all seven headers), `docs/adr/004-sdk-probes.md:57-69,103-126` (finding 2 and the `add-no-version` row), `docs/adr/003:30-51` and `docs/adr/004:36-55` with line numbers for the fixes, `docs/adr/005:14-35`.
- `eslint.config.mjs` and `package.json` (`grep max-len|markdownlint` → none), `.editorconfig` (no line limit), `scripts/gen-protocol-docs.mjs:49-59,151-165` (Notes rendering), `.github/instructions/markdown.instructions.md` (fenced blocks need a language identifier).
- Not run by me: the gates; the brief's results (check-types 0, eslint 0, 11 protocol tests, `## Requests (43)`) are consistent with the diff and I ran only inspection commands.
```

### P1.7 — stop-and-ask: contract note on reconcile (2026-10-12)

Brief: the item asks for a "contract note that the host calls `reconcile` on project change", while the frozen
`src/core/contracts.ts:66` said `reconcile` is "called by the coordinator"; ADR-001, the P2.10 row and both
call sites in the quarry say the host calls it. P1.7 is not marked as a sentinel item. Question: where does the
note go, with the exact text, and how should `scopeMatchesKey` take the platform? Answer:

```text
DECISION: Option 3, narrowed: the JSDoc at `src/core/contracts.ts:66` is replaced under this answer as the recorded advisor approval (sentinel content `P1.7`, no signature change, no other line of the file), and `DefaultSessionStore.reconcile` gets a two-sentence implementation JSDoc that points at the contract instead of repeating the caller rule. ADR-001 is not touched. `scopeMatchesKey(scope, key, platform = process.platform)` is right; thread `platform` into `matchesProjectPaths` and normalize both sides of the comparison only.

WHY: The brief is correct about the tree: `src/core/contracts.ts:66` reads "(called by the coordinator)", `docs/adr/001-session-store.md:35` says `reconcile(projects, sources)` "runs whenever the project or source list changes", the P2.10 row (plan line 234) puts "`session.reconcile` on project change" in the composition root, nothing under `src/` or `docs/` names the coordinator as a caller, and no frozen file has changed since P1.1b (`git log dd1ed73..HEAD -- src/core/contracts.ts src/protocol docs/adr` is empty). The row's words "contract note" name the contract: in this plan "contract" is `src/core/contracts.ts` (D6, plan line 50; RUN.md:75), so P1.7 is an item that names the file under D6's operative clause "change only in the items that name them", and the P0 phase review (docs/plans/STATUS.md:141,146-148) already ruled that D6's parenthetical list is not exhaustive and that an advisor answer pasted into `docs/plans/STATUS.md` is the recorded approval under the alternative clause; the P1.8 tracker row (docs/plans/STATUS.md:33) is the precedent for an item that edits `contracts.ts` under its own approval and sentinel without being listed in D6. Leaving the stale words would cost more than fixing them: P1.8 copies `QueryCoordinator.ts` next and P2.10 wires the root; whichever reads "(called by the coordinator)" hits the ADR-mismatch trigger again and needs another sentinel, which is the P1.1b review's own argument (docs/plans/STATUS.md:341) and the advisor file's tiebreak (least work lost). The note also carries the contract side of C-state-core-5 ("source validation against previous project", findings-ledger.md:383, assigned to P1.7): the quarry's store validates the selected source against the last reconciled list (`SessionStore.ts:52-56,61-63`), and because sources resolve per project directory (ADR-005; `SourceProvider.listSources(projectDir)`, `contracts.ts:272-273`; `resourceKeys.sources(projectDir)`), a change of the selected project is a change of the enabled source list, which is why the host must reconcile on project change; the JSDoc states that reasoning explicitly rather than asserting a selection rule ADR-001 does not literally contain. The optional `platform` parameter follows `src/core/util/paths.ts:13,19,33`, leaves every existing call of `scopeMatchesKey(scope, key)` valid (P1.8's copy of `QueryCoordinator.ts` needs no edit), and does not touch `InvalidationScope` or `ResourceKey` in `src/protocol/domain.ts` or the two tables ADR-002 says `scopes.ts` must equal.

DO:
1. Paste this answer verbatim under `## Advisor decisions` in `docs/plans/STATUS.md` as `### P1.7 — stop-and-ask: contract note on reconcile (2026-10-12)`, set the P1.7 tracker row to `in-progress`, and add this note to the row: "`src/core/contracts.ts:66`: the JSDoc of `SessionStore.reconcile` is corrected under the advisor approval of 2026-10-12 (sentinel `P1.7`); no signature changes." Order per N42 (docs/plans/STATUS.md:160-162): tracker first, sentinel second. `src/core/session/STATUS.md` is not a frozen path, so it may be written at any point; paste this answer there too.
2. Create `.claude/.contract-change` with content exactly `P1.7` (the guard tests existence only, `scripts/hooks/guard.mjs:9,205`; the file is gitignored, `.gitignore:55`).
3. Copy `src/core/session/**` and `src/core/queries/scopes.ts` (+ both test files) from the quarry working tree with `cp`, record `cmp` results in the session `STATUS.md`, and run the baseline gates on the unmodified copy as P1.6 did.
4. In `src/core/contracts.ts`, replace line 66 only. Current text:
       /** Re-validate the snapshot against the current project/source lists (called by the coordinator). */
   Replacement (same four-space indentation; the signature on the next line is unchanged):
       /**
        * Re-validate the snapshot against the current project list and enabled source URLs, with the
        * normalization described on `apply`, and commit the result with origin `'host'` (ADR-001). The host
        * calls it (composition root, plan item P2.10) whenever the project list or the source list changes;
        * because sources resolve per project directory (ADR-005), a change of the selected project is a
        * source-list change too. The `QueryCoordinator` never calls it.
        */
5. In `src/core/session/SessionStore.ts`, above `reconcile(` (quarry line 96), add:
       /**
        * Replace the known project and enabled-source lists, then re-normalize the current snapshot and
        * commit it as a host-originated change. Who calls it, and when, is stated on `SessionStore.reconcile`.
        */
   Leave the class comment (quarry :52-56) and the `knownProjects` comment (:61) as they are.
6. In `src/core/queries/scopes.ts`: `import { normalizeProjectPath, type PlatformId } from '../util/paths';` `matchesProjectPaths(projectPaths, path, platform: PlatformId = process.platform)` compares `normalizeProjectPath(p, platform)` of every entry against `normalizeProjectPath(path, platform)`; `scopeMatchesKey(scope, key, platform: PlatformId = process.platform)` passes `platform` through to every `matchesProjectPaths` call. JSDoc for the new parameter, on `scopeMatchesKey`: `/** `platform` selects the path rules for comparing project paths (default `process.platform`); tests pass it explicitly. */` Do not rewrite `scope.paths` or the key: normalize for the comparison only (`paths.ts:11`: "Use the result as a map key, never for I/O"; the scope travels in `resources/invalidated`).
7. Add to `scopes.test.ts` a test titled `matchesProjectPaths: win32 paths differing in case and separators match` that calls `scopeMatchesKey({ kind: 'project', paths: ['C:\\Src\\App\\App.csproj'] }, resourceKeys.installed('c:/src/app/App.csproj'), 'win32')` → true, the same pair with `'linux'` → false, and the `package` scope through the same path. Keep the quarry's 59 tests; the item gate becomes ≥ 60. Confirm one scopes test asserts every row of both ADR-002 tables (docs/adr/002-query-coordinator.md:22-28,35-45); if a row has no case, add it (that closes C-state-core-3).
8. One check, no widening: if the merge function dedupes `paths` with a raw-string `Set`, record it under "Deviations" as non-blocking (matching normalizes, so duplicates differing only in case or separators are harmless); do not normalize stored paths.
9. Gates: `npm run check-types` → 0; `npx eslint src` → 0; `npx vitest run --project backend src/core/session src/core/queries` → ≥ 60 passed; `npm test`; `npm run bench`; `npm run docs:protocol:check` → 0 with `docs/protocol.md` unchanged (the generator reads only `src/protocol/messages.ts`, `scripts/gen-protocol-docs.mjs:10`); `npx vitest run --coverage` → `src/core/**` ≥ 85 % lines (`contracts.ts` is excluded from coverage, so the comment has no effect).
10. Docs duties: CHANGELOG `[Unreleased]` `### Changed` headline only; ARCHITECTURE.md 2.0 section module-map rows for `core/session` and `core/queries/scopes`; ledger: C-state-core-3 → `closed (P1.7)`, C-state-core-4 → `closed (P1.7)`, C-state-core-5 → `open; contract side done in P1.7 (`SessionStore.reconcile` JSDoc), closes at P2.10 when the composition root reconciles after a project change`; add a P2.10 tracker note: "reconcile with the newly selected project's enabled source URLs immediately after the `selectedProject` intent is applied (C-state-core-5); the intermediate broadcast between `apply` and `reconcile` is acceptable only if the harness scenario in P2.11 shows both surfaces converge".
11. Rewrite `src/core/session/STATUS.md` per plan §2.5 (the queries directory gets its note at P1.8; say so under "Exact next step"). Then `rm .claude/.contract-change` (the guard denies `git commit` while it exists, `guard.mjs:155-165`), commit with the `git-commit` skill citing P1.7, D6, ADR-001, ADR-002, ADR-005, C-state-core-3, C-state-core-4, C-state-core-5, push to `labs/2.0`, wait for green CI.

DO NOT:
- Do not change the signature of `reconcile`, add a member, or touch any other line of `src/core/contracts.ts`; `InvalidationEvent` (`:132-138`) is P1.8's edit under its own approval.
- Do not edit `docs/adr/001-session-store.md` or any `docs/adr/**` file; ADR-001:35 is already consistent with the note.
- Do not change `InvalidationScope`, `ResourceKey` or `resourceKeys` in `src/protocol/domain.ts`.
- Do not create the sentinel before step 1 is done, and do not run `git commit` while it exists.
- Do not put the caller rule only in `SessionStore.ts` and leave the contract saying the coordinator calls it.
- Do not normalize paths stored in a scope or a key, and do not make `matchesProjectPaths` read `process.platform` inside the test; pass `'win32'` explicitly.
- Do not add a `reconcile` call to `QueryCoordinator.ts` in P1.8 to make the old comment true.
- Do not block the item for the owner: nothing in the row is a scope, release or publishing decision.

CONTRACT CHANGE: `src/core/contracts.ts` line 66 (JSDoc of `SessionStore.reconcile`) only, in item P1.7, sentinel `.claude/.contract-change` with content `P1.7`, this answer being the recorded approval once pasted into `docs/plans/STATUS.md`. No change to `src/protocol/**`, `docs/adr/**` or `docs/protocol.md`. Non-frozen files of the item: `src/core/session/**`, `src/core/queries/scopes.ts`, `src/core/queries/scopes.test.ts`, `src/core/session/STATUS.md`, `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`, `CHANGELOG.md`, `ARCHITECTURE.md` (2.0 section).

VERIFY:
- `grep -n "called by the coordinator" src/core/contracts.ts` → no output; `grep -c 'The `QueryCoordinator` never calls it' src/core/contracts.ts` → 1.
- `git diff e080e1f HEAD -- src/core/contracts.ts | grep -E '^[-+]' | grep -vE '^(\+\+\+|---)' | grep -vE '^[-+]\s*(/\*\*|\*|\*/)'` → empty (only comment lines changed); `git diff e080e1f HEAD --stat -- docs/adr src/protocol docs/protocol.md` → empty.
- `ls .claude/.contract-change` → "No such file or directory" at commit time; `git status --short` → clean after the commit.
- `npx vitest run --project backend src/core/session src/core/queries` → ≥ 60 passed, 0 failed, and the run lists `matchesProjectPaths: win32 paths differing in case and separators match`.
- `npm run check-types` → 0; `npx eslint src` → 0; `npm test` green; `npm run bench` green; `npm run docs:protocol:check` → 0.
- `grep -n "C-state-core-[345]" docs/plans/findings-ledger.md` shows the three statuses of step 10; the P1.7 and P2.10 tracker rows carry the notes of steps 1 and 10; CI on `labs/2.0` green.

Files checked: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; `/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` lines 41-159 (D1-D13, §2, §3), 207-219 (P1 rows), 234 (P2.10), 424-436 (Appendix B); `/Users/mattias/github/nuiget/src/core/contracts.ts` (whole file; `:54-68`, `:132-138`, `:272-273`); `/Users/mattias/github/nuiget/docs/adr/001-session-store.md`; `/Users/mattias/github/nuiget/docs/adr/002-query-coordinator.md`; `/Users/mattias/github/nuiget/src/core/util/paths.ts`; `/Users/mattias/github/nuiget/docs/plans/STATUS.md` lines 25-33, 141-162, 325-377; `/Users/mattias/github/nuiget/docs/plans/findings-ledger.md` lines 128, 144, 342, 358, 370-390; `/Users/mattias/github/nuiget/docs/plans/RUN.md` lines 68-82; `/Users/mattias/github/nuiget/scripts/hooks/guard.mjs` lines 9, 30-40, 155-170, 200-215; `/Users/mattias/github/nuiget/scripts/gen-protocol-docs.mjs` lines 2, 10; `/Users/mattias/github/nuiget/src/core/cli/STATUS.md`; `.gitignore:54-55`. Commands: `git status --short` (clean), `git log --oneline -3` (head e080e1f), `git log dd1ed73..HEAD -- src/core/contracts.ts src/protocol docs/adr` (empty), `git worktree list`, grep for `reconcile` across `src`, `docs`, `.github`, `.claude`. Not run: any gate (inspection only). The quarry excerpts were taken from the brief, as the subagent cannot read the quarry worktree.
```

### P1.8 — ⚑ brief: QueryCoordinator, InvalidationEvent.keys, carryOver (2026-10-12)

Brief, before any code: the shape of `InvalidationEvent.keys` with per-key generations (the event's own
`generation` is a count of invalidations, not a resource generation), the fix for the `carryOver` leak in the
quarry's coordinator (code pasted), whether the seven test titles are literal, and whether the quarry's working
tree is the base. The answer contains code fences of its own, so it is kept in a four-backtick fence. Answer:

````text
Correction to the brief first: `InvalidationEvent` is at `src/core/contracts.ts:138-144`, not 135-141 (the P1.1b-era notes that say 128-134 and 132-138 are stale too; the file grew in P1.1b and P1.7). Everything else the brief states about the tree checks out: `generationOf` is "0 when never computed" (`contracts.ts:160-161`), `EventMap['resources/invalidated']` is `{ scope; reason; generation: number }` (`src/protocol/messages.ts:186`, `docs/protocol.md:68`), ADR-002:56-59 and ADR-008:20-23 read as quoted, `src/core/queries/` holds only `scopes.ts` and `scopes.test.ts`, no file under `src/host`, `src/webview/{main,sidebar-next,shared}` mentions `generation`, the tree is clean at 32642aa and no sentinel exists.

DECISION: (1) Option 1a, confined to `src/core/contracts.ts`: `InvalidationEvent.keys` becomes `Array<{ key: ResourceKey; generation: number }>`, the event's `generation` stays and is documented as a per-event sequence number that is not comparable with a key's generation; the per-key value is recorded at bump time (last bump in a coalesced tick wins, which equals the flush-time value). The protocol event `resources/invalidated`, ADR-002 and ADR-008 are not touched in P1.8; the protocol side goes to the item that first emits the event (P2.9/P2.10) under its own approval, with tracker notes written now. (2) A `carried: Set<Subscription>` on `Computation` — 2b's data structure with 2a's lifetime: a stale computation's unreleased `active` handles are moved into `next.carried` as a provisional keep-alive that ends when a consumer joins `next`, when `next` settles, at the next invalidation (carried handles never count for a further carry-over) or on an explicit `release()`, whichever comes first; liveness everywhere is `active.size + carried.size`. No ADR edit is needed for it. (3) The seven titles are literal `it()` titles, exactly as written in the row; extra tests are allowed and two are named below. The quarry working tree (with its uncommitted edits) is the base for the copy; "apply uncommitted refactor" and D3 mean the same thing.

WHY: D6 (plan line 50) and the recorded P1.1b rulings (`docs/plans/STATUS.md:33`, `:293`, `:310`, `:366`; `src/core/session/STATUS.md:136`) approve one thing for P1.8: the `InvalidationEvent` member of `src/core/contracts.ts`. The P1.8 row (plan line 215) names `InvalidationEvent.keys` and no protocol or ADR file, its gate is "tests green; eslint 0; tsc 0" with no `docs:protocol:check`, nothing in the tree consumes the event yet (grep above), and the advisor's own tiebreak is the narrowest contract and the least work lost: the first emitter (P2.9 `WebviewHost`, P2.10 "watcher → `resources/invalidated`", plan lines 233-234) and the first consumer (P3.3, line 246) settle the protocol shape with `docs:protocol:check` as their gate. Neither ADR describes the core member, so the contracts edit creates no ADR mismatch; the existing mismatch (ADR-002:56 broadcasts one global `generation`, ADR-008:21 compares per key) predates P1.8 and travels as tracker notes. 1a keeps `generation` because removing it would also change the protocol event and ADR-002:56; 1c leaves `keys` as it is, which is not what the row says ("`keys` carries"). For (2) the brief's reading of the leak is the right one: a carried subscription is already rejected, is never in `next.attached`, and in the quarry stays in `next.active` until the consumer releases a handle that already failed, so a consumer that re-queries without releasing (a) blocks the abort of `next` when its new handle is released, (b) is carried again on every later invalidation and starts a recompute for nobody, and (c) is held for the entry's lifetime. The carried set bounds that interest to one generation and to the first of four definite events, which keeps ADR-002 invariant 2 literally true ("recomputes if any subscriber remains": the carry test stays `current.active.size > 0`) and invariant 4 intact (joining replaces the provisional keep-alives, so "the last subscriber leaves" means the real ones). 2c would delete behaviour ADR-002 and the class comment describe for no gain in safety.

DO:
1. N42 order. Paste this answer verbatim under `## Advisor decisions` in `docs/plans/STATUS.md` as `### P1.8 — ⚑ brief: QueryCoordinator, InvalidationEvent.keys, carryOver (2026-10-12)`, set the P1.8 tracker row to `in-progress`, and add to it: "`src/core/contracts.ts:138-144` (`InvalidationEvent`) edited under the advisor approval of 2026-10-12 (sentinel `P1.8`); protocol event, ADR-002:56 and ADR-008:21 deferred to P2.9/P2.10 and P3.3 by that ruling." Only then create `.claude/.contract-change` with content exactly `P1.8`.
2. The one contract edit — replace `src/core/contracts.ts:138-144` with exactly:
```ts
export interface InvalidationEvent {
    scope: InvalidationScope;
    reason: InvalidationReason;
    /** Sequence number of this event: the coordinator's count of `invalidate()` calls folded into it. It is not a resource generation and is not comparable with `QueryHandle.generation` or the `generation` of a response envelope. */
    generation: number;
    /** Every key the coordinator has seen that `scope` reached, with its generation after this invalidation (the value a `QueryHandle` and an ok response envelope carry for that key). Keys never queried are absent. */
    keys: Array<{ key: ResourceKey; generation: number }>;
}
```
No other line of `contracts.ts` changes.
3. Copy `src/core/queries/QueryCoordinator.ts` and `src/core/queries/index.ts` from the quarry working tree. Before editing, confirm two facts with `grep -n "private run\|private create\|entry.current" <quarry>/src/core/queries/QueryCoordinator.ts`: `create(entry, key, compute)` sets `entry.current` to the new computation with `generation = entry.generation`, and `run(entry, computation)` either has or lacks a guard for `entry.current !== computation`. If the guard is missing, add it as the first statement of `run`: when `entry.current !== computation`, do not call `compute`; reuse `settle`'s stale branch (reject every `attached` handle with `StaleQueryError(key, computation.generation)`, mark `settled`, cache nothing) and return. This is the item's own file; no approval is needed.
4. Per-key generations in `invalidate()` and `flushInvalidation()`. Change the pending record to
```ts
interface Pending {
    scope: InvalidationScope;
    reason: InvalidationReason;
    /** Keys bumped since the last flush with their generation after the latest bump. */
    keys: Map<ResourceKey, number>;
}
```
In `invalidate()` replace `const affected: ResourceKey[] = []` with `const affected = new Map<ResourceKey, number>();`, replace `affected.push(key)` (immediately after `entry.generation++`) with `affected.set(key, entry.generation);`, and replace the tail with
```ts
if (this.pending) {
    this.pending.scope = mergeScopes(this.pending.scope, scope);
    for (const [key, generation] of affected) {
        this.pending.keys.set(key, generation);
    }
    return;
}
this.pending = { scope, reason, keys: affected };
queueMicrotask(() => this.flushInvalidation());
```
In `flushInvalidation()` replace `keys: [...pending.keys],` with
```ts
keys: [...pending.keys].map(([key, generation]) => ({ key, generation })),
```
Leave `invalidationCount` and the `generation: this.invalidationCount` line as they are; they are the sequence number step 2 documents.
5. The `carryOver` fix. Types:
```ts
interface Subscription {
    released: boolean;
    deferred: Deferred;
    onChunk?: ChunkListener;
    /** Computation this subscription currently keeps alive (re-pointed when carried over). */
    owner: Computation;
}

interface Computation {
    key: ResourceKey;
    generation: number;
    controller: AbortController;
    compute: ComputeFn;
    /** Handles created for this computation; they receive its value and chunks. */
    attached: Set<Subscription>;
    /** Unreleased handles among `attached`. */
    active: Set<Subscription>;
    /**
     * Unreleased handles of the stale predecessor, already rejected with `StaleQueryError`. They keep this
     * recompute alive only until a consumer joins it, it settles or the next invalidation, and are never
     * carried a second time; they do not receive its value.
     */
    carried: Set<Subscription>;
    settled: boolean;
}
```
(keep the quarry's names for `Deferred`, `ChunkListener`, `ComputeFn`). `create()` initialises `carried: new Set()`. Two module-level helpers:
```ts
function isAlive(computation: Computation): boolean {
    return computation.active.size > 0 || computation.carried.size > 0;
}

/** End the provisional keep-alive of carried-over handles; a later `release()` of such a handle is a no-op. */
function dropCarried(computation: Computation): void {
    for (const subscription of computation.carried) {
        subscription.released = true;
    }
    computation.carried.clear();
}
```
`invalidate()`, per matching entry (the carry test stays `current.active.size > 0`; carried handles never count):
```ts
entry.generation++;
affected.set(key, entry.generation);
const current = entry.current;
if (!current) {
    continue;
}
entry.current = undefined;
current.controller.abort();
const stale = new StaleQueryError(key, current.generation);
for (const subscription of current.attached) {
    subscription.deferred.reject(stale);
}
if (!current.settled && current.active.size > 0) {
    this.carryOver(entry, current);
}
dropCarried(current);
```
`carryOver`:
```ts
/**
 * Start the recompute for the new generation right away and let the stale computation's unreleased handles
 * keep it alive provisionally, so a consumer that re-`query()`s on `StaleQueryError` joins work already in
 * flight. Only `active` handles are carried; a recompute kept alive solely by carried handles is not carried
 * again (see `invalidate`). The `compute` call is deferred by one microtask so a synchronous burst of
 * invalidations starts at most one recompute.
 */
private carryOver(entry: Entry, stale: Computation): void {
    const next = this.create(entry, stale.key, stale.compute);
    for (const subscription of stale.active) {
        subscription.owner = next;
        next.carried.add(subscription);
    }
    stale.active.clear();
    queueMicrotask(() => this.run(entry, next));
}
```
`query()`: in the branch that joins `entry.current`, directly after `current.attached.add(subscription); current.active.add(subscription);` add `dropCarried(current);` (a real subscriber replaces the provisional ones). `settle()`: first statement `dropCarried(computation);`, before the `entry.current !== computation` check; the rest of `settle` is unchanged. `release()`:
```ts
private release(entry: Entry, subscription: Subscription): void {
    if (subscription.released) {
        return;
    }
    subscription.released = true;
    const owner = subscription.owner;
    owner.active.delete(subscription);
    owner.carried.delete(subscription);
    if (isAlive(owner)) {
        return;
    }
    queueMicrotask(() => {
        if (isAlive(owner) || this.disposed) {
            return;
        }
        owner.controller.abort();
        if (!owner.settled && entry.current === owner) {
            entry.current = undefined;
        }
    });
}
```
Update the class comment's sentence about carry-over to: "if any of those handles is still subscribed — starts the recompute for the new generation right away, so a consumer that re-`query()`s on `StaleQueryError` joins work already in flight instead of starting over; the old handles keep that recompute alive only until a consumer joins it, it settles or the next invalidation, and are never carried twice."
6. Write `src/core/queries/QueryCoordinator.test.ts` with the seven literal `it()` titles: `one computation per key/generation`, `stale mid-computation is never cached and rejects StaleQueryError`, `old completion cannot repopulate`, `release does not cancel other subscriber`, `subscribers converge`, `invalidate coalesces into one event`, `dispose rejects pending`. Add two for the leak: `carry-over: a joining subscriber replaces the carried keep-alives` (query A; invalidate while A's compute is pending; A's `value` rejects with `StaleQueryError`; A re-queries without releasing the old handle and gets a handle for generation 1; the second `compute` call was made and the new handle joined it, so `compute` was called exactly twice; release the new handle only; after a flush the second call's `ctx.signal.aborted` is `true` — the quarry leaves it `false`) and `carry-over: a recompute kept alive only by carried handles is not carried again` (query A; two synchronous `invalidate` calls while A's compute is pending; after a flush `compute` was called exactly once more at most — exactly once in total with the step-3 guard — and no second call was made for generation 1; then a fresh query computes generation 2 and `generationOf(key)` is 2). `invalidate coalesces into one event` asserts the merged scope, one event, `event.generation === 2`, and `event.keys` equal (as a set) to the bumped keys with their current generations, including a key bumped twice in the same tick reporting its final generation. `dispose rejects pending` pins the error class the quarry's `dispose()` actually uses (read it; do not guess) and asserts no `onDidInvalidate` event fires for an `invalidate` after `dispose`. Use deferred promises and a `flushMicrotasks(rounds = 8)` helper (a loop of `await Promise.resolve()`), never timers. Ordering facts to rely on: a rejected handle's `catch` reaction runs before the carried `run` microtask (the reject is synchronous inside `invalidate`, `queueMicrotask(run)` is enqueued after it), so a re-`query()` inside the handler joins `next` before `compute` runs — that is the test shape for "joins work already in flight"; the abort after a last `release()` lands one microtask after `run`, so when a consumer releases a stale handle without re-querying, assert `signal.aborted` after a flush, not the call count; the event flush and the carried `run` are each one microtask after `invalidate()`.
7. `src/core/queries/index.ts` keeps the quarry's five exports. Gates: `npm run check-types` → 0; `npx eslint src` → 0; `npx vitest run --project backend src/core/queries` green with ≥ 9 coordinator tests; `npm test`; `npm run bench`; `npx vitest run --coverage` green (the `src/core/**` 85 % floor). `grep -rln child_process src/core` must still list only `src/core/cli/*`; `grep -rn Thenable src/core` → only `contracts.ts` (none expected there since P1.1a).
8. Docs duties: CHANGELOG `[Unreleased]` `### Added` `**2.0 query coordinator** — …` in the style of lines 12-18, and one `### Changed` headline `**InvalidationEvent.keys carries per-key generations**`; ARCHITECTURE.md 2.0 section module-map row for `core/queries`; ledger: C-state-core-1 → `closed (P1.8)`, C-state-core-2 → `closed (P1.8)`, N10 → `replacement landed (P1.8); the legacy row is deleted with the legacy code at P8.2`. Tracker notes: P2.9 and P2.10 — "`resources/invalidated` must carry the same `keys: Array<{ key; generation }>` shape as `InvalidationEvent` (P1.8 ruling of 2026-10-12) so the host forwards the core event unchanged; this is a `src/protocol/messages.ts` edit with `docs/protocol.md` regeneration and inline amendments of ADR-002:56-59 and ADR-008:20-23 under its own approval and sentinel, before P3.3 starts"; P3.3 — "compare the ok response's `generation` with the generation listed for the same key in the latest `resources/invalidated` event, never with the event's own `generation` (a sequence number); `keys` lists only keys the coordinator has seen".
9. Write `src/core/queries/STATUS.md` per plan §2.5 (first note for this directory; list under "Deviations" the step-3 guard if added and the two extra test titles). Then `rm .claude/.contract-change`, commit with the `git-commit` skill citing P1.8, D3, D6, ADR-002, C-state-core-1, C-state-core-2, N10, N42; push to `labs/2.0`; wait for green CI (the P1.7 run must be green first).

DO NOT:
- Do not edit `src/protocol/messages.ts`, any `docs/adr/**` file or `docs/protocol.md` in P1.8; the sentinel permits it technically, this ruling does not.
- Do not remove, rename or redefine `InvalidationEvent.generation`, and do not add a `generations` record beside `keys` (option 1c).
- Do not add a named `InvalidatedKey` type to `protocol/domain.ts` or `contracts.ts`; the inline shape is the whole change.
- Do not look up `entry.generation` at flush time from `this.entries`; the `Map` written at bump time is the record.
- Do not count carried handles in `invalidate()`'s carry test or move `stale.carried` into `next` (no chaining).
- Do not delete carry-over (option 2c) or change ADR-002 invariant 2's wording.
- Do not add a `reconcile` call or any `SessionStore` reference to `QueryCoordinator.ts` (P1.7 ruling).
- Do not assert `compute` call counts where the abort lands one microtask after `run`; assert `signal.aborted`.
- Do not use `setTimeout`/`setImmediate`/fake timers in the coordinator tests.
- Do not touch `scopes.ts` or `scopes.test.ts`, and do not widen `QueryHandle`, `QueryContext` or `QueryCoordinator` in `contracts.ts` to make a type error go away.

CONTRACT CHANGE: `src/core/contracts.ts:138-144` (`InvalidationEvent` only, text in step 2), item P1.8, sentinel `.claude/.contract-change` with content `P1.8`, created after step 1 and deleted before the commit. No other frozen path changes in P1.8; `src/protocol/messages.ts`, `docs/protocol.md`, `docs/adr/002-query-coordinator.md:56-59` and `docs/adr/008-webview-architecture.md:20-23` change in the P2.9/P2.10 contract item named in step 8.

VERIFY: `git diff --stat 32642aa -- src/core/contracts.ts src/protocol docs/adr docs/protocol.md` lists only `src/core/contracts.ts` with one hunk; `git diff 32642aa -- src/core/contracts.ts | grep -c '^+.*keys: Array<{ key: ResourceKey; generation: number }>'` → 1; `grep -c "it('one computation per key/generation'\|it('stale mid-computation is never cached and rejects StaleQueryError'\|it('old completion cannot repopulate'\|it('release does not cancel other subscriber'\|it('subscribers converge'\|it('invalidate coalesces into one event'\|it('dispose rejects pending'" src/core/queries/QueryCoordinator.test.ts` → 7; `grep -c "carried" src/core/queries/QueryCoordinator.ts` ≥ 8 and `grep -n "keys: Map<ResourceKey, number>" src/core/queries/QueryCoordinator.ts` → 1 hit; `npm run check-types` → 0; `npx eslint src` → 0; `npx vitest run --project backend src/core/queries` → all passed with ≥ 9 tests in `QueryCoordinator.test.ts`; `npm run docs:protocol:check` → 0 (unchanged, proving the protocol was not touched); `ls .claude/.contract-change` → no such file before `git commit`; CI on `labs/2.0` green.

Files checked: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; `/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` lines 41-159 (D1-D13, §2, §3), 203-219 (P1 rows), 233-234, 246, 395-440 (Appendix B); `/Users/mattias/github/nuiget/src/core/contracts.ts` (whole file; `:116-164`); `/Users/mattias/github/nuiget/docs/adr/002-query-coordinator.md`; `/Users/mattias/github/nuiget/docs/adr/008-webview-architecture.md`; `/Users/mattias/github/nuiget/docs/adr/007-protocol.md:25-35`; `/Users/mattias/github/nuiget/src/protocol/envelope.ts`; `/Users/mattias/github/nuiget/src/protocol/messages.ts:10-30,170-200`; `/Users/mattias/github/nuiget/src/protocol/domain.ts:236-262`; `/Users/mattias/github/nuiget/src/protocol/protocol.test.ts:80-100`; `/Users/mattias/github/nuiget/docs/protocol.md:1-12,24-29,66-74`; `/Users/mattias/github/nuiget/scripts/gen-protocol-docs.mjs:70-120`; `/Users/mattias/github/nuiget/scripts/hooks/guard.mjs:1-40`; `/Users/mattias/github/nuiget/src/core/queries/scopes.ts`; `/Users/mattias/github/nuiget/src/core/util/events.ts`; `/Users/mattias/github/nuiget/docs/plans/STATUS.md` rows 21-50 and lines 148-438 (P1.1b and P1.7 advisor decisions); `/Users/mattias/github/nuiget/docs/plans/findings-ledger.md:112,322,376-386`; `/Users/mattias/github/nuiget/src/core/session/STATUS.md:133-165`; `/Users/mattias/github/nuiget/src/protocol/STATUS.md:322-324`; `/Users/mattias/github/nuiget/vitest.config.mts:29,48-64`; `/Users/mattias/github/nuiget/CHANGELOG.md:8-18`. Commands: `git status --short` (clean), `git log --oneline -3` (head 32642aa), greps for `generation`, `resources/invalidated`, `carryOver`, `Deferred` across `src` and `docs`. Not run: any gate (inspection only). The quarry excerpts were taken from the brief, as the subagent cannot read the quarry worktree; step 3 names the two facts about `create()` and `run()` that the brief did not paste and the grep that produces them.
````

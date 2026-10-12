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
| P1.4 | P1 | src/core/cache/ + deleteByPrefix, clearPackages, invalidationToCacheScopes, 8 MB byte budg | done |  | 2026-10-12 | Five files copied from the quarry working tree, byte-identical; one line of its tests changed (`PromiseLike` in the helper, salvage gate 5). New: `TieredCache.deleteByPrefix`, `TieredCache.clearPackages`, `invalidationToCacheScopes` and `packageKeyPrefixes` in `CachePolicy.ts`, and a budget of 8 MiB over the persistent tier, measured on the stored JSON and enforced on write and on load. The quarry had none of them and no call site names them; the choices and their grounds are in `src/core/cache/STATUS.md`. 47 tests (32 + 15), 98.63 % lines. Bench `src/test/benchmarks/core-cache.bench.ts` (8 benchmarks), no baseline entry until P2.12. CI of P1.3 before this item: run 38250297800 for the docs commit `25e9a82` green; Benchmark (informational) failing on the missing baseline entries, as expected. |
| P1.5 | P1 | src/core/logging/ + redact.test.ts (port NuGetLogger.test.ts:17-83; add token-only userinf | open |  |  |  |
| P1.6 | P1 | src/core/cli/ | open |  |  |  |
| P1.7 | P1 | src/core/session/ + src/core/queries/scopes.ts (+tests); matchesProjectPaths normalizes wi | open |  |  |  |
| P1.8 | P1 | QueryCoordinator.ts (apply uncommitted refactor; fix carryOver leak); write QueryCoordinat | open |  |  | `InvalidationEvent.keys` "carries per-key generations" changes `src/core/contracts.ts` (`InvalidationEvent`), a frozen file: P1.8 needs its own recorded approval and sentinel for that edit (P1.1b checkpoint, step 15). |
| P1.9 | P1 | src/core/http/ssrf.ts + ssrf.test.ts (port Http2Client.test.ts; add mapped-v6, NAT64, 6to4 | open |  |  |  |
| P1.10 | P1 | src/core/ops/PackageWorkflows.ts (+test) with uncommitted edits | open |  |  |  |
| P2.1 | P2 | src/core/ops/OperationQueue.ts + index.ts + tests | open |  |  |  |
| P2.2 | P2 | src/core/project/{xml,discovery,assets,central}.ts through the gate + tests on fixtures (B | open |  |  |  |
| P2.3 | P2 | src/core/project/references.ts (getProjectReferences, getProjectDependencyMap ported from  | open |  |  |  |
| P2.4 | P2 | src/core/project/inspector.ts — new StaticProjectInspector({ assets, stopDirs }) implement | open |  |  |  |
| P2.5 | P2 | src/core/project/context.ts + revision.ts | open |  |  |  |
| P2.6 | P2 | src/core/sources/ minimal | open |  |  |  |
| P2.7 | P2 | src/core/credentials/ | open |  |  |  |
| P2.8 | P2 | ADR-009 Catalog (use-case layer over QueryCoordinator); fix Catalog.ts | open |  |  |  |
| P2.9 | P2 | src/host/ through the gate | open |  |  |  |
| P2.10 | P2 | Replace the P0.6 placeholder src/extension.next.ts with the quarry root fixed against real | open |  |  |  |
| P2.11 | P2 | Two-surface harness on the new protocol (src/test/harness/ | open |  |  |  |
| P2.12 | P2 | Benches (queue, scopes) + ARCHITECTURE 2.0 (module map, outcomes, Catalog, context) + CHAN | open |  |  |  |
| P3.1 | P3 | src/webview/shared/tokens.css (spacing, radius, rows, icons, z-index, motion, em typograph | open |  |  |  |
| P3.2 | P3 | Listbox/Row a11y decision (interaction model §5 vs axe nested-interactive) | open |  |  |  |
| P3.3 | P3 | bus/useMessageBus.ts (stale discard by id and generation) + store slices session, projects | open |  |  |  |
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
| P6.3 | P6 | mutator.ts (canMutate, previewCpmImpact, dirty-file refusal, consumer invalidation/restore | open |  |  |  |
| P6.4 | P6 | UI | open |  |  |  |
| P6.5 | P6 | NuGetVersion conformance table doc + property tests. | open |  |  |  |
| P7.1 | P7 | Orphan-state sweep (9 legacy nuget.* keys + nuiget.sdkVersionCache) + CHANGELOG Breaking:  | open |  |  |  |
| P7.2 | P7 | Perf | open |  |  |  |
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

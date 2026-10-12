# nUIget 2.0 — item tracker

One row per work item of `2026-10-11-nuiget-2.0-execution-plan.md`, in execution order. `RUN.md` reads this file to pick
the next item and updates the row when the item closes. Status values: `open`, `in-progress`, `done`, `blocked`, `skipped`
(owner decision). The `commit` column holds the SHA on `main` that closed the item.

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
| P0.12 | P0 | ARCHITECTURE.md coexistence | done |  | 2026-10-12 | 2.0 section with ADR links, module map placeholder, coexistence table and a shared-tooling subsection that is now the truth for CI and packaging; 20 legacy H2s marked (the agent-resources H2 is not 1.x and is unmarked). All eleven ARCHITECTURE.md rows of the audit plan's Appendix A were re-verified against the code and corrected. Not corrected, not this item's file: the watcher timing in `.github/copilot-instructions.md` (1.x gotcha rows say about 5 s; the code uses 2 s and a 1 s re-arm). |
| P0.13 | P0 | Tracker docs/plans/STATUS.md (row per item) and docs/plans/findings-ledger.md (original le | open |  |  | Tracker created 2026-10-11 by the planning session; findings-ledger.md still to write Candidate findings collected by P0.0-P0.10 are in the tracker Notes and `.github/STATUS.md` history; one more from P0.8: the copilot-instructions `npm install` gotcha cited `@emnapi/*`, absent from the lockfile since 660b78b. Candidate finding from P0.11, "legacy tests pass with calls that do not match production signatures", each a separate finding routed to P5.12: `src/webview/NuGetSidebarPanel.test.ts:2000-2032` describe `sentinel guards` (titles `getInstalledPackages ignores sentinel projectPath`, `installPackage ignores sentinel projectPath`, `showContextMenu warns when projectPath is sentinel`: the constructor gets 3 of 4 arguments and `resolveView` an ignored second one, so the `not.toHaveBeenCalled` assertions are vacuous); `src/test/benchmarks/project-parsing.bench.ts:33-36` (private method, ignored second argument); `src/webview/app/components/InstalledTab.test.tsx:246-249` (`projects` is not a prop; the test asserts nothing); `src/test/integration/NuGetPanel.integration.test.ts:43-49` (`dependencyGroups` is not on `PackageMetadata`). |
| P0.14 | P0 | Optional (owner elects) | open |  |  | Optional; owner decides. Skip unless the owner marks it open. |
| P1.1a | P1 | Protocol salvage (sentinel required) | open |  |  |  |
| P1.1b | P1 | The contract-change item (sentinel required; advisor checkpoint before starting) | open |  |  |  |
| P1.2 | P1 | src/core/util/ (events, concurrency, fs, paths, topo); fix concurrency.ts:79; port diamond | open |  |  |  |
| P1.3 | P1 | src/core/versioning/ + isUpdateCandidate returns false for exact (test exact pin is not an | open |  |  |  |
| P1.4 | P1 | src/core/cache/ + deleteByPrefix, clearPackages, invalidationToCacheScopes, 8 MB byte budg | open |  |  |  |
| P1.5 | P1 | src/core/logging/ + redact.test.ts (port NuGetLogger.test.ts:17-83; add token-only userinf | open |  |  |  |
| P1.6 | P1 | src/core/cli/ | open |  |  |  |
| P1.7 | P1 | src/core/session/ + src/core/queries/scopes.ts (+tests); matchesProjectPaths normalizes wi | open |  |  |  |
| P1.8 | P1 | QueryCoordinator.ts (apply uncommitted refactor; fix carryOver leak); write QueryCoordinat | open |  |  |  |
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

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
| P0.5 | P0 | L2 hooks via the update-config skill | done |  | 2026-10-12 | Guard is live and fail-closed (`onFailure: block`). `scripts/hooks/index.js` makes the literal `node --test scripts/hooks` work on Node 22+. Focus/skip rule applies to test sources only. Known holes (shell rewrites of frozen paths) are listed in `.github/STATUS.md`, the note for repo-level items. |
| P0.6 | P0 | Build switch | open |  |  |  |
| P0.7 | P0 | ESLint fences per §3 (port quarry rules; protect sidebar-next; add /host/, /extension* to  | open |  |  |  |
| P0.10 | P0 | Packaging (runs before P0.8) | open |  |  |  |
| P0.8 | P0 | CI rewrite (runs after P0.10) | open |  |  |  |
| P0.11 | P0 | Test infrastructure | open |  |  |  |
| P0.12 | P0 | ARCHITECTURE.md coexistence | open |  |  |  |
| P0.13 | P0 | Tracker docs/plans/STATUS.md (row per item) and docs/plans/findings-ledger.md (original le | open |  |  | Tracker created 2026-10-11 by the planning session; findings-ledger.md still to write |
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
| P8.2 | P8 | Legacy deletion PR per the retirement map (src/services/ except what core re-exports, src/ | open |  |  |  |
| P8.3 | P8 | Release | open |  |  |  |

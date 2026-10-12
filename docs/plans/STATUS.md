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

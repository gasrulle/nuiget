# nUIget UX overhaul — item tracker

One row per work item of `2026-10-23-nuiget-ux-execution-plan.md` ("the plan"), in execution order. `RUN-ux.md`
reads this file to pick the next item and updates the row when the item closes. Status values: `open`, `in-progress`,
`done`, `blocked`, `skipped` (an owner decision, or the unused branch of a design-round decision), `owner action`
(the owner's step; a session never executes it). The Commit column holds the SHA on `labs/ux` that closed the item;
outside this file and the plan an item is written `UX-<ID>` (plan D57). Findings are tracked in `findings-ledger.md`
and Appendix A of `docs/research/2026-10-23-ux-research.md`.

**P0 ordering rule.** P0.0 is the owner's: the owner applies `patches/settings-and-launch.patch`; the first session that
finds exactly `.claude/settings.json` modified and `.claude/launch.json` added commits them as P0.0 (RUN-ux §1) and
closes the row, committing the two files and this row only. Sessions then run P0.1, P0.3 (before P0.2: `CLAUDE.md`'s
2.0 section binds until P0.3 replaces it), P0.2, P0.4 → P0.12, P0.27a (artboard A, needed by P0.13 and P0.19),
P0.13 → P0.27, P0.29 and P0.30, the order of the rows below. P0.28 runs once P0.0 is `done` (at
the latest before the P0 gate); until then its Notes `after P0.0` make sessions pass over it without blocking the rows
below it (RUN-ux §3). If P0.1 records a workflow name that does not resolve, the session continues with the plan's
§2.9 fallback. No P1 row starts before the P0 gate holds. Handoff notes of repository-level or multi-directory items
are `docs/plans/handoff/<ITEM>.md`, named in the row's Notes (plan §2.5).

**Design round 1 (2026-10-23): composition A** (the Extensions view). D48 = one grouped list per view, so the grouped-list
rows P2.1c–P2.1f and P3.7c–P3.7d are in; D49 folds F8 into P4.2b, so P5.5 is `skipped`. The plan had no row that exists
only under per-section lists. A cut feature's P5 rows become `skipped`.

| ID | Phase | Item | Status | Commit | Date | Notes |
|---|---|---|---|---|---|---|
| P0.0 | P0 | Owner action: apply the bundled settings patch; the first session commits it | done | 0982164 | 2026-10-23 | `git -C ~/github/nuiget apply patches/settings-and-launch.patch`, then start a session (the patch includes `gh workflow run ci.yml` and `npm view`). Committed by the first session: `git apply --check -R patches/settings-and-launch.patch` passed (the patch is applied exactly); `grep -c 'code-server' .claude/settings.json` → 1; `grep -c 'gh workflow run' .claude/settings.json` → 1 |
| P0.1 | P0 | Workflow-by-name probe: design-judge, precommit-review, phase-review in an Opus session, ultracode off | done | 475ca90 | 2026-10-23 | `design-judge` resolves (`design-judge: args.item (plan item id) is required`, 0 agents); `precommit-review` resolves (`precommit-review: args.range is required ('--cached', 'HEAD' or '<a>..<b>')`, 0 agents); `phase-review` resolves (`phase-review: args.phase is required`, 0 agents); no permission prompt for any of them; no §2.9 fallback needed. Note `docs/plans/handoff/P0.1.md` |
| P0.3 | P0 | Protocol replacement: CLAUDE.md UX section, copilot-instructions rows, advisor agent texts, ledger letters | done | bd13256 | 2026-10-23 | Both grep gates empty; ledger letters already present from the approval commit; `.vscodeignore` gained `captures/**`. Note `docs/plans/handoff/P0.3.md` |
| P0.2 | P0 | Hook: owner-only settings, `.claude/.test-retire`, read-only `gh api`, advisors' CONSULT text | done | 1e3fae0 | 2026-10-23 | Drafts installed and removed; `node --test scripts/hooks` 55/55; gotcha rows "Settings files are frozen" and "Test retirement" added. Note `docs/plans/handoff/P0.2.md` |
| P0.4 | P0 | Dependency policy: named Dependabot ignores; adjudicate open Dependabot PRs (#31) | done | 86b6978 | 2026-10-23 | PR #31: close, superseded by `labs/ux` UX-P0.4 (group bump landed with the jsdom layout fix; cause `@tanstack/virtual-core` 3.19.6 reads the client box). Owner's command: `gh pr close 31 --comment "Superseded by labs/ux UX-P0.4: the group landed there with the jsdom layout fix (src/webview/shared/primitives/testSupport.ts) that @tanstack/virtual-core 3.19.6 needs; main receives both with the release PR. Until then every Dependabot group that carries @tanstack/react-virtual >= 3.14.21 stays red on Test against main."` (alternative, owner only: cherry-pick the one-file fix onto `main`). D43's MSW premise failed re-check; rule written with the true reason. Note `docs/plans/handoff/P0.4.md` |
| P0.5 | P0 | Coverage floor 65/50/55/65 → 90/80/85/90 | done | 5e56cf8 | 2026-10-23 | `vitest.config.mts` at `edea0da` (totals 95.83/89.85/94.34/96.26). The Auto-mode classifier denied the Edit of `.github/workflows/ci.yml` and `.github/copilot-instructions.md` ("[Modify Shared Resources]"); the owner applied `patches/ux-p0.5-coverage-labels.patch` and the closing commit records it. Note `docs/plans/handoff/P0.5.md` |
| P0.5b | P0 | Floor 1.90.0: engines, @types/vscode, esbuild targets and ceilings, E2E matrix, CSS-baseline lint at 122, ADR-000 | done | b2739b9 | 2026-10-23 | round 2 (D54). Deviation: `@types-host/node` is `npm:@types/node@20.19.43`, not D25's `20.9.5` (the 20.9 declarations fail under TypeScript 6; architecture-advisor ruling; owner ratifies the plan literal). Owner action for P7.5: replace the `main` ruleset's required check `E2E (1.85.0)` with `E2E (1.90.0)` before the release PR merges. Note `docs/plans/handoff/P0.5b.md` |
| P0.6 | P0 | Dense static fixture workspace (three SDK projects, CPM, multi-TFM, Unsupported on SDK 8.0.425, two folders) | done | c088de9 | 2026-10-23 | Restores exit 0; `Newtonsoft.Json` 12.0.1 the only vulnerable pin; Unsupported resolves 8.0.425; Gateway opts out of the `app/` CPM props. Note `docs/plans/handoff/P0.6.md` |
| P0.7 | P0 | UI job: SDK 8.0.425 + 10.0.x, fixture restore with cache, Unsupported check, VS Code 1.140.0 pin, look keys | done | 4c5c0b1 | 2026-10-23 | `f3e384c` + `a211ffc` (CRLF fix). Run 39964817340: VS Code 1.140.0, Unsupported 8.0.425, 45 passing under Modern UI; attempt 2 restored both caches. Note `docs/plans/handoff/P0.7.md` |
| P0.8 | P0 | Named states Tier A: `states.ts`, capture suite, `crop-png.mjs`, width/theme helpers, new state cells | done | e166080 | 2026-10-23 | `78944b6` + `0f6b03b` (widths by the side bar's sash: ChromeDriver cannot resize an Electron window). Run 39978485895: 42 crops, 9 states `pending` (P2.8b ×5, P3.1b, P3.10 ×3), capture time 5 min 1 s. Note `docs/plans/handoff/P0.8.md` |
| P0.9 | P0 | Tier B matrix, the 1.90.0 floor lane (closes N64) and the macOS lane on `workflow_dispatch` | done | 9947435 | 2026-10-23 | round 2 (D55). Dispatch 40023246433 green in every job: matrix 6×64 crops (fluxbox, window 1920x1058), floor 36 classic crops on VS Code 1.90.0 (N64 closed), macOS outcome branch (a) of the ruling on `macos-26-intel` (owner superseded the paid runner, no paid minutes): `[capture] lane macos vscode 1.140.0 chromium 150 darwin dpr 1 look modern window 1440x785 png 1440x785`, 42 crops. Note `docs/plans/handoff/P0.9.md` |
| P0.10 | P0 | `measure.ts` (1): registry, hard/pending, gap membership, shared insets, PF-6, §8.1 P0 hooks | done | 5eb2737 | 2026-10-24 | PF-6 hard and green (`spread 0`, 7 captures); `DS-INSET-2@main-installed-single/toolbars: 16/6 4/4`; header boxes non-zero; pending lists 216 (modern) and 39 (classic) lines. UI runs 40030866618, 40032484060, 40033806066 (the third the evidence of record, after two helper fixes read off the runs). Note `docs/plans/handoff/P0.10.md` |
| P0.11 | P0 | `measure.ts` (2): heights with workbench parity, box centring, PF-3b, PF-5 | done | 4685207 | 2026-10-24 | PF-3b (`check box -0.5; icon -0.5`, 14–15 rows) and PF-5 (`left 660.8/660.8, height 24/24`) hard and green; every workbench control present on 1.140.0 in both looks, `docs/design/workbench/{modern,classic}.json` from UI run 40039425246; DS-HEIGHT-1..11 pending (DS-HEIGHT-1, -2 in the sidebar only, as this table says). Note `docs/plans/handoff/P0.11.md` |
| P0.12 | P0 | `measure.ts` (3): truncation, overlap/clipping, chrome still, target size, PF-2, PF-3a, PF-4 | done | 1a608e4 | 2026-10-24 | PF-2 (`gap 0`), PF-3a, PF-4 (6 px against the scroll port, ruling) and MS-8's chrome hard and green; V72 found (the webview document scrolls in All Projects and with the transitive section expanded: the Listbox's hidden hint), DS-OVERFLOW-6 added (design-advisor ruling and follow-up), its three states pending on P2.1a; `DS-OVERFLOW-2@main-installed-all` prints the badge rects. UI run 40049782712. Note `docs/plans/handoff/P0.12.md` |
| P0.27a | P0 | Artboard A corrected to the Design System, rendered (modern, classic, 932 px) and specified (`spec.json`) | done | c17da00 | 2026-10-24 | Note `docs/plans/handoff/P0.27a.md`; design-advisor approval with changes; rendered by UI run 40055485738 (the route works on Linux, VS Code 1.140.0); the spec meets the ruling's VERIFY and `measure.mjs` within 1 px; round 1: A; runs before P0.13; outputs `main-installed-single.dark-modern.932.png`, `main-installed-single.dark-modern-classic.932.png`, `main-installed-single.spec.json` (capture naming) |
| P0.13 | P0 | `measure.ts` (4): spec conformance, `check-rule-coverage.mjs` | done | d50e603 | 2026-10-24 | Note `docs/plans/handoff/P0.13.md`. Design trigger 6 ruled (design-advisor, 2026-10-24): 16 rules registered pending (11 on their Appendix B items, 5 on P0.18), ten Design-System-added rules as tracker rows the gate reads as Appendix B's second source; `node scripts/check-rule-coverage.mjs --states all` exit 0 (49 ids, 0 gap or hard at P0). Helper 8 `SPEC@main-installed-single` pending P2.8a, both looks (UI run 40062365597: `0/23 within 1`, the six details-pane ids missing until P2.8a's setup selects a row). Commits 114cda9, 4028c07, eda6028, 5fca190, f53da53 (lint fix: CI lints `scripts/`), d50e603. For P0.18: DS-TYPE-4's compact rows (18.2, target 22) and DS-COPY-3's Unsupported banner are red today. Tolerance questions for the flipping items in the note's Deviations. |
| P0.14 | P0 | Theme dump (six themes, both looks, 1.140.0, CI) and the missing exemplar states | done | f25b543 | 2026-10-24 | Note `docs/plans/handoff/P0.14.md`. UI run 40085462839 green (Modern UI `43 passing`, classic `8 passing`); 24 files in `docs/design/themes/` (12 theme files, 12 token records apart, second follow-up ruling) and both workbench JSON with `exemplar`, sha256 in the note; the dump diff only platform (font family, editor font family and size) and version keys; no aliased key absent on 1.140.0. Ledger of the 27: printing 8 + registered 5 (DS-FOCUS-1..4, DS-STATE-7), judge-only 2, by class 12. Widths 220/400/600 (`main-installed-single`), 400 (`main-installed-details`); PF-4 at 800/932/1200/1600; DS-OVERFLOW-6 at 220 pending P2.7 (`pendingWidths`, V50); tab clicks on the visible part (`clickVisible`). Blocked once by RUN-ux §5 (runs 40080890665 CRLF, 40081221804 the 220 click) and released by the owner. Commits 04f2be5, 87b1b3f, 3764bd4, 0f251e6, eb91a52 and this one; five design-advisor rulings in the note. Durations: exemplar 10 s, Tier A captures 3 min 46 s (modern), dump 19 s. Artboard A re-copied from run 40086847213 (fbc3d6f, design-advisor ruling); for P0.27's byte-identity gate: the two PNGs (e199e21c…, 7f8b6cc2…) are identical across runs 40086847213 and 40088065509, the spec differs only in its `run` field. Closing commits 0f5d64d, fbc3d6f, f25b543. |
| P0.15 | P0 | Goldens and pixel diff: `compare-goldens.mjs`, masks, text-metrics fingerprint | done | 57c88c0 | 2026-10-24 | Note `docs/plans/handoff/P0.15.md`. Gate: run 40101114443 on 971ef81 and its UI rerun, artifacts by id: every tolerance-0 state at 0 px on both attempts (attempt 2 `46 compared, 46 at 0 px` against the goldens; attempt 2 against attempt 1 45 at 0 px, the one line `main-installed-all.dark-modern-classic.1200` 205 px in x 1188–1196, V72); `[measure]` lines identical. 46 `baseline` goldens from run 40091010301 (none re-adopted); masks `LIVE_RESULTS`, `LIVE_DETAILS`, `LIVE_SUGGESTIONS`, `LIVE_CARET`, `LIVE_ICONS` (`.nuiget-row-icon`, 13 main states: icon resolution per run, X2/V31) and `LIVE_POPUP_HEADER` (H27); `diffTolerance: 0` on 21 ready states. **Ask:** `main-installed-all` cannot reach 0 px with masks (its V72 document scrollbar thumb differs between runs) and stays at 0.5 % until P2.1a. `main-installed-cpm` joined V72 (DS-OVERFLOW-6 and MS-8 chrome pending P2.1a). Two P0-gate items for the phase review are in the note (a `documentOverflow` re-read before the shot; a busy transitive header at measure time). Blocked once by RUN-ux §5 (runs 40092740893 CRLF, 40096010674 the cpm overflow) and released by the owner. Commits 935d4f5, 7851927, 2e41edc, 5dedc74, 35bb6ef, 971ef81 and this one; two design-advisor and two architecture-advisor rulings in the note. |
| P0.16 | P0 | `scripts/ui-harness.mjs` (`--vsix`, split ExTester commands, `--build-sha`) and the negative-control job | done | 0c01eee | 2026-10-24 | Note `docs/plans/handoff/P0.16.md`. Local gate `node scripts/ui-harness.mjs --tier A --storage /tmp/nuiget-ui` → exit 0 (`43 passing`); UI run 40105259227 green through the harness (`test:ui:capture`, `test:ui:classic` with `--installed`; suites in name order; 46 of 46 at 0 px). Negative-control dispatch 40106245758 on fa8f304 with `negative_sha=80940aa`: job green, VSIX built in `/tmp/nuiget-80940aa` (sha256 7edf7a06…), HEAD's suite measured it (`30 passing`, `13 failing`, by design). `--installed` added; the lanes keep `setup-and-run` until the P0 gate's Tier B dispatch (Deviations). precommit-review `wf_1e7dd37e-c35`: 3 blocking fixed, 6 non-blocking taken. Commit fa8f304 and this one. |
| P0.17 | P0 | Negative control (a): the pre-fix tree `80940aa` reports PF-2…PF-6 with coordinates | done | 57a9bdd | 2026-10-24 | Note `docs/plans/handoff/P0.17.md`; record `docs/design/negative-control.md` (a). Dispatch 40110663066 on 84de0f9 (`negative_sha=80940aa`, VSIX sha256 ac63d681…): PF-2 (two scrollers, header y 779), PF-3b (check box −14.5, icon −3.5, with the first row's centres), PF-4, PF-5, PF-6 red with coordinates in every cell; no PF line `not measurable`. **Deviation, owner ratifies at the P0 gate:** PF-3a reads `14/15 authors, none cut` on both trees at 1200 (a true measurement; P9.fix-3 is reported by PF-3b; no own-line clause or 932 binding under D46, DS-ROW-1, T-27). Helper changes admitted by the architecture-advisor: PF-2 finds the header by P9.fix-2's selector when the UX-P0.10 hook is absent; PF-3b prints its locus. HEAD unchanged in value (push run 40109705646). Commits 84de0f9 and this one; one design-advisor and two architecture-advisor rulings in the note. |
| P0.18 | P0 | Negative control (b): the current tree reports V2–V5 by measurement, nothing else blocking | done | 7a37d1a | 2026-10-24 | Note `docs/plans/handoff/P0.18.md`; record `docs/design/negative-control.md` (b); reference set `docs/ux/reference-2.0/` (46 crops of run 40111706433, sha256 in its README). On the 2.0 tree (run 40111706433): V2 `DS-INSET-2 …/toolbars: 16/6`, V3 `DS-INSET-3 … group headers 0` and `DS-INSET-2 … 16/5` (DS-OVERFLOW-2 bound, passing on the boundary), V4 `DS-GRID-2b … 9.3/19.2`, `20/43.2`, V5 `DS-GRID-1 … padding-left 7px`, `DS-GRID-2a … 3 off {4, 8}`, V1's numeric part DS-HEIGHT-4/6/7; PF-2…PF-6 green; no red hard rule. The five end-of-P0 rules flipped per state group (`TOLERANCES.fontExact`, `exceptStates`; reds to P3.7a, P3.2, P2.8b; unmeasured groups to P3.6, P3.1b, P3.10). One red run (40114517304: `main-browse-details` is a details-group state), fixed forward by the follow-up ruling; run 40115736685 green. Commits b7db585, 63cbc67, 3d8743b, 797f28b and this one; the ruling and its follow-up in the note. |
| P0.19 | P0 | Judge probe on both trees; hardness criterion (a); `docs/plans/judge-log/` | done | 129aba3 | 2026-10-24 | Note `docs/plans/handoff/P0.19.md`; log `docs/plans/judge-log/P0.19.json`. `design-judge` on `main-installed-single` at 932: `80940aa` (run 40110663066, Modern UI) 27 standing, base (run 40111706433) 25 Modern UI and 23 classic; 0 refuted, 0 incomplete; every standing finding `fixed` with its fix ordered to the owning item. Criterion (a): 6 met (P9.fix-3, -4, -6, V1, V2, V5), 1 not met (V4: DS-GRID-2b unreported), 3 pending artboard (P9.fix-2, P9.fix-5, V3); D37 date not recorded; P2.11 re-evaluates (round 3 artboards; a second panel on the frozen base capture `docs/ux/reference-2.0/main-installed-single.dark-modern.932.png`, sha256 34aad843…, is P2.11's call). Artboard A's list-pane colour is corrected in a separate commit before P2.8a (DECISIONS.md). |
| P0.20 | P0 | CSS lint gate (1): pxLength, duplicateSelector, specificity, override; 116-entry baseline | done | c99fceb | 2026-10-24 | Note `docs/plans/handoff/P0.20.md`. `src/test/lint/cssAudit.ts` (the audit's four rules, no dependency added) reproduces the research copy's 116 entries exactly; `css-audit.test.ts` holds hits = `__fixtures__/css-audit-baseline.json` (`[css-audit] baseline 116: pxLength 58, duplicateSelector 1, specificity 41, override 16`), the subset of the research copy, items from the tracker, and one planted defect per rule. Items by the design-advisor ruling: P1.1 34 (the hairlines; its widening to main/sidebar/search is P1.1's architecture question, fallback relabel recorded), P2.2 24, P3.4 15, P2.3 10, P2.6 7, P3.7a 6, P3.7c 5, P2.1e 4, P3.3a 3, P2.1a 2, P2.4 2, P3.2 2, P3.5 1, P3.6 1. A1's path deviation recorded. |
| P0.21 | P0 | CSS lint gate (2): deadRule, disableComment, TSX cssVars rule, done rule, negative control | done | ef0b59a | 2026-10-24 | Note `docs/plans/handoff/P0.21.md`. `deadRule`, `disableComment` and `inlineStyle` 0 on the tree with planted-defect tests; the done rule fails an entry whose item is `done`; negative control `116 hits with the baseline emptied, 116 audited`; `scripts/check-css-baseline.mjs --item <ID>` (G-UI step 1). `disableComment` reads the stylesheets (ADR-010 Decision 6 read with Decision 7 and the audit §10, architecture-advisor ruling): the nine TS/TSX `exhaustive-deps` directives are ESLint's, a non-blocking candidate for the P0 phase review. |
| P0.22 | P0 | 10 px token scrollbars: `scrollbar-color` with the WebKit rules, pins updated | done | a910726 | 2026-10-24 | round 2 (D54). Note `docs/plans/handoff/P0.22.md`. `:root { scrollbar-color: auto }` beside the WebKit rules (31c5a7b); `[probe] scrollbar` 10 px in the token colour on 1.140.0 (both looks, run 40126987318) and on the 1.90.0 floor lane (dispatch 40126994713); DS-SCROLL-1 registered `pending: P3.9`. 37 goldens re-baselined from run 40126987318, 9 kept from 40091010301 (design-advisor ruling); judge `standing 22, blocking 2, incomplete 0`, all 22 `fixed` ordered to their items (`docs/plans/judge-log/P0.22.json`); the sidebar's sub-pixel residual carried to the P0 phase review (P3.7a). Closing run 40132260430: `[diff] summary: 46 compared, 45 at 0 px, 0 above tolerance`, probe lines unchanged. |
| P0.23 | P0 | A11y harness (1): ARIA snapshot and full axe per state | done | fe957c9 | 2026-10-25 | Note `docs/plans/handoff/P0.23.md`. Commits 891b583, f9eed2d and the closing one: the full axe ruleset (plus `target-size`, `label-content-name-mismatch`) once per state in the `ui` lane, `a11y-full-axe-real-page` `hard`; `AXE_PENDING` three `color-contrast` incompletes on P0.25, `AXE_ACCEPTED` the row option name and the sidebar's missing h1 (DECISIONS 2026-10-25); 22 ARIA snapshots adopted from run 40136298952 (`main-installed-single` re-adopted from proving run 40141713581 after the settle wait of commit 8531469, design-advisor follow-up); the theme pass measures the Updates and Installed tabs in every theme (H30). Run 40142558808 on fe957c9: `nodes, equal` 22, `nodes, differs` 0. |
| P0.24 | P0 | A11y harness (2): keyboard paths, focus-after-close guard, reduced-motion check | done | 172c671 | 2026-10-25 | Note `docs/plans/handoff/P0.24.md`. Commit f9b719d and the closing one: `expectFocusAfterClose` after 27 dialog closes in nine feature tests, 11 sites pending on P4.4; four keyboard walks (`[keys]`, `KEYS_STATUS` hard; tab orders recorded from run 40146274455; the search ↔ list bridge pending on P4.3 ×8, Enter on a main Updates or sidebar row on P4.2a/P4.2b, never pressed); the motion check `pending P4.5`. |
| P0.25 | P0 | A11y harness (3): contrast coverage, rule-coverage ledger | done | ad0fa33 | 2026-10-25 | Note `docs/plans/handoff/P0.25.md`. Commits a92f91e, c45f356 (closing; its run 40154982730 red on the README moment's wait) and ad0fa33 (the wait fixed; run 40155567419 green, the ruling's VERIFY met): the theme pass's five contrast moments per theme and the capture audit's resolve pass (`CONTRAST_STATUS` hard; `CONTRAST_PENDING` 11 lines on P3.4/P4.6 from run 40152178889); `AXE_PENDING` emptied (every undecided node of its 17 states decided, both looks); the offline token-pair lint (`CONTRAST_LINT_STATUS` hard; 34 pairs, 5 theme-scoped parity exemptions, 52 pending cells on P1.1/P2.3/P3.4/P4.6; DECISIONS 2026-10-25); the rule-coverage ledger (41 rules, the frontend project's teardown). |
| P0.26 | P0 | Perf timing in Chromium | open |  |  |  |
| P0.27 | P0 | Artboard export: gate 0 on ubuntu, `serve-artboards.mjs`, `render-artboards.mjs` | open |  |  |  |
| P0.28 | P0 | Browser loop: `browser-loop.mjs` and the first-run probe | open |  |  | after P0.0 |
| P0.29 | P0 | Regression-matrix rows per state and helper; ledger backlog rows and stale statuses | open |  |  |  |
| P0.30 | P0 | Docs drift for RUN-ux, the Design System, the rubric and rule ids | open |  |  |  |
| P1.1 | P1 | `tokens.css` on the Design System (aliases, px type, roles, look tokens, reduced motion) | open |  |  | From UX-P0.25 (design-advisor ruling): 8 not-measurable cells of `list-active-fg/list-active-bg`, `border/list-active-bg`, `focus/list-active-bg` in the HC records (`CONTRAST_PAIRS_PENDING` in `src/test/ui/v2/contrast.ts`) go green with T-21's fallbacks: remove them; add `checkbox-select-border/list-active-bg` (non-text, hard) with its token, T-23 7.5:1 in Dark Modern. |
| P1.2 | P1 | ADR-008 residue (ErrorBoundary sentence), sentinel | open |  |  | `skipped` if the approval commit carries it |
| P1.3 | P1 | Look attributes on `<html>` at first paint | open |  |  |  |
| P1.4a | P1 | Codicon sync script, path lint, attribution | open |  |  |  |
| P1.4b | P1 | Icons regenerated, Verified mark, captures re-approved | open |  |  |  |
| P1.5 | P1 | Design reference check (`check-design-tokens.mjs`) | open |  |  |  |
| P2.1a | P2 | Listbox: the grouped list's model (one listbox per view, group rows, real virtualization) | open |  |  | round 1: A. Sets `main-installed-all`'s `diffTolerance` from 0.5 to 0 in `states.ts` after its own run-and-rerun pair at 0 px (UX-P0.15 Ask: V72's document scrollbar), and adds the pre-shot `documentOverflow` re-read if the P0 phase review assigns it here From UX-P0.23 (design-advisor follow-up): `main-installed-all`'s readiness waits for no project's metadata and no count; its crop differs between runs within the 0.5 % tolerance. |
| P2.1b | P2 | Typed row adapter | open |  |  |  |
| P2.1c | P2 | Grouped list: keyboard model and group rows | open |  |  | round 1: A |
| P2.1d | P2 | Grouped list: Installed consumers | open |  |  | round 1: A |
| P2.1e | P2 | Grouped list: transitive consumers | open |  |  | round 1: A |
| P2.1f | P2 | Grouped list: §8 hooks, ExTester helpers and harness scenarios | open |  |  | round 1: A |
| P2.2 | P2 | Row on the Extensions anatomy (72 px, two lines, 36 px icon; D46) | open |  |  | round 1: A. The rebuilt Row keeps `.nuiget-row-icon` or updates the `LIVE_ICONS` mask of `states.ts` in its own commit (UX-P0.15) |
| P2.3 | P2 | Button and Checkbox primitives | open |  |  | From UX-P0.25 (design-advisor ruling): 16 `border/bg`, `border/list-active-bg` cells in `CONTRAST_PAIRS_PENDING`; when the row check migrates to `checkbox.*` remove both `border` pairs from `TOKEN_PAIRS` (no control boundary is drawn in `border` then: `primitives.css:140` is the only one) and their entries; `checkbox-border/bg` stays exempt in Dark and Light Modern per D52. |
| P2.4 | P2 | Select and TextField primitives | open |  |  |  |
| P2.5 | P2 | Toolbar, IconButton and Tabs (V1, V2) | open |  |  | From UX-P0.23 (design-advisor DEFECTS): the Installed tab's accessible name reads its count twice (`tab "Installed # # package with known vulnerabilities"` in the main-installed-* ARIA snapshots: the badge and its title); a tab names its count once; the snapshots change with the fix (G-UI step 5). From UX-P0.24: `KEYS_EXPECTED['main-installed'][1]` and `['main-updates'][1]` (the tab stop) change with the fix, updated in the same commit. |
| P2.6 | P2 | SectionHeader and Badge (V3, V4) | open |  |  |  |
| P2.7 | P2 | Main shell chrome (V5) | open |  |  |  |
| P2.8a | P2 | Installed tab: single project and transitive | open |  |  | Before approving goldens against artboard A: its list pane is corrected from `editor.background` to the side-bar surface role in a separate commit (UX-P0.19 design-advisor ruling, DECISIONS.md) From UX-P0.23 (design-advisor follow-up): pin `main-installed-single`'s data state (its readiness leaves the provisional → authoritative transition unpinned; the crop has been provisional in three runs at tolerance 0); a golden re-baseline under a ruling; P4.8a is the product change that moves the window. |
| P2.8b | P2 | Installed tab: All Projects and state cells; V1–V5 hard | open |  |  |  |
| P2.9a | P2 | Native actions menu on both surfaces (`webview/context`) | open |  |  |  |
| P2.9b | P2 | Queued operations busy everywhere; menu proven on VS Code 1.90.0 | open |  |  |  |
| P2.10 | P2 | First before/after page `slice-1`: stop for the owner | open |  |  | Stop condition |
| P2.11 | P2 | Re-base; judge disposition rate; stop if > 150 % | open |  |  |  |
| P3.1a | P3 | Updates tab rebuilt on the grouped list, single project | open |  |  |  |
| P3.1b | P3 | Updates tab: All Projects and states | open |  |  |  |
| P3.2 | P3 | Browse list and quick search | open |  |  | Owns the cause of the popup text's run-to-run anti-aliasing (H27, corrected; the popup's compositing) and keeps `.nuiget-search-popup-header` or updates the `LIVE_POPUP_HEADER` mask of `states.ts` (UX-P0.15) |
| P3.3a | P3 | PropertyList, GroupCaption, details facts | open |  |  |  |
| P3.3b | P3 | Details header, actions and split | open |  |  |  |
| P3.4 | P3 | README typography and details contrast | open |  |  | From UX-P0.25 (design-advisor ruling): 18 `syntax-*` cells in `CONTRAST_PAIRS_PENDING`; `readme` colour ×3 in `CONTRAST_PENDING` (`.nuiget-hljs-number`, and `pre > code` in Light High Contrast, cause to read from the moment's reasons); `readme` `target-size` ×6: list links at a 24 px pitch, T-9 precedent, DECISIONS 2026-10-25; README content is measured by the theme pass alone (the dense workspace's `main-details-readme` shows no README). |
| P3.5 | P3 | Dialogs and layers (scrim, Popover ruling) | open |  |  |  |
| P3.6 | P3 | Sources dialog (N82) | open |  |  |  |
| P3.7a | P3 | Sidebar sections and 22 px compact rows (D47) | open |  |  | round 1: A From UX-P0.24: sorting the main Installed list by id changes `KEYS_EXPECTED['main-installed'][4]` and the `main-installed-*` snapshots; updated in the same commit. |
| P3.7b | P3 | Sidebar header content (source name, ≤ 4 title actions, SB2, SB10, SB13) | open |  |  |  |
| P3.7c | P3 | Grouped list: sidebar Installed | open |  |  | round 1: A |
| P3.7d | P3 | Grouped list: sidebar Updates | open |  |  | round 1: A |
| P3.8 | P3 | Sidebar Browse and states (SB9, SB14) | open |  |  |  |
| P3.9 | P3 | Shared chrome: sash, scrollbars, dividers, high contrast | open |  |  |  |
| P3.10 | P3 | State cells sweep | open |  |  |  |
| P3.11 | P3 | Microcopy | open |  |  |  |
| P3.12 | P3 | Leftover stylesheet debt; store-slice audit | open |  |  |  |
| P4.1 | P4 | Polish contract bundle (look fields, delete-confirm setting, `projectPath?`, `ui/contextMenu` removed) | open |  |  |  |
| P4.2a | P4 | Keyboard model, main panel: Enter selects, Ctrl/Cmd+Enter writes, Delete confirms | open |  |  |  |
| P4.2b | P4 | Keyboard model, sidebar: Enter opens the main panel on the row (F8 folded in) | open |  |  | round 1: A (D49) |
| P4.3 | P4 | Search ↔ list bridge and list keys | open |  |  | From UX-P0.24: the eight `KEYS_PENDING` entries `<screen> search Ctrl+DownArrow` and `<screen> rows Ctrl+UpArrow` (four screens, `src/test/ui/v2/a11y.ts`) are P4.3's to remove in its commit, after which the walk asserts them hard (`KEYS_STATUS` hard since P0.24); the paths' expectations are §5's as written. |
| P4.4 | P4 | Focus management | open |  |  |  |
| P4.5 | P4 | Motion | open |  |  |  |
| P4.6 | P4 | Announcements and semantics | open |  |  | From UX-P0.25 (design-advisor ruling): `hover-main@dark-2026` ×2 and `hover-sidebar@dark-2026` ×1 in `CONTRAST_PENDING`, and the 10 hover cells of `version-new/list-hover-bg over bg`, `… over bg-sidebar` and `fg-muted/list-hover-bg over bg-sidebar` in `CONTRAST_PAIRS_PENDING`; Dark 2026 included (Appendix B's 'hover' is not limited to the light themes); the main-panel pair reads 4.51 offline and fails live. |
| P4.7 | P4 | Operation feedback in place, no single-success toast (D50) | open |  |  | round 1: A |
| P4.8a | P4 | Provisional chunk merges into the authoritative list (X7) | open |  |  |  |
| P4.8b | P4 | Settling and revalidation cues | open |  |  |  |
| P4.9 | P4 | Perceived speed in core (cuttable) | open |  |  |  |
| P4.10 | P4 | Forced colours and zoom | open |  |  |  |
| P5.0 | P5 | Feature contract bundle (deprecation, per-version vulnerability flags, MB3's bare-row search chunk) | open |  |  | MB3's chunk always (D56) |
| P5.1a | P5.1 | F1: unknown is not "none"; transitive vulnerability counts | open |  |  |  |
| P5.1b | P5.1 | F1: severity on badges | open |  |  |  |
| P5.2a | P5.2 | F2: core deprecation and per-version flags | open |  |  |  |
| P5.2b | P5.2 | F2: deprecation and remediation in the UI | open |  |  |  |
| P5.3a | P5.3 | F3: Consolidate model | open |  |  |  |
| P5.3b | P5.3 | F3: Consolidate view | open |  |  |  |
| P5.4 | P5.4 | F7: sidebar vulnerability marks (DP10) | open |  |  |  |
| P5.5 | P5.5 | F8: precise cross-surface navigation | skipped |  | 2026-10-23 | round 1: A; folded into P4.2b by D49 |
| P5.6 | P5.6 | F4: promote a transitive package | open |  |  |  |
| P5.7a | P5.7 | F5: palette commands | open |  |  |  |
| P5.7b | P5.7 | F5: category and keybinding | open |  |  |  |
| P5.8 | P5.8 | F6: Restore in the header, Collapse/Expand all | open |  |  |  |
| P5.9a | P5.9 | F9: Browse rows first, enrichment after (MB3) | open |  |  | round 2 (D56); moves to P7 if F9 is cut |
| P5.9b | P5.9 | F9: Browse continuity (X74, MB16, MB18 by design, MB19) | open |  |  | MB16 and MB19 move to P7.3 if cut |
| P5.10a | P5.10 | F10: mapping contract | open |  |  |  |
| P5.10b | P5.10 | F10: mapping in the UI | open |  |  |  |
| P5.11a | P5.11 | F11: one central-update confirmation, contract (X9) | open |  |  |  |
| P5.11b | P5.11 | F11: the shared confirmation | open |  |  |  |
| P6.1 | P6 | Developer content to `.github/CONTRIBUTING.md` | open |  |  |  |
| P6.2 | P6 | Marketing captures and the README image drift check | open |  |  |  |
| P6.3 | P6 | Hero GIF (`render-hero.mjs`) | open |  |  |  |
| P6.4a | P6 | `check-readme.mjs` and generated tables | open |  |  |  |
| P6.4b | P6 | README rewritten from a blank page | open |  |  |  |
| P6.5 | P6 | README preview (Extensions view Details tab) and judge | open |  |  |  |
| P6.6 | P6 | CHANGELOG 2.0.0 for users; `check-changelog.mjs` in CI | open |  |  |  |
| P6.7 | P6 | Listing metadata | open |  |  |  |
| P7.1 | P7 | Icon breaker (DP3), pre-release blocker | open |  |  |  |
| P7.2 | P7 | Release mechanics: pre-release VSIX, checklist after the PAT retirement | open |  |  |  |
| P7.3 | P7 | Closure: ledger, matrix, ARCHITECTURE, cut-feature fallbacks | open |  |  |  |
| P7.4 | P7 | Second before/after page `release`: stop for the owner | open |  |  | Stop condition |
| P7.5 | P7 | Release pull request: stop for the owner to merge and publish | open |  |  | Stop condition |

## Pending measurement rules

Written at P0 (plan Appendix B is the source); each flip updates its row in the item's commit. A rule is `pending`
until the item named for its state group flips it; only that item may (plan §2.7). P0.18 sets `hard` any rule found
green on the unchanged tree and records it here. The rule-coverage gate (`node scripts/check-rule-coverage.mjs --states
<list>`, design trigger 6, UX-P0.13) reads this table for a rule Appendix B does not list: write such a row with full,
comma-separated ids (the `-3`, `…` and `/ -2` shorthands do not expand); `later` is the status of a rule whose helper no
P0 item provides.

| Rule | Helper | State group | Catches | Flipped by | Status |
|---|---|---|---|---|---|
| PF-2, PF-3a, PF-3b, PF-4, PF-5, PF-6 | 1–6 | main | P9.fix-2…6 | P0.10–P0.12 | hard at P0 |
| MS-8 chrome still | 6 | main header, search box, tab strip; sidebar header | P9.fix-2 class | P0.12 | hard at P0; four states pending V72 on P2.1a: `main-transitive-expanded`, `main-transitive-details`, `main-installed-all`, `main-installed-cpm` (the fourth by the UX-P0.15 design-advisor ruling, DO 5) |
| DS-OVERFLOW-6 | 6 | every group | V72 | P2.1a for the four states | hard at P0, four states pending on P2.1a (`main-transitive-expanded`, `main-transitive-details`, `main-installed-all`, `main-installed-cpm`; the fourth by the UX-P0.15 design-advisor ruling, DO 5) and the main panel's 220 px width pending on P2.7 (V50; UX-P0.14 ruling, `pendingWidths`) |
| DS-GRID-1 | 1 gap membership | main / updates / browse / details / dialogs / sources / sidebar | V5 | P2.7 / P3.1b / P3.2 / P3.3b / P3.5 / P3.6 / P3.7a | pending |
| DS-GRID-2a | 1 | main, then as DS-GRID-1 | V1, V5 | P2.7 | pending |
| DS-GRID-2b | 1 | main headers, then as DS-GRID-1 | V4 | P2.6 | pending |
| DS-INSET-1 | 2 shared insets | main / details / sidebar | — | P2.7 / P3.3b / P3.7a | pending |
| DS-INSET-2 | 2 | toolbars / headers / main header / sidebar | V2, V3, V5 | P2.5 / P2.6 / P2.7 / P3.7a | pending |
| DS-INSET-3 | 6 containment | rows / headers / sidebar | V2, V3 | P2.2 / P2.6 / P3.7a | pending |
| DS-INSET-4 | 2 | details | — | P3.3b | pending |
| DS-HEIGHT-1, -2 | 3 heights | sidebar | — | P3.7a | pending |
| DS-HEIGHT-3 | 3 | main | — | P2.2 | pending |
| DS-HEIGHT-4 | 3 + workbench parity | main tabs | V1 | P2.5 | pending |
| DS-HEIGHT-5 | 3 + parity | details | — | P3.3b | pending |
| DS-HEIGHT-6 | 3 + parity | buttons | V1 | P2.3 | pending |
| DS-HEIGHT-7 | 3 + parity | inputs, selects | V1 | P2.4 | pending |
| DS-HEIGHT-8 | 3, 7 target size | icon buttons | — | P2.5 | pending |
| DS-HEIGHT-9 | 3 | check boxes | — | P2.3 | pending |
| DS-HEIGHT-10 | 3 | badges | — | P2.6 | pending |
| DS-HEIGHT-11 | 3 | main / rest | — | P2.8b / P3.10 | pending |
| DS-ROW-1, -3, -6 | 2, 4, 6 | main rows; DS-ROW-3 also sidebar rows | V2 (ROW-3) | P2.2 / sidebar (DS-ROW-3): P3.7a | pending |
| DS-ROW-2 | 2 | transitive / browse | — | P2.8a / P3.2 | pending |
| DS-ROW-5 | 5 truncation | comfortable / compact | — | P2.2 / P3.7a | pending |
| DS-TYPE-2, -3 | computed styles | all; details headings | — | P1.1; P3.3a | pending |
| DS-TYPE-5 | computed styles | groups / sidebar | — | P2.6 / P3.7a | pending |
| DS-TYPE-7 | computed styles | panel title / details title | — | P2.7 / P3.3b | pending |
| DS-ICON-2, -3, -4 | computed styles, 3 | icon buttons / package icons / Verified | — | P2.5 / P2.2 / P1.4b | pending |
| DS-COLOR-1 | computed colours | main / each screen | — | P2.8b / its P3 item | pending |
| DS-COLOR-2 | unfocused-list state | rows | — | P2.2 | pending (vacuous on the probe) |
| DS-COLOR-3, -4 | hover, computed colours | icon buttons, tabs | — | P2.5 | pending |
| DS-COLOR-5 | computed colours | rows / tabs | — | P2.2 / P2.5 | pending |
| DS-COLOR-6 | computed opacity and colours | text buttons / icon buttons and action labels | V38 | P2.3 / P2.5 | pending |
| DS-COLOR-7 | computed colours | buttons | — | P2.3 | pending |
| DS-DENSITY-1 | 3 | main / sidebar | — | P2.2 / P3.7a | pending |
| DS-OVERFLOW-1 | 5, 6 at minimum widths | main / details / sidebar | — | P2.7 / P3.3b / P3.7a | pending |
| DS-OVERFLOW-2 | 6 | headers (section-header boxes in main, details, sidebar) | V3 | P2.6 | pending (vacuous on the probe) |
| DS-OVERFLOW-3 | 6 at narrow widths | toolbars, tabs / details actions | — | P2.5 / P3.3b | pending |
| DS-OVERFLOW-4 | workbench DOM | sidebar title | — | P3.7b | pending |
| DS-OVERFLOW-5 | 6 at 220 px | details split | — | P3.3b | pending |
| DS-STATE-1…4 | markers, captures | main / updates / rest | — | P2.8b / P3.1b / P3.10 | pending |
| DS-STATE-5, -6 | outcome states | rows | — | P4.7 | pending |
| DS-STATE-7 | text present | installed / details | — | P2.8a / P3.3b | pending; registered by P0.14 (helper 5: every visible `aria-disabled` element and disabled button has a reason in text) in `main-installed`, `main-updates`, `browse` (P2.8a) and `details` (P3.3b) |
| DS-FOCUS-1…4 | focus states | rows / controls / tabs | — | P2.2 / P2.3, P2.4 / P2.5 | pending; registered by P0.14 (helper 6, the focused element): DS-FOCUS-1 `controls` P2.4 (P2.3's buttons and check boxes are its share; P2.4 flips once both kinds are green) and `tabs` P2.5; DS-FOCUS-2 `rows` P2.2; DS-FOCUS-3 `rows` P2.2 and `tabs` P2.5 in `main-installed-details` and `main-updates` (the sidebar branch waits for a sidebar click state); DS-FOCUS-4 `rows` P2.2 in the two high-contrast themes only (the hover clause waits for an HC hover state) |
| DS-MOTION-1, -2 | runtime check | all | — | P4.5 | pending |
| DS-COPY-1, -4 | microcopy lint | all | — | P3.11 | pending |
| DS-COPY-2 | text | details | — | P3.3a | pending |
| DS-COPY-5 | text | main / sidebar | — | P2.6 / P3.7b | pending |
| DS-DIVIDER-1 / -2 / -3 / -4 | computed borders, shadows | rows / layers / popup / main | — | P2.2 / P3.5 / P3.2 / P2.7 | pending; DS-DIVIDER-3 has no subject in the dense workspace (the grouped popup needs two or more sources, `SearchBox.tsx:103`; P0.6's `nuget.config` has one): P3.2 adds the source or a scenario when it flips (UX-P0.14 ruling) |
| MS-8 first-row y Installed ↔ Updates | 6 | main | — | P3.1b | pending |
| DS-TYPE-1 | 3 computed styles | main-installed, main-updates, browse, details, dialogs, sidebar / sources | — | P0.18 / P3.6 | hard at P0.18 (run 40111706433) in the six groups; sources pending P3.6 (no state measures it yet) |
| DS-TYPE-4 | 3 computed styles | main-installed, main-updates, browse, details, dialogs / sidebar / sources | V36, V14 (sidebar) | P0.18 / P3.7a / P3.6 | hard at P0.18 (run 40111706433) in the five groups; sidebar pending P3.7a (compact rows 18.2, target 22; D47); sources pending P3.6 |
| DS-TYPE-6 | 3 computed styles | main-installed, main-updates, details, sidebar / browse | T-27 (browse) | P0.18 / P3.2 | hard at P0.18 (run 40111706433) at `TOLERANCES.fontExact` 0.1 in main-installed, main-updates, details, sidebar; pending P3.2 in browse and in `main-browse-details` (a details-group state by `stateGroup`, through `pendingStates`; description 11.05, target 13); except `main-installed-filter-nomatch`, `main-quicksearch-open`, `main-quicksearch-versions` (no row by design) |
| DS-ROW-4 | 6 | main-installed, main-updates, browse, details, sidebar | — | P0.18 | hard at P0.18 (run 40111706433); except the three no-row states of DS-TYPE-6 |
| DS-COPY-3 | 5 text | main-installed / main-updates / browse, sidebar | — | P0.18 / P3.1b / P3.10 | hard at P0.18 (run 40111706433) in main-installed, `main-installed-unsupported` pending P2.8b (the banner lacks its full stop); main-updates pending P3.1b, browse and sidebar pending P3.10 (no ready state shows their empty, error or unavailable cells yet) |
| SPEC (spec conformance against `docs/design/artboards/<state>.spec.json`) | 8 | main-installed (`main-installed-single` at 932, both looks) | V45 | P2.8a | pending |
| DS-ALIGN-1 | 2 | details | V59 | P3.3a | pending |
| DS-TYPE-8 | lint (`em`/`%` font-size) and computed badge size | all | V17 | lint: P1.1 · badges: P2.6 | later |
| DS-TYPE-9 | computed styles | main, details, dialogs | V61 | details headings: P3.3a · panel title: P2.7 · details title: P3.3b · dialog titles: P3.5 | later |
| DS-RADIUS-1 | computed styles | all | V20 | buttons: P2.3 · selects and text fields: P2.4 | later |
| DS-RADIUS-2 | computed styles | all | V47 | rows and package icon: P2.2 · check box: P2.3 · icon buttons: P2.5 · badges: P2.6 · popup: P3.2 · layers: P3.5 · sidebar headers: P3.7a · scrollbar: P3.9 | later |
| DS-DIVIDER-5 | computed colours | dialogs | V19 | P3.5 | later |
| DS-DIVIDER-6 | computed styles and a 300 ms runtime check | details | V16 | P3.9 | later |
| DS-SCROLL-1 | P0.22's scrollbar probe (`offsetWidth − clientWidth`, thumb colour, `scrollbar-color` of `:root`) | all | V15 | registered by P0.22 as `pending: P3.9` (classic 10 px from P0.22; Modern UI 8 px needs P1.1's look token) | pending P3.9 (helper 3 in `measure.ts` reads the thickness and `:root`'s `scrollbar-color`; the thumb's pixel is the `[probe] scrollbar` line) |
| DS-SCROLL-2 | computed box-shadow in a scrolled state | main, sidebar | — | P3.9 (adds the scrolled state) | later |
| DS-LOOK-1 | the §6 look table against the per-look token dumps of P0.14 | all | — | registered by P1.1 as `pending: P1.3` · flipped by P1.3 | later |
| DS-HC-1 | computed borders in the two HC themes | main, sidebar | V33, V56 | badges: P2.6 · tabs: P2.5 · both HC themes: P3.9 | later |
| a11y-focus-after-close | jsdom guard | dialogs | A6 | P4.4 | pending P4.4, guard wired at P0.24 (`expectFocusAfterClose`, 27 close sites in nine feature tests): 11 pending sites in `FOCUS_AFTER_CLOSE_PENDING`. A6's mechanism (the confirm's own update disables the opener): `installed-bulk-uninstall-confirm`, `installed-bulk-uninstall-partial-confirm`, `installed-all-projects-uninstall-confirm`, `updates-update-all-confirm`, `updates-busy-update-all-confirm`, `updates-all-projects-update-confirm`, `sidebar-update-all-confirm`, `sidebar-all-projects-update-all-confirm`, `details-cpm-install-confirm`, `details-cpm-update-confirm`; no opener: `sources-host-opened-escape`. P4.4 is the one flipping item; an item that removes a site before P4.4 (e.g. the sidebar's X9 ruling at P3.7a) deletes that id's entry in the same change, noted "cleared ahead of P4.4", and flips nothing else (design-advisor ruling of 2026-10-25). |
| a11y-enter-not-destructive | keyboard paths | main lists / sidebar lists | A1, A2 | P4.2a / P4.2b | pending (since UX-P0.24 the capture suite records Enter on a main Updates row and on a sidebar row as not pressed, `KEYS_PENDING` `main-updates rows Enter` → P4.2a and `sidebar rows Enter` → P4.2b in `src/test/ui/v2/a11y.ts`; P4.2a/P4.2b remove their entry and make the walk press the key in `capture.ui.test.ts`) |
| a11y-hint-truthful | text | main lists | A3 | P2.9a | pending |
| a11y-reduced-motion-both-signals | runtime check | all | A4 | P4.5 | pending P4.5, check wired at P0.24 (`[motion]` once per run in the capture suite, `MOTION_STATUS` in `src/test/ui/v2/a11y.ts`) |
| a11y-text-contrast-all-states | axe | README / hover | A8, A14 | P3.4 / P4.6 | pending; the theme pass's five moments and the capture audit's resolve pass hard at P0.25 (`CONTRAST_STATUS` in `src/test/ui/v2/a11y.ts`); `CONTRAST_PENDING`: `readme` colour ×3 (light-modern, light-high-contrast, light-2026) and `target-size` ×6 (every theme) on P3.4, `hover-main` and `hover-sidebar` in Dark 2026 on P4.6 (run 40152178889) |
| a11y-nontext-contrast | axe, offline lint | check marks | A7 | P2.3 | pending; the offline lint hard at P0.25 (`src/test/lint/theme-contrast.test.ts` over `TOKEN_PAIRS`, `CONTRAST_LINT_STATUS` in `src/test/ui/v2/contrast.ts`); `CONTRAST_PAIRS_PENDING`: 16 `border/bg`, `border/list-active-bg` cells on P2.3 (and the text cells: 18 `syntax-*` on P3.4, 10 hover on P4.6, 8 high-contrast on P1.1); exemptions by the design-advisor ruling of 2026-10-25 (DECISIONS) |
| a11y-first-load-announced | live region | main / Browse | A9, MB19 | P4.6 / P5.9 | pending |
| a11y-full-axe-real-page | axe | all; details `incomplete` tolerated until P3.4; fold, popup and dialog `incomplete` decided by the resolve pass since P0.25; row options exempt from `label-content-name-mismatch` and the sidebar from `page-has-heading-one` (DECISIONS 2026-10-25) | A5 | hard at P0.23; tolerance removed by P3.4 | hard (P0.23) |
| CA-R3 / CA-R4 | `wc -l` / lint | MainShell / Listbox | — | P2.7 / P2.1a | pending |

## Phase gates

Each phase boundary appends: the gate line's commands with pasted results; the `phase-review` verdict with both
advisors' answers verbatim (or the two direct PHASE REVIEW answers); the judge disposition rate; the fix rows created;
the tag `labs/ux-<phase>-done`.

Recorded for the P0 gate before it runs:

- **Owner action at the P0 gate:** ratify UX-P0.17's deviation from its gate literal "each of PF-2…PF-6 red on `80940aa`": PF-3a
  reads `14/15 authors, none cut` on both trees at panel 1200 (P9.fix-3 is reported on `80940aa` by PF-3b); rulings and record in
  `docs/plans/handoff/P0.17.md` and `docs/design/negative-control.md`.
- For the phase review (UX-P0.15's note): a `documentOverflow` re-read immediately before the shot (default owner P2.1a); a busy
  transitive header at measure time (`DS-INSET-2@main-transitive-expanded/headers` and `@main-installed-single/headers` differ
  between runs of one SHA), the predicate in that note.
- For the phase review (UX-P0.21's note): whether a TS/TSX disable-directive lint under `src/webview/**` is wanted, and whether
  ADR-010 Decision 6's wording is tightened to "in a stylesheet under `src/webview/**`" (a `P0.fix-n` row under the contract
  sentinel if so).
- For the phase review (UX-P0.22's note): the sidebar's Updates rows and the Update-all dialog re-rasterise sub-pixel when the
  Installed list's scrollbar narrows; deterministic, no measured geometry moved, mechanism not identified; for P3.7a.
- For the phase review (UX-P0.23's note): `axe-core` is read from `jest-axe`'s hoisted copy by `theme.ui.test.ts`, the capture
  suite and the lint test; a Dependabot bump of `jest-axe` moves the ruleset under the `[axe]` lines and the names in the ARIA
  snapshots; a direct pinned devDependency is a `package.json` change no P0 row names.

## Advisor decisions

Rulings that span items, verbatim, with date and item. A ruling for one item goes into that item's handoff note.

- 2026-10-23, UX-P0.8, architecture-advisor (state cells a static fixture can produce; the full ruling is in
  `docs/plans/handoff/P0.8.md`): "a state cell that a static fixture can produce (an empty project; a project with a
  `$(UndefinedVersion)` reference; a folder whose `nuget.config` names a `.invalid` source) is produced by the owning
  item adding that fixture to `src/test/ui/fixtures/dense-workspace/` in its own commit, with `dense-fixture.test.ts`
  and the `ci.yml` restore list and cache key following and the four existing projects byte-identical (§2.6: static,
  never mutated at runtime; that item verifies `dotnet restore` of the new project and decides whether the restore
  step excludes it); loading-first and revalidating have no static-fixture path, so P2.8b opens a stop-and-ask on its
  hold mechanism before writing code; a product hook or a runtime settings write is never the mechanism."
- 2026-10-23, UX-P0.9, architecture-advisor (the full ruling is in `docs/plans/handoff/P0.9.md`), the parts that reach
  other items: "Tier B = every `ready` state (tier A or B) × the three widths of its surface (main 800/1200/1600,
  sidebar 200/300/400) × the shard's theme, Modern UI; a state named for a width (`sidebar-narrow-200px`) only at that
  width"; "`tier: 'B'` on a state means matrix only"; "No `-floor` suffix. The name says what rendered: the floor renders
  classic, so its files are `<state>.<theme>-classic.<width>.png`"; "The per-push `ui` job keeps VS Code's natural
  1440x900 window: it is the provenance of the goldens (P0.15) and of the P0 measurements"; `negative_sha` is declared
  by P0.9 and consumed by P0.16.

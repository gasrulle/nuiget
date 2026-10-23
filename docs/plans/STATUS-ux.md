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
| P0.1 | P0 | Workflow-by-name probe: design-judge, precommit-review, phase-review in an Opus session, ultracode off | done |  | 2026-10-23 | `design-judge` resolves (`design-judge: args.item (plan item id) is required`, 0 agents); `precommit-review` resolves (`precommit-review: args.range is required ('--cached', 'HEAD' or '<a>..<b>')`, 0 agents); `phase-review` resolves (`phase-review: args.phase is required`, 0 agents); no permission prompt for any of them; no §2.9 fallback needed. Note `docs/plans/handoff/P0.1.md` |
| P0.3 | P0 | Protocol replacement: CLAUDE.md UX section, copilot-instructions rows, advisor agent texts, ledger letters | open |  |  |  |
| P0.2 | P0 | Hook: owner-only settings, `.claude/.test-retire`, read-only `gh api`, advisors' CONSULT text | open |  |  |  |
| P0.4 | P0 | Dependency policy: named Dependabot ignores; adjudicate open Dependabot PRs (#31) | open |  |  |  |
| P0.5 | P0 | Coverage floor 65/50/55/65 → 90/80/85/90 | open |  |  |  |
| P0.5b | P0 | Floor 1.90.0: engines, @types/vscode, esbuild targets and ceilings, E2E matrix, CSS-baseline lint at 122, ADR-000 | open |  |  | round 2 (D54) |
| P0.6 | P0 | Dense static fixture workspace (three SDK projects, CPM, multi-TFM, Unsupported on SDK 8.0.425, two folders) | open |  |  |  |
| P0.7 | P0 | UI job: SDK 8.0.425 + 10.0.x, fixture restore with cache, Unsupported check, VS Code 1.140.0 pin, look keys | open |  |  |  |
| P0.8 | P0 | Named states Tier A: `states.ts`, capture suite, `crop-png.mjs`, width/theme helpers, new state cells | open |  |  |  |
| P0.9 | P0 | Tier B matrix, the 1.90.0 floor lane (closes N64) and the macOS lane on `workflow_dispatch` | open |  |  | round 2 (D55) |
| P0.10 | P0 | `measure.ts` (1): registry, hard/pending, gap membership, shared insets, PF-6, §8.1 P0 hooks | open |  |  |  |
| P0.11 | P0 | `measure.ts` (2): heights with workbench parity, box centring, PF-3b, PF-5 | open |  |  |  |
| P0.12 | P0 | `measure.ts` (3): truncation, overlap/clipping, chrome still, target size, PF-2, PF-3a, PF-4 | open |  |  |  |
| P0.27a | P0 | Artboard A corrected to the Design System, rendered (modern, classic, 932 px) and specified (`spec.json`) | open |  |  | round 1: A; runs before P0.13; outputs `main-installed-single.dark-modern.932.png`, `main-installed-single.dark-modern-classic.932.png`, `main-installed-single.spec.json` (capture naming) |
| P0.13 | P0 | `measure.ts` (4): spec conformance, `check-rule-coverage.mjs` | open |  |  |  |
| P0.14 | P0 | Theme dump (six themes, both looks, 1.140.0, CI) and the missing exemplar states | open |  |  |  |
| P0.15 | P0 | Goldens and pixel diff: `compare-goldens.mjs`, masks, text-metrics fingerprint | open |  |  |  |
| P0.16 | P0 | `scripts/ui-harness.mjs` (`--vsix`, split ExTester commands, `--build-sha`) and the negative-control job | open |  |  |  |
| P0.17 | P0 | Negative control (a): the pre-fix tree `80940aa` reports PF-2…PF-6 with coordinates | open |  |  |  |
| P0.18 | P0 | Negative control (b): the current tree reports V2–V5 by measurement, nothing else blocking | open |  |  |  |
| P0.19 | P0 | Judge probe on both trees; hardness criterion (a); `docs/plans/judge-log/` | open |  |  | Artboard: `main-installed-single` only, from P0.27a (round 1 A; `main-installed-single.dark-modern.932.png` and `main-installed-single.dark-modern-classic.932.png`); `main-installed-all`, `main-transitive-expanded`, `main-updates`, `main-installed-details` come with round 3 (`pending artboard`) |
| P0.20 | P0 | CSS lint gate (1): pxLength, duplicateSelector, specificity, override; 116-entry baseline | open |  |  |  |
| P0.21 | P0 | CSS lint gate (2): deadRule, disableComment, TSX cssVars rule, done rule, negative control | open |  |  |  |
| P0.22 | P0 | 10 px token scrollbars: `scrollbar-color` with the WebKit rules, pins updated | open |  |  | round 2 (D54) |
| P0.23 | P0 | A11y harness (1): ARIA snapshot and full axe per state | open |  |  |  |
| P0.24 | P0 | A11y harness (2): keyboard paths, focus-after-close guard, reduced-motion check | open |  |  |  |
| P0.25 | P0 | A11y harness (3): contrast coverage, rule-coverage ledger | open |  |  |  |
| P0.26 | P0 | Perf timing in Chromium | open |  |  |  |
| P0.27 | P0 | Artboard export: gate 0 on ubuntu, `serve-artboards.mjs`, `render-artboards.mjs` | open |  |  |  |
| P0.28 | P0 | Browser loop: `browser-loop.mjs` and the first-run probe | open |  |  | after P0.0 |
| P0.29 | P0 | Regression-matrix rows per state and helper; ledger backlog rows and stale statuses | open |  |  |  |
| P0.30 | P0 | Docs drift for RUN-ux, the Design System, the rubric and rule ids | open |  |  |  |
| P1.1 | P1 | `tokens.css` on the Design System (aliases, px type, roles, look tokens, reduced motion) | open |  |  |  |
| P1.2 | P1 | ADR-008 residue (ErrorBoundary sentence), sentinel | open |  |  | `skipped` if the approval commit carries it |
| P1.3 | P1 | Look attributes on `<html>` at first paint | open |  |  |  |
| P1.4a | P1 | Codicon sync script, path lint, attribution | open |  |  |  |
| P1.4b | P1 | Icons regenerated, Verified mark, captures re-approved | open |  |  |  |
| P1.5 | P1 | Design reference check (`check-design-tokens.mjs`) | open |  |  |  |
| P2.1a | P2 | Listbox: the grouped list's model (one listbox per view, group rows, real virtualization) | open |  |  | round 1: A |
| P2.1b | P2 | Typed row adapter | open |  |  |  |
| P2.1c | P2 | Grouped list: keyboard model and group rows | open |  |  | round 1: A |
| P2.1d | P2 | Grouped list: Installed consumers | open |  |  | round 1: A |
| P2.1e | P2 | Grouped list: transitive consumers | open |  |  | round 1: A |
| P2.1f | P2 | Grouped list: §8 hooks, ExTester helpers and harness scenarios | open |  |  | round 1: A |
| P2.2 | P2 | Row on the Extensions anatomy (72 px, two lines, 36 px icon; D46) | open |  |  | round 1: A |
| P2.3 | P2 | Button and Checkbox primitives | open |  |  |  |
| P2.4 | P2 | Select and TextField primitives | open |  |  |  |
| P2.5 | P2 | Toolbar, IconButton and Tabs (V1, V2) | open |  |  |  |
| P2.6 | P2 | SectionHeader and Badge (V3, V4) | open |  |  |  |
| P2.7 | P2 | Main shell chrome (V5) | open |  |  |  |
| P2.8a | P2 | Installed tab: single project and transitive | open |  |  |  |
| P2.8b | P2 | Installed tab: All Projects and state cells; V1–V5 hard | open |  |  |  |
| P2.9a | P2 | Native actions menu on both surfaces (`webview/context`) | open |  |  |  |
| P2.9b | P2 | Queued operations busy everywhere; menu proven on VS Code 1.90.0 | open |  |  |  |
| P2.10 | P2 | First before/after page `slice-1`: stop for the owner | open |  |  | Stop condition |
| P2.11 | P2 | Re-base; judge disposition rate; stop if > 150 % | open |  |  |  |
| P3.1a | P3 | Updates tab rebuilt on the grouped list, single project | open |  |  |  |
| P3.1b | P3 | Updates tab: All Projects and states | open |  |  |  |
| P3.2 | P3 | Browse list and quick search | open |  |  |  |
| P3.3a | P3 | PropertyList, GroupCaption, details facts | open |  |  |  |
| P3.3b | P3 | Details header, actions and split | open |  |  |  |
| P3.4 | P3 | README typography and details contrast | open |  |  |  |
| P3.5 | P3 | Dialogs and layers (scrim, Popover ruling) | open |  |  |  |
| P3.6 | P3 | Sources dialog (N82) | open |  |  |  |
| P3.7a | P3 | Sidebar sections and 22 px compact rows (D47) | open |  |  | round 1: A |
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
| P4.3 | P4 | Search ↔ list bridge and list keys | open |  |  |  |
| P4.4 | P4 | Focus management | open |  |  |  |
| P4.5 | P4 | Motion | open |  |  |  |
| P4.6 | P4 | Announcements and semantics | open |  |  |  |
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
green on the unchanged tree and records it here.

| Rule | Helper | State group | Catches | Flipped by | Status |
|---|---|---|---|---|---|
| PF-2, PF-3a, PF-3b, PF-4, PF-5, PF-6 | 1–6 | main | P9.fix-2…6 | P0.10–P0.12 | hard at P0 |
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
| DS-ROW-1, -3, -6 | 2, 4, 6 | main rows | V2 (ROW-3) | P2.2 | pending |
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
| DS-OVERFLOW-2 | 6 | headers | V3 | P2.6 | pending (vacuous on the probe) |
| DS-OVERFLOW-3 | 6 at narrow widths | toolbars, tabs / details actions | — | P2.5 / P3.3b | pending |
| DS-OVERFLOW-4 | workbench DOM | sidebar title | — | P3.7b | pending |
| DS-OVERFLOW-5 | 6 at 220 px | details split | — | P3.3b | pending |
| DS-STATE-1…4 | markers, captures | main / updates / rest | — | P2.8b / P3.1b / P3.10 | pending |
| DS-STATE-5, -6 | outcome states | rows | — | P4.7 | pending |
| DS-STATE-7 | text present | installed / details | — | P2.8a / P3.3b | pending |
| DS-FOCUS-1…4 | focus states | rows / controls / tabs | — | P2.2 / P2.3, P2.4 / P2.5 | pending |
| DS-MOTION-1, -2 | runtime check | all | — | P4.5 | pending |
| DS-COPY-1, -4 | microcopy lint | all | — | P3.11 | pending |
| DS-COPY-2 | text | details | — | P3.3a | pending |
| DS-COPY-5 | text | main / sidebar | — | P2.6 / P3.7b | pending |
| DS-DIVIDER-1 / -2 / -3 / -4 | computed borders, shadows | rows / layers / popup / main | — | P2.2 / P3.5 / P3.2 / P2.7 | pending |
| MS-8 first-row y Installed ↔ Updates | 6 | main | — | P3.1b | pending |
| a11y-focus-after-close | jsdom guard | dialogs | A6 | P4.4 | pending |
| a11y-enter-not-destructive | keyboard paths | main lists / sidebar lists | A1, A2 | P4.2a / P4.2b | pending |
| a11y-hint-truthful | text | main lists | A3 | P2.9a | pending |
| a11y-reduced-motion-both-signals | runtime check | all | A4 | P4.5 | pending |
| a11y-text-contrast-all-states | axe | README / hover | A8, A14 | P3.4 / P4.6 | pending |
| a11y-nontext-contrast | axe, offline lint | check marks | A7 | P2.3 | pending |
| a11y-first-load-announced | live region | main / Browse | A9, MB19 | P4.6 / P5.9 | pending |
| a11y-full-axe-real-page | axe | all; details `incomplete` tolerated | A5 | hard at P0.23; tolerance removed by P3.4 | hard |
| CA-R3 / CA-R4 | `wc -l` / lint | MainShell / Listbox | — | P2.7 / P2.1a | pending |

## Phase gates

Each phase boundary appends: the gate line's commands with pasted results; the `phase-review` verdict with both
advisors' answers verbatim (or the two direct PHASE REVIEW answers); the judge disposition rate; the fix rows created;
the tag `labs/ux-<phase>-done`.

## Advisor decisions

Rulings that span items, verbatim, with date and item. A ruling for one item goes into that item's handoff note.

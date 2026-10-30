# nUIget UX overhaul — Claude Code execution plan

Plan date: 2026-10-23 · Base: `origin/main` at the SHA current when `labs/ux` is cut (2.0.0 squash-merged as `7772aa2`,
unpublished; research and planning ran on `e4d6e97`; Dependabot and #30 had moved `main` to `622352d` by 2026-10-23
10:30) · Branch: `labs/ux` · Evidence base:
`docs/research/2026-10-23-ux-research.md` ("the research", ledger ids of its Appendix A).

Companion files: `docs/plans/STATUS-ux.md` (tracker), `docs/plans/RUN-ux.md` (autonomous protocol),
`docs/design/**` (Design System export, theme dumps, artboards, decisions), `docs/plans/findings-ledger.md` (ledger),
`docs/plans/regression-matrix.md`. The 2.0 plan (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`), `RUN.md` and
`STATUS.md` are history and are not edited by this initiative.

---

## 0. Context

**Starting point.** 2.0.0 is on `main` (release PR #18 squash-merged 2026-10-17 as `7772aa2`) and unpublished; the
Marketplace still serves 1.18.9. `main` has moved since only through Dependabot and the owner's CI changes (#19–#30);
Dependabot PR #31 is open and red on `Test (ubuntu-latest)` and `Test (windows-latest)`. **`labs/ux` is cut from
`origin/main` at the SHA current at landing** (`622352d` on 2026-10-23 10:30, `e4d6e97` at planning; Dependabot
moves it), and at landing the session
re-verifies P0.7's `--code_version` pin and the ExTester facts of §4 against the lockfile (A4). The owner's verdict on 2.0:
functionally complete, visually plain; paddings, margins and alignment inconsistent; nothing feels designed.

**The P9 lesson.** Every gate of the 2.0 plan counted things or checked booleans. The UI passed all of them while
looking wrong; the only visual review was the owner looking at PNGs. The P9.fix gates measured two horizontal and three
vertical quantities and none of symmetry or rhythm, and the owner then filed V2/V4/V5 on the same elements (W2). This
plan never depends on a person looking: geometry, pixel diffs and a refuted judge panel are the acceptance.

**V1–V5** (`docs/plans/findings-ledger.md` §"V1 onwards"): squeezed tab bar and bulk toolbar; Select all / Uninstall
selected misaligned; "provisional" badge over the list border; asymmetric section-header margins; no single spacing
scale. They were deferred to this initiative as the negative control of its measurement harness: P0 must report V2–V5
by measurement on the unchanged tree (V1 judge-only until a rule states it numerically) before anything fixes them;
the first vertical slice (P2) fixes them.

**Evidence base.** The research (14 Opus agents, an ExTester probe on VS Code 1.142.0 under six themes and both
workbench looks, 57 Fable refuters; 299 findings, 72 bound `DS-*` rules, 48 triage rows) is the only source of facts
this plan relies on. Rule ids: `DS-*` (Design System, `docs/design/design-system.md`), `MS-1..10` (measurement
techniques), `LST-1..6` (listing), `CA-R1..5` (component audit), `a11y-*` (accessibility), `PF-2..6` (the P9.fix
controls, defined in P0.10–P0.12).

**Release decision (owner, 2026-10-17).** Polish plus new features in one release that ships as the **2.0.0
pre-release** (the first published 2.x); 2.0.1 is the regular release afterwards. Polish is sequenced first (P0–P4),
each feature after it as its own cuttable phase (P5.x), so a re-base overrun cuts features without touching polish.
**CHANGELOG ruling:** `## [2.0.0]` counts as unreleased until publication and may be edited; the repository's
"never edit released sections" rule applies from the first publication.

**Direction.** Native-feeling polish, not novelty: the panel and the sidebar should read as built-in VS Code views
(Extensions view, Settings editor, Source Control) that happen to manage NuGet packages; nUIget's information
architecture stays. The workbench is the exemplar for every rule; where no rule decides a fork, the alternative
closest to the workbench wins. The webviews follow the host's look (Modern UI or classic). D14–D19 of the 2.0 plan
are history, not contract; §1 records what replaces each.

**Assumptions** (where the brief or the research did not settle something; each is restated where it bites):

| # | Assumption | Where it bites |
|---|---|---|
| A1 | The approval commit (planning session) lands, besides the files the brief lists: ADR-010–013 with their `docs/adr/README.md` rows and ADR-008's header amendment; interaction model v2 in place at `docs/ux/interaction-model.md` (new hooks parked in §8.1); `docs/design/export-method.md` and `docs/design/export-proof/**`; the research bundle under `docs/research/2026-10-23-ux-research/` (the 14 dimension reports, `rules-bound.json`, `ledger.json`, `critic.md`, `floor.md`, `modern-ui.md`, `css-audit-work/baseline.json` with sha256 `4417610df19a91ed2daad02bede1155638bafd7fdf6fe7a7a37bcdee6cf42823`, and `tools/png.mjs`, which `docs/design/export-proof/measure.mjs` imports; the large `verify-result.json` stays out); the ExTester probe as `docs/design/probe/zz-probe.ui.test.ts.txt`; the protocol replacement texts as `docs/plans/protocol-text/*.md` (not at the repository root, where vsce would package them and `check:vsix` would fail); the new ledger letters in `findings-ledger.md` "How to read". (`docs/ux/reference-2.0/`, the before set of the before/after pages, is written by P0.18, not by that commit.) A missing one is a stop-and-ask in the item that reads it, except the ledger letters, which P0.3 adds. | P0.2, P0.3, P0.14, P0.20, P0.27, P1.2 |
| A2 | A saved workflow called with `args` `{}` stops with its own argument error before starting an agent (true of the three scripts' headers: `design-judge` needs `item`, `states`, `runId`; `precommit-review` `range`; `phase-review` `phase`, `range`, `gateOutput`), so that error proves the name resolved. The argument shapes RUN-ux.md §4 passes are the ones the scripts' headers document. | P0.1, RUN-ux §4 |
| A12 | The approval commit adds `.claude/.test-retire` and `captures/` to `.gitignore` and un-ignores `docs/design/**/*.png`, `src/test/ui/v2/golden/**/*.png` and `resources/readme/*.png` (the existing `*.png` rule ignores them); `.vscodeignore` gains `patches/**`; `HANDOFF.md` stays out of the repository (it would fail `check:vsix`). The owner's patch is applied on `labs/ux` before the first implementing session. | P0.0, P0.2, P0.3, P0.15, P0.27, P6.2 |
| A13 | `patches/settings-and-launch.patch` gains `Bash(gh workflow run ci.yml:*)` (Tier B and macOS dispatch, the negative-control job) and `Bash(npm view:*)` (P0.4) before approval; if the applied patch lacks either, the command goes to the Auto-mode classifier and a denial stops the session. | P0.4, P0.9, P0.17, RUN-ux §6 |
| A14 | The brief's ⚑ choice for the look switch (render-time attribute or `ExtensionConfig`) is settled by ADR-011: first paint at render time (P1.3, no contract), the live update in the polish contract bundle (P4.1). The brief's P4 context menu moved to P2.9a/b: ADR-013 requires both surfaces in one item, interaction model §8.1 labels its hook "Installed slice", and research §18 asks for its runtime proof on the floor (now 1.90.0) in the first slice. | P1.3, P2.9a, P4.1 |
| A3 | The UX ADRs are ADR-010 (no layering), ADR-011 (follow the host's look; size tokens; amends ADR-008), ADR-012 (icon delivery), ADR-013 (keyboard and menus), all `proposed` until plan approval; ADR-013's Decision 7 is confirmed by D50 (round 1). | §1 |
| A4 | The capture pin is VS Code **1.140.0** (D35), not the brief's 1.142.0: ExTester 8.28.1 declares 1.138.0–1.140.0 and run 39025149785, whose PNGs the ledger's V1–V5 cite, ran 1.140.0. `code-server` 1.142.0 stays the exploratory browser instance only. At landing, and again in P0.7, the pin and §4's ExTester facts are re-checked against the lockfile (`vscode-extension-tester` version and its `supportedVersions` in `node_modules/vscode-extension-tester/package.json`); a Dependabot bump that moved the declared range moves the pin to its declared maximum in P0.7, with a note. | P0.7, P0.14, P0.17–P0.18 |
| A5 | The Unsupported fixture pins SDK **8.0.425** (the owner's machine has it; `dotnet --list-sdks`) and CI installs that exact patch; `setup-dotnet` can still download it. If the download fails, P0.7 stops and asks. | P0.6, P0.7 |
| A6 | Pushing `.github/workflows/ci.yml` to `labs/ux` works for sessions, as it did on `labs/2.0` (P0.8, P9.0); a new workflow file or a change on `main` is the owner's (memory of the Dependabot setup). | P0.7, P0.9, P7.2 |
| A7 | "Source name" in the brief's F6 is the same defect as X15 (the sidebar never shows the active source); it is fixed once, in P3.7b, and F6 (P5.8) carries Restore and Collapse/Expand all only. | P3.7b, P5.8 |
| A8 | The coverage raise touches `vitest.config.mts` only as configuration; the two places that print the old numbers (the coverage summary step of `ci.yml`, item 5 of "MANDATORY: Tests" in `.github/copilot-instructions.md`) are docs duties of the same item. Main measures 95.83 / 89.82 / 94.34 / 96.26 (statements / branches / functions / lines, CI run 39843006107). | P0.5 |
| A9 | `precommit-review` runs on every ⚑, ⚑-design and contract item and on any item whose diff exceeds 400 changed lines; `phase-review` runs at every phase boundary. | §2.9, RUN-ux §4, §6 |
| A10 | Design rounds 1 and 2 are recorded (2026-10-23): composition A (the Extensions view) decides D46–D50; round 2 decides D51, D52, D54, D55 and D56 (F2a, F1a, floor 1.90.0, the floor lane, F3a); D53 is the design-advisor's by D22. `docs/design/DECISIONS.md` holds the alternatives. | P0, P2, P3, P4, P5 |
| A11 | MB16 and MB19 are not cuttable (research triage) although the brief groups them under F9, and MB3 is the owner's pick (D56): if F9 is cut, P5.9a and the two rows of P5.9b move to P7 as pre-release items. DP10 rides with F7; if P5.4 is cut, P4.9 stops the sidebar's unused metadata request. | P5.4, P5.9a, P5.9b, P7 |

---

## 1. Decisions

D1–D19 are the 2.0 plan's. D10 is amended by D25: the floor becomes VS Code 1.90.0 (Chromium 122, Node 20.9). Rows marked **owner, round n** are the
owner's picks between complete alternatives (A10); every other row is decided by rule and recorded in
`docs/design/DECISIONS.md` (and an ADR where it binds implementation).

| # | Decision | Rationale / replaces |
|---|---|---|
| D20 | **Scope and release.** Polish plus features in one release, the 2.0.0 pre-release; 2.0.1 regular afterwards. Order: P0 harness → P1 Design System → P2 vertical slice → P3 screens → P4 interaction and accessibility → P5.1–P5.10 features (each cuttable) → P6 listing → P7 release. | Owner 2026-10-17. Features after polish so a re-base cuts features first. |
| D21 | **CHANGELOG editability.** `## [2.0.0]` is unreleased until publication and may be rewritten (P6.6); 1.x sections stay byte-identical to `main`. | Owner 2026-10-17. |
| D22 | **Exemplar rule.** The workbench (Extensions view, Settings editor, pane headers, Source Control, quick input) measured in the same ExTester session is the reference for every rule; the closest-to-the-workbench alternative wins every fork no rule decides; microcopy follows the workbench (Title Case labels, sentence-case messages, `...` for commands that open UI). | Brief §0; W1/W12: no external user signal exists, the owner's dogfooding and the workbench are the authority. **Replaces D14** (row content is a Design System rule, DS-ROW-*, no longer a decision). |
| D23 | **Follow the host's look (ADR-011).** Modern UI (`workbench.experimental.modernUI`, compiled default from 1.139) is the primary design target, classic the fallback. The host writes `data-look` (`modern`/`classic`), `data-density` (`default`/`compact`, from `window.density.layout`) and `data-uppercase-headers` (from `workbench.experimental.modernUIUppercaseViewHeaders`) on the document element (`<html>`, so portalled dialogs inherit them) in `renderWebviewHtml`: first paint is contract-free (P1.3); a live change needs `ExtensionConfig` fields and arrives with the polish contract bundle (P4.1), until then at the next render. Only the metrics that differ switch, as tokens re-valued under those attributes (pane header 22→28 px and 11/700 uppercase → 12/600 host casing, header hover tint, row radius and inset, tab strip 35→32, scrollbars 10→8, badge type 11→10, focus after a pointer press). The harness writes the keys explicitly: Modern UI on for the primary captures and goldens, one classic pass for the theme-sensitive subset. | Research §3, Appendix F; H1. Consequence: one extra Tier A pass. |
| D24 | **Token aliasing (ADR-011).** `tokens.css` aliases `--vscode-spacing-size*`, `--vscode-cornerRadius-*`, `--vscode-fontSize-*`, `--vscode-fontWeight-*`, `--vscode-codiconFontSize`, `--vscode-strokeThickness` with the classic values as literal fallbacks (load-bearing below 1.129); row heights, pane-header heights, the 1.4 line height and the 24 px pointer target stay literal; type moves from `em` to `px` (ADR-011 amends ADR-008); duration tokens go to zero under `body.vscode-reduce-motion` as under `prefers-reduced-motion`. | Research §3, §6; H6, V9, A4. |
| D25 | **VS Code floor `^1.90.0`** (D54; amends D10 and ADR-000): Electron 29, Chromium 122, Node 20.9. P0.5b moves `engines`, `@types/vscode` 1.90.0, esbuild `node20`/`chrome122`, `@types-host/node` → `npm:@types/node@20.19.43` (amended at the owner's P0-gate ratification of 2026-10-30: the 20.9 declarations fail under TypeScript 6), the E2E matrix (`1.90.0`, stable) and the CSS-baseline lint to 122 (16 of 26 entries retire), and amends ADR-000 and ADR-011's floor sentence under the sentinel. `scrollbar-color` is inside the floor, so V15 is fixed directly (P0.22). Users on VS Code 1.85–1.89 keep 1.18.9: 2.0.0 is never offered to them. | Appendix E; **owner, round 2** (D54). **Amends D10.** |
| D26 | **Component base.** Keep the hand-rolled primitives; no `@vscode-elements/elements` (+123 kB / +52 kB against 26 kB / 17 kB headroom, jsdom breakage, actions inside `treeitem`). Add six primitives (Button, Select as a native wrapper first, Checkbox, TextField, PropertyList, GroupCaption) and a typed row adapter. | Research §6; H2–H5, H7, H21, X10, V34. |
| D27 | **Icon delivery (ADR-012).** Inline SVG generated by `scripts/sync-codicons.mjs` from an exact-pinned `@vscode/codicons` release, with a lint comparing names, viewBoxes and paths; CC-BY-4.0 attribution in `LICENSE`, README and the module header; a release bump is its own item; the codicon font route (blocked today by `ALLOWED_PATTERNS`, H70) stays costed as the alternative. | Research §6; H22, H23, H75, DS-ICON-1/5. |
| D28 | **No layering (ADR-010).** A primitive or feature marked rebuild is rewritten against the Design System spec together with its tests, in place; one marked refactor has its rules replaced, never overridden by a more specific selector. Every visual value comes from `tokens.css`; no `!important`, no inline style outside `cssVars()`, no component-local magic number. Held by the lint gate (P0.20–P0.21). | Brief §3. |
| D29 | **Retiring tests.** Default: rewrite in place (the rebuilt primitive keeps `Row.tsx`, `Row.test.tsx`; the item names the titles it replaces). Exception: the `.claude/.test-retire` sentinel (P0.2) lists the exact test paths an item may delete or rename, created after a pasted design-advisor ruling, deleted before the commit; `git commit` is denied while it exists. | Brief §3; the L2 hook denies every other delete or rename. |
| D30 | **Three rule premises** the exemplar itself does not satisfy: block gaps use the 4 px ramp base (4 inside a group, 8 between groups) although the Extensions view measures 5/10; headers and toolbars keep symmetric start/end and top/bottom insets although the Extensions header pads 5/12/6/20; focus rings follow the look (classic: outline after a click too; Modern UI: keyboard only). | DS-GRID-2, DS-INSET-2, DS-FOCUS-3; research §4. |
| D31 | **Enter never writes (ADR-013).** Enter opens or selects on every list (the Extensions view's binding); Ctrl/Cmd+Enter runs a Browse row's install and an Updates row's update (on a central row it opens the CPM preview in the main panel, the actions menu in the sidebar); Delete (Cmd+Backspace) uninstalls Installed and Updates rows after a confirmation with a "Do not ask me again" check box, which needs a contributed boolean setting in `ExtensionConfig` and a write request (polish contract bundle, P4.1; if that bundle is cut the confirmation ships without the check box). Recent searches stay removed (the Extensions search box has no history, MH9). | A1, A2, X13, X14. **Replaces D16** (the 1.x features stay restored; their key bindings follow this row). |
| D32 | **Context menu (ADR-013).** `contributes.menus["webview/context"]` for `webviewId == 'nugetManager'` and `'nuiget.sidebarView'`, `when` clauses on the row's context keys, with `data-vscode-context` (incl. `webviewSection` and `preventDefaultContextMenuItems`) on the row wrapper; static Title Case titles ("Update to Latest Version"); `Listbox` stops `preventDefault` and dispatches a synthetic `contextmenu` for Shift+F10 and the ContextMenu key; the sidebar's QuickPick menu migrates in the same item; a host-level progress emitter fires `ops/progress` with status `queued` for operations the host submits (X25), no contract change; a central update from the menu confirms with the host's modal on both surfaces while the details button keeps `CentralUpdateDialog` (unifying them is X9, a contract item, P5.11); `ui/contextMenu` stays in the protocol, unsent, until the polish contract bundle removes it. The menu item proves right-click and Shift+F10 in the E2E (1.90.0) job. | X1, X12, X18, H14, A3. |
| D33 | **Visual acceptance is the harness.** DOM geometry in the real webview is the hard gate; pixel diff of the webview crop against a CI golden is informational, then a hard 0 px gate with live content masked; the `design-judge` panel is informational until D37's hardness rule holds. A session never certifies a capture by looking at it. The owner sees before/after pages twice (after P2, before the release PR) and nothing per item. | **Replaces D18** (screenshots viewed by the session) **and D19** (owner approves screenshots before the release PR). MS-1..10; H8, H13, H35, H67 (SSIM not adopted). |
| D34 | **Tolerances** (written once in `measure.ts`): 1 px for edges meant to coincide; 1 px for box centring (optical centring is judge-only); 0 px clearance for containment; same-role gaps equal within 1 px; gap membership ± 0.5 px of a scale value; workbench parity within 1 px for heights and equal computed colours; `scrollWidth ≤ clientWidth` for named text; chrome rects equal across states within 0.5 px; pixel diff starts at 0.5 % of the crop and becomes 0 mismatched px once a state's live regions are masked; axe 0 violations, `incomplete` allowed only where a rule's row names it. | Research §5; H9 (today's 8 px P9.fix-4 gate admits V2). |
| D35 | **Capture pin.** `test:ui` and the harness run `--code_version 1.140.0` (A4); `src/test/ui/settings.json` writes `"workbench.experimental.modernUI": true`, `"window.density.layout": "default"` and `"workbench.experimental.modernUIUppercaseViewHeaders": false` explicitly (ExTester spreads them over its own defaults) and `src/test/ui/settings.classic.json` writes `modernUI: false` for the classic pass; the ExTester download is cached; VS Code runs with `--extensions_dir` under the storage directory. Bumping the version is its own item (re-capture goldens, re-run both negative controls). | H10, H61, H66; export-method.md. |
| D36 | **Negative control.** The harness is accepted only when, run from HEAD against the VSIX of `80940aa` (`1784642^`), it reports the five P9.fix defects with coordinates, and against the `labs/ux` base it reports V2–V5 by measurement and nothing else at blocking severity. A selector the old tree lacks is `not measurable`, never a pass. V1 is judge-only until a numeric rule states it; DS-HEIGHT-4/6/7 are its numeric part. | Brief §4; H11. |
| D37 | **Judge hardness rule.** `design-judge` (three judges with distinct lenses, one refuter that re-crops every box; a finding stands when two judges and the refuter agree) is informational until (a) it passes the two-tree negative control (the five P9.fix defects on `80940aa`, V1–V5 on the base, V1 included) and (b) its refuted/total disposition rate over P2 is ≤ 20 %; from the first item after P2.11 records both, zero blocking findings is a hard gate. Informational means every finding is fixed or carries a pasted design-advisor ruling. | Brief §4; H35. |
| D38 | **Vulnerability and deprecation contract bundle.** G1's "unknown" state needs no contract (absent ≠ `[]`, per "Empty is not unknown"); deprecation (G3) and tri-state per-version vulnerability flags (G4; absent = unknown) are one D6 contract item (P5.0) with their dependent tests. | Research §10, §14; H16. |
| D39 | **Contract changes are bundled and small.** At most one session-day of frozen edits per D6 item, each ⚑, under the sentinel, regenerating `docs/protocol.md`, updating the `guards.ts` records and amending ADR-002/ADR-009 where a new resource kind or Catalog read appears: **P4.1 polish bundle** (the three look fields in `ExtensionConfig` for a live switch; the delete-confirmation setting and its write request; `projectPath?` on `ui/viewPackage`; the removal of the unsent `ui/contextMenu`); **P5.0 feature bundle** (D38, for features still in scope after P2.11); **P5.10a** (source-mapping visibility); **P5.11a** (one central-update confirmation, X9). | H15, H16, H42, H43; ADR-011, ADR-013. |
| D40 | **CHANGELOG audience rule.** An entry says what the user can now do or what stopped going wrong, in the user's vocabulary; a change the user cannot notice gets no entry; the test is "would someone who has never opened the repository understand it and care?". Applies to every item from P0; written into `.github/copilot-instructions.md` "CHANGELOG.md Rules" by P0.3 (with D21's editability bullet) and enforced by `scripts/check-changelog.mjs` in P6.6. | Brief §4; X6, X72. |
| D41 | **Publishing after the PAT retirement.** Global Azure DevOps PATs retire on 2026-12-01; the owner publishes with `vsce publish --azure-credential`, `--oidc` from GitHub Actions, or the Marketplace upload page. CI packages a `--pre-release` VSIX (P7.2); the release commit is tagged before publishing and listing images are pinned to that tag. Sessions never publish. | H56, W4, H51, H63; extends D9. |
| D42 | **Coverage floor** 65/50/55/65 → 90/80/85/90 (statements/branches/functions/lines) in `vitest.config.mts`; the `src/webview/**` ratchet is untouched. | Owner, queued 2026-10-18 (A8). |
| D43 | **Dependency policy.** Dependabot keeps ignoring the majors pinned on purpose (`typescript` ≥ 7 while `typescript-eslint` caps < 6.1, `@types/node` > 24, `msw` ≥ 3 while `@vitest/mocker` declares an MSW 2 peer), written as named rules after each constraint is re-checked; sessions never merge or close a pull request; a red Dependabot PR is adjudicated by an item and closed or merged by the owner. | Brief §4; H7. |
| D44 | **Owner-only settings files.** `.claude/settings.json`, `.claude/settings.local.json`, `.claude/launch.json` and `.mcp.json` are never edited by a session; the guard denies it (P0.2) and the session hands the owner a patch with the exact apply command. One bundled patch at plan approval (P0.0). | Brief §4. |
| D45 | **Saved workflows only.** `design-judge`, `precommit-review` and `phase-review` (`.claude/workflows/`, committed with the plan) are the only multi-agent steps; the owner opted in to sessions running exactly these by name without asking; sessions never author an ad-hoc workflow; ultracode stays off in implementing sessions. | Brief §5. |
| D46 | **Comfortable row anatomy** (D-A): the Extensions row: 72 px, a 36 px icon, two lines (name + badges / version · authors), the row actions inside the hover, selection and focus band. The 78 px three-line card of D15 (as amended at P9.fix-3) is retired. | **Owner, round 1 (2026-10-23): composition A.** **Replaces D15.** |
| D47 | **Compact row height** (D-B): 22 px, the height of native rows and classic pane headers; the 24 px pointer target is kept by spacing, not by the row (DS-HEIGHT-2, DS-HEIGHT-8). | **Owner, round 1: A.** |
| D48 | **List model per view** (D-C): one grouped list per view (sections and projects are group rows of one listbox: one tab stop, one scroller, keys cross groups, real virtualization); the per-section lists of 2.0 are retired. Cost +7 planned days in the research; built by P2.1a and P2.1c–P2.1f, consumed by P3.1 and P3.7c–P3.7d. | **Owner, round 1: A.** |
| D49 | **Enter in the sidebar** (D-D): Enter opens the main panel on the row (its own tab and row, through `projectPath?` on `ui/viewPackage` from P4.1; this is F8's mechanism, so F8 folds into P4.2b); writes move to Ctrl/Cmd+Enter, Delete and the menu (D31). | **Owner, round 1: A.** |
| D50 | **Success feedback** (D-E): in place. A single success raises no toast (row state, button label, live region, status bar while running); warnings, failures and bulk summaries keep their toasts. ADR-013 Decision 7 stands. | **Owner, round 1: A.** **Replaces D17.** |
| D51 | **Disabled text buttons** (D-G): opacity 0.4, the workbench's text button (F2a). DS-COLOR-6 is rebound: opacity for text buttons, `disabledForeground` for action labels and icon buttons. | **Owner, round 2 (2026-10-23): F2a.** V38. |
| D52 | **Row check mark** (D-H): the 18 px workbench check box in the `checkbox.*` roles, plus `checkbox.selectBackground` and `checkbox.selectBorder` on a selected row (the tree view's rule); two new colour roles in `tokens.css` (P1.1). | **Owner, round 2: F1a.** V18, A7, DS-HEIGHT-9. |
| D53 | **Compact density** (DS-DENSITY-2): follow the host, i.e. `window.density.layout: compact` under Modern UI re-values the density tokens (P1.1, P1.3). | **Design-advisor by D22** (not an owner pick). |
| D54 | **Floor** (D-F): raise to VS Code 1.90.0 (Electron 29, Chromium 122, Node 20.9), recorded as D25. Consequences: users below 1.90 stay on 1.18.9; the `main` ruleset's required check `E2E (1.85.0)` disappears and must become `E2E (1.90.0)` before the release PR can merge (owner action, P7.5). | **Owner, round 2 (2026-10-23): 1.90.0.** |
| D55 | **N64** (no CI job renders the floor's Chromium): closed by a Tier B lane at `--code_version 1.90.0` (P0.9). ExTester 8.28.1 runs any VS Code from 1.90 (ChromeDriver floor 115), so the floor's Chromium 122 is rendered and measured; `webview-css-baseline.test.ts` stays the per-push guard. Removed from the backlog. | **Owner, round 2** (follows D54). |
| D56 | **MB3** (Browse shows a skeleton until every result is enriched): rows first under a 2 px progress bar, enrichment after (F3a). The bare-row `found` chunk on `search/query` is a contract change in the P5.0 bundle; P5.9a implements it; the owner opened the `docs/perf-baseline.md` P7.2d rule ahead of its trigger. MB3, X23 and X34 close there; not cut with F9. | **Owner, round 2 (2026-10-23): F3a.** |
| D57 | **Item IDs outside this plan.** Item IDs repeat the 2.0 plan's shape (`P2.3`); in commit messages, ledger rows and `STATUS.md` notes they are written `UX-P2.3`. Tags are `labs/ux-<phase>-done`. | `git log --grep 'UX-P2.3'` is unique. |

---

## 2. Execution model for Opus 5.5 + Fable advisor

The 2.0 plan's §2 carries over in substance; this section restates it in full because `RUN-ux.md` §4 says "follow
§2.2 literally".

### 2.1 Unit of work

One work item = ≤ 1 session-day, one green commit (or a short series citing the same item), each stating inputs,
outputs, a gate command with its expected result and stop-and-ask triggers. ⚑ = consult the `architecture-advisor`
before writing code; ⚑-design = consult the `design-advisor` before writing code.

**"The item's files"** = the sources it names + their `*.test.ts(x)` + their `__fixtures__/**` + the item's
handoff note (§2.5) + `CHANGELOG.md` `[Unreleased]` + the ARCHITECTURE.md `## 2.0 Architecture` section +
`docs/plans/STATUS-ux.md` + any config file the item names + for UI items: the entries of `src/test/ui/v2/states.ts`
and `src/test/ui/v2/measure.ts` for its states, its goldens under `src/test/ui/v2/golden/`, its ARIA snapshots under
`src/test/ui/v2/aria/`, its rows of `docs/plans/regression-matrix.md`, the sections of `docs/ux/interaction-model.md`
its behaviour changes (and the §8.1 rows of the hooks it renders), `docs/plans/judge-log/<item>.json`, and the removal (never the addition) of its entries in
`src/test/lint/__fixtures__/css-audit-baseline.json`. An item never edits `docs/design/artboards/**`,
`docs/design/judge-rubric.md` or `docs/design/design-system.md` (rule text changes are a design-advisor ruling and a
separate commit that cites it). Anything else is a stop-and-ask. Tests the item names by title may be rewritten
without asking; the STATUS note lists each.

### 2.2 Session ritual (fixed order)

1. **Bootstrap:** `node --version && npm --version && dotnet --list-sdks && gh --version` → v24.x / 11.x / a 10.0.x SDK
   (8.0.425 also listed from P0.7 on, for local runs of the Unsupported fixture) / 2.x; then `code-server --version`
   → `1.142.0` (informational: needed only for the optional browser pass; a failure is noted, never a stop unless the
   next item is P0.28). Missing Node, npm, a 10.0.x SDK or gh → stop and report; never download a toolchain.
2. **Orient:** `git status --short`, `git log --oneline -8`, the item's row in this plan, the item's handoff note (§2.5)
   (verify every claim with `ls`/`grep`; a note without a commit SHA and pasted gate output is invalid).
3. **Baseline gates before editing:** `npx tsc --noEmit` → 0; `npm run check-types` → 0; `npx eslint src` → 0
   errors, 0 warnings; `npx vitest run` → green. Red before you touched anything → stop and ask (a resumed
   `in-progress` item runs these on its own changes; RUN-ux §3).
4. **Do the item** within the item's files.
5. **Gates after editing**, in order: `npx tsc --noEmit` · `npm run check-types` · `npx eslint src` · targeted
   `npx vitest run --project backend <dir>` or `npx vitest run --project frontend <dir>` · (core/cli or code that runs `dotnet`)
   `DOTNET_ROOT="$(dirname "$(command -v dotnet)")" NUIGET_SDK_TESTS=1 npx vitest run --project backend <dir>` ·
   `npm test` · `npm run bench` · (host, core, esbuild or a webview) `node esbuild.mjs --production --analyze` (paste the
   three sizes) and `npm run package:vsix` · (protocol) `npm run docs:protocol:check` · (docs) `npm run docs:check` ·
   `npm run check:matrix` · (packaging) `npm run check:vsix` · **(UI items) the UI gate §2.8**. A gate command that
   triggers a permission prompt is run anyway and the prompt noted; never substitute a different command.
6. **Docs duties:** CHANGELOG `## [Unreleased]` under D40 (Added: `**Headline** — text`; Fixed/Changed: headline
   only); ARCHITECTURE.md only under `## 2.0 Architecture`; the copilot-instructions gotcha table for new footguns;
   the `.claude/` mirror when a `.github/` resource changes; `docs/ux/interaction-model.md` for changed behaviour
   (version 2 describes the target: a section the item makes true stays, a section it changes is edited); **every
   hook the item starts rendering moves from §8.1 ("Hooks added by the UX plan (not yet rendered)", rows that start
   with a phase label so `interaction-model-testids.test.ts` skips them) into the §8 tables, hook first, in the same
   change**; the gotcha rows ADR-013 names ("Central row without the preview", "Context menu under All Projects", "An
   operation that waits in the queue has no `ops/progress`", "Buttons inside `role="option"`") with the item that
   changes their behaviour. A gotcha row that backticks a path lands only once the path exists (`npm run docs:check`).
7. **Handoff note:** rewrite the item's handoff note (§2.5) with the §2.5 template.
8. **Commit** with the `git-commit` skill; the body cites `UX-<item>`, finding, rule and ADR IDs
   (`feat(webview/primitives): Toolbar end slot and symmetric insets (UX-P2.5, V2, V41, DS-INSET-2)`). Never commit
   red; never end a turn with untracked source files (commit green, leave the item `in-progress` with a valid note, or
   mark it `blocked` with its work in a WIP patch: RUN-ux §4).
9. **Report:** every gate run with its result; every gate skipped with the reason.

### 2.3 Advisor mechanism

`/advisor` only sets the advisor model; the consultation is a tool the main model calls at its discretion, sees the
transcript but has no file access, and its reply is not readable by the owner. Therefore:

| Layer | Mechanism | Used for |
|---|---|---|
| **L1 Explicit consultation (relied on)** | Two read-only Fable subagents: `architecture-advisor` (`.claude/agents/architecture-advisor.md`, mirror `.github/agents/`) and `design-advisor` (`.claude/agents/design-advisor.md`, frontmatter `tools: Read, Grep, Glob, Bash`, `model: fable`; body: read `.github/agents/design-advisor.agent.md`; Bash for inspection only). Invoked with the §2.4 brief; the answer is pasted verbatim into the item's handoff note (§2.5) before work continues; run in the background (a consultation can exceed ten minutes). Neither reads outside the repository: briefs paste the excerpts they rely on; captures are cited under `captures/<run-id>/`. | ⚑ items (architecture), ⚑-design items (design), every stop-and-ask trigger, every phase boundary (both). |
| **L2 Hard guardrails** | `scripts/hooks/guard.mjs` (PreToolUse): edits of `src/protocol/**`, `src/core/contracts.ts`, `docs/adr/**` denied unless `.claude/.contract-change` exists (D6); edits of the four owner-only settings files always denied (D44, from P0.2); delete or rename of `*.test.ts(x)` denied unless the exact path is a line of `.claude/.test-retire` (D29, from P0.2); `.only(`/`.skip(` added to a test source denied; `git commit --no-verify`, `git push --force` denied; `git commit` denied while either sentinel exists; shell writes to the settings files and `git apply`/`patch` of a patch touching them denied; `gh api` other than GET denied (all from P0.2). | Expensive wrong calls become "cannot". Known hole: a shell redirect can still write a frozen contract path; RUN-ux §4 forbids it. |
| **L3 Ambient advisor** | `/advisor claude-fable-5-1` persisted in `~/.claude/settings.json`; `CLAUDE.md` says consult it before substantive work, when an error recurs, before declaring an item done, before weakening any test. | What nobody anticipated. Never relied on for a specific moment. |

**Universal stop-and-ask triggers:** a contract/ADR mismatch; a failing test you did not write; any wish to delete,
skip or weaken a test not named by the item; a type error outside the item's files; CLI/SDK behaviour differing from
the tracked probe fixtures; a `STATUS.md` claim contradicted by the tree; the gate still red after two fix attempts;
any change to `package.json` `contributes`; any temptation to stub a missing module so `tsc` passes; a bundle that
would cross its ceiling (paste the delta and the metafile's top inputs).

**Design stop-and-ask triggers** (each decidable from output; consult the `design-advisor`):
1. A self-regression diff above tolerance, or a red measurement, that the implementer would resolve by changing the
   test, the tolerance or the golden instead of the CSS.
2. Any token added, renamed or re-valued in `tokens.css` (outside P1.1, which is ⚑-design for exactly this).
3. Any lint hit the implementer wants added to `css-audit-baseline.json`.
4. Any `design-judge` finding the item will not fix.
5. Any diff to an exported `*Props` type under `src/webview/shared/primitives/`.
6. A rule id of `docs/design/design-system.md` that the item's named states exercise but no helper in
   `src/test/ui/v2/measure.ts` asserts (`node scripts/check-rule-coverage.mjs --states <list>` prints it, P0.13).

**Consultation budget.** `design-judge` runs on every UI item; the design-advisor on ⚑-design items, on any judge
finding the item will not fix, on a measurement the implementer would resolve by changing the test, and at every
phase gate (where it also computes the judge's disposition rate); the architecture-advisor on ⚑ and contract items;
both review each phase. Fable quota: a saved workflow run stays ≤ 25 Fable agents; a panel that would exceed it is
split by state, never by dropping the refuter.

### 2.4 Advisor brief template

```text
ITEM: <UX-P#.# title>          GATE STATUS: <tsc/eslint/vitest/UI-job results>
OBSERVED: <one paragraph; exact error text or behaviour>
FILES: <path:line ranges read, with the excerpts the advisor needs pasted>
CONTRACT/ADR/DECISION IN PLAY: <ids and the sentence that seems violated>
OPTIONS I SEE: 1) … 2) … (do not pick)
QUESTION: <one sentence>
--- design-advisor only ---
RULES: <DS-/MS-/a11y- ids>
ARTBOARD: <docs/design/artboards/<state>.<theme>.<width>.png and <state>.spec.json>
CAPTURES: <captures/<run-id>/…/<state>.png, with sha256>
MEASUREMENTS: <pasted [measure] lines>
JUDGE: <pasted design-judge JSON>
```

The design-advisor opens the PNGs with Read and answers in the same shape with a `DEFECTS:` list (file,
coordinates, rule id). An answer `OWNER MUST DECIDE` marks the item `blocked` and stops the session.

### 2.5 Handoff note template (rewritten at every handoff)

**Where the note lives.** An item whose source changes sit in one directory writes that directory's `STATUS.md`
(tests, the tracker, docs and the UI files of §2.1 do not count). A repository-level item (configuration, `.github/`,
`scripts/`, root files) or one whose source changes span directories writes `docs/plans/handoff/<ITEM>.md` with the
same template, and the tracker's Notes cell names that path. Never `.github/STATUS.md`: a later item would overwrite
the note.

```text
# STATUS — <dir or ITEM>   commit <sha>   <ISO timestamp>
git status --short <dir>: <paste or "clean">
## Verified by running
<command> → <pasted summary line>   (one per gate; "SKIPPED: <reason>" must be literal)
## Visual evidence (UI items)        run <id>, captures/<run-id>/ (sha256 per PNG)
[measure] … (hard and flipped rules)   [diff] … (per state, with the reason when above tolerance)
design-judge: <JSON>; dispositions in docs/plans/judge-log/<item>.json
## Done (tested)        ## Done (untested)        ## Not started
## Deviations from contract/ADR/decision (file:line each)
## Advisor decisions (date, item, question, answer verbatim)
## Exact next step (one item ID)
```

`commit <sha>` is the commit the note was written on; the closing SHA is in the tracker's Commit column.

### 2.6 Fixture and evidence policy

No decision may cite a gitignored artefact, with one exception: a CI capture downloaded into `captures/<run-id>/`
inside the repository (gitignored, excluded from the VSIX), cited by run id and sha256. Fixtures are tracked and
redacted; the dense workspace (P0.6) is static and never restored or mutated at runtime by a capture test; operation
states use the e2e workspace's suites, which restore their project. Local captures (macOS, DPR 2) never update a
golden and are never pixel evidence. A browser-pane screenshot never certifies anything (P0.28). SDK-dependent tests
run behind `NUIGET_SDK_TESTS=1`.

### 2.7 The `hard`/`pending` flip rule

Every measurement rule in `src/test/ui/v2/measure.ts` has, per state group, a status: `hard` (asserted; red fails CI)
or `pending: <item>` (executed, printed as `[measure] <name>: <value> (pending <item>)`, never asserted; a `hard`
rule prints `[measure] <name>: <value> (hard)`). `<name>` is `<rule>@<state>`, or `<rule>@<state>/<element group>`
where Appendix B names an element group. One format, one printing command: `npm run test:ui` prints the pending list
at its end (from P0.8 it runs the capture suite last). A rule today's tree does not satisfy lands as `pending` with the item that
will satisfy it (Appendix B, and the tracker's "Pending measurement rules" table). **Only that item flips it**, in the
commit that makes it green; flipping in any other item, or changing a tolerance to flip, is design trigger 1. A rule
that turns red after it is `hard` is a regression of the item that touched it.

### 2.8 The UI gate (cited as **G-UI** in item rows)

For an item that changes `src/webview/**`, `src/host/**` rendering or a capture state, after CI is green. During P0
a step applies only once the item that provides its tool is `done`; before that the handoff note writes the step as
`SKIPPED: <tool> lands in <item>`: step 1's `check-css-baseline.mjs` P0.21 (the lint tests themselves from P0.20);
step 2's registry P0.10 and helper 8 P0.13; step 3 P0.15; step 4 P0.19 (or the fallback of §2.9); step 5's axe and
ARIA snapshots P0.23, keyboard paths and reduced motion P0.24; step 6 P0.8.

1. **Lint gate:** `npx vitest run --project backend src/test/lint` → green (no hit outside the baseline);
   `node scripts/check-css-baseline.mjs --item <ID>` → `0 entries` for a screen or primitive item (P0.21).
2. **Measurements:** the UI job green; the item's `pending` rules flipped (`grep -c 'pending <ID>)'` on the run's
   `ui-output.txt` → 0); spec conformance (helper 8) `hard` for every touched state with a `<state>.spec.json`.
3. **Self-regression diff:** every touched state's `[diff]` within tolerance, or the STATUS note says why the state
   changed and the golden is updated in the same commit from `captures/<run-id>/` (CI-to-CI only).
4. **Judge:** `design-judge` output pasted; **zero `incomplete` states** (a state with a missing judge, a missing
   verdict or a sha256 mismatch is re-run, never clean) and zero blocking findings under `standing` (hard from D37's
   date); before that date every standing finding is fixed or carries a pasted design-advisor ruling; `singleJudge`
   findings are informational; `docs/plans/judge-log/<item>.json` written in the format of `judge-rubric.md` §9. With
   the §2.9 fallback the same rules apply to the design-advisor's answer, recorded as a fallback panel.
5. **Accessibility:** `[axe]` 0 violations per touched state (full ruleset, every layer open); the keyboard path of
   interaction model §5 for the screen walked by ExTester (`[keys]` lines: tab order, a visible focus ring at every
   stop, Escape and arrows as specified); the ARIA snapshot per state equal to `src/test/ui/v2/aria/<state>.json` or
   updated with a design-advisor ruling; the reduced-motion runtime check (P0.24) green for the touched states (every
   capture runs with `workbench.reduceMotion: on`, ExTester's default; a motion capture unsets it, from P4.5).
6. **Captures:** Tier A PNGs of every touched state in the artifact (Tier B and the macOS job at the phase gate).

### 2.9 Saved workflows

Invoked by name with the `Workflow` tool and `args` (A2); never authored ad hoc (D45). `design-judge`: G-UI step 4,
P0.19, P6.5. `precommit-review`: before the commit of every ⚑, ⚑-design and contract item and of any item over 400
changed lines (A9), counted by `git diff --cached --shortstat -- . ':(exclude)*.md' ':(exclude)docs/*'
':(exclude)*.draft'` (handoff notes, the tracker, docs and deleted drafts do not count); its blocking findings are
fixed before committing or ruled on by the advisor the item names.
`phase-review`: at every phase boundary; it runs both advisors as subagents (`agentType` `architecture-advisor` and
`design-advisor`) and one refuter, and returns `verdict` (`PASS`, `PASS WITH FIXES`, `FAIL`, `INCOMPLETE`), `blocking`,
the advisors' verbatim answers and `judgeDispositionRate`; the session pastes both answers verbatim under the tracker's
`## Phase gates` and turns each `blocking` entry into a `<phase>.fix-n` row; `INCOMPLETE` is re-run, never a pass.
P0.1 records whether the tool resolves these names in an Opus session with ultracode off.

**Fallback when the `Workflow` tool is absent or a name does not resolve.** The session records it in the tracker and
continues; it never stops for it. `precommit-review` becomes one `architecture-advisor` consultation with
`git diff --cached` pasted and its three lenses as the question (correctness against the item row and the rules, test
integrity, documentation duties). `design-judge` becomes one `design-advisor` consultation per batch of at most six
states, with the capture, artboard and spec paths and the rubric, answering in the judge's JSON shape; the judge log
records the panel as `fallback`, and D37's hardness date is never set on fallback results. `phase-review` becomes both
advisors launched directly with the `PHASE REVIEW` brief. The report's owner line names the missing tool once.

### 2.10 Resuming an item

A session may end its turn mid-item. The next session (or a "continue" message) resumes a row marked `in-progress`
instead of refusing a dirty tree: it verifies the item's handoff note against the tree, runs the baseline gates on
the tree as it is, and continues the item. A dirty tree with no `in-progress` row, or changes outside the item's files,
is a stop.

### 2.11 Owner routine

New session on the repository folder (worktree unchecked), Opus 5.5, permission mode Auto, ultracode **off**,
`/advisor claude-fable-5-1` persisted; effort **xhigh** while the next open item is a P0 row (the harness phase),
**High** otherwise. Paste:

```text
Read docs/plans/RUN-ux.md and follow it exactly until a stop condition is reached.
```

When it stops, read the last line of its report and act only if it names an action.

---

## 3. Branch model

- **One long-lived branch `labs/ux`**, created from `origin/main` after plan approval by the planning session
  (`git switch -c labs/ux origin/main && git push -u origin labs/ux`), never from `labs/2.0` (a branch cut from
  `labs/2.0` makes the release PR show every 2.0 commit again, `docs/release-checklist.md` §1).
- Every session merges `origin/main` into `labs/ux` at its start (RUN-ux §2); conflicts are resolved and verified
  by the full gate list before any item. Dependabot keeps moving `main` (D43).
- CI runs on every push to `labs/**`. Never push to `main`, never merge a pull request, never enable auto-merge,
  never `--force`, `--admin` or `--no-verify`. The only pull request is the release PR `labs/ux` → `main` (P7.5),
  which the owner squash-merges. Phase tags `labs/ux-<phase>-done`.
- **Settings patch rule (D44):** sessions never edit `.claude/settings.json`, `.claude/settings.local.json`,
  `.claude/launch.json` or `.mcp.json`; they write a unified diff under `patches/` (excluded from the VSIX) and hand the
  owner the one apply command (`git -C ~/github/nuiget apply patches/<name>.patch`); the next session commits the
  applied files as an owner-action row. P0.2 freezes the four paths in `guard.mjs`. Every new gate runs as
  `node scripts/<name>.mjs` (pre-approved by `Bash(node scripts/*)`) or an `npm run` script; `npx pixelmatch`, `curl`,
  `lsof` and `python3` go through a `scripts/` wrapper; `npx extest`, `shasum -a 256`, `gh workflow run ci.yml` (the
  Tier B, macOS and negative-control dispatches) and `npm view` (P0.4) are allowed by the owner's patch
  (`Bash(gh workflow run ci.yml:*)`, `Bash(npm view:*)`), and the harness still drives ExTester through
  `scripts/ui-harness.mjs`.

---

## 4. Environment

| Item | Value (verified 2026-10-22/23) | Verify |
|---|---|---|
| Node / npm | 24.21.0 / 11.19.0 under `~/github/Tools`, PATH from `~/.zprofile` | `node --version` |
| .NET SDK | 10.0.401 and 8.0.425 | `dotnet --list-sdks` |
| GitHub CLI | 2.102.0 | `gh --version` |
| `code-server` | 1.142.0 (commit 6d62b1d5), `~/github/Tools/vscode-server/unpacked/vscode-server-darwin-arm64-web/bin`, `~/.zprofile` line 6; exploratory only | `code-server --version` |
| ExTester | `vscode-extension-tester` 8.28.1: declares VS Code 1.138.0–1.140.0, runs any release from 1.90 with a warning, refuses 1.85 (ChromeDriver floor 115); `--code_version max` resolved to 1.140.0 while stable was 1.143.x and floats with Dependabot; injects `workbench.experimental.modernUI: false`, `workbench.enableExperiments: false`, `workbench.reduceMotion: 'on'` and `--disable-experiments`, with `--code_settings` merged on top; launches VS Code without `--extensions-dir` (writes `~/.vscode/argv.json`); `extest setup-and-run` always packages the working tree, the split commands (`get-vscode`, `get-chromedriver`, `install-vsix -f <vsix>`, `run-tests`) do not | `node_modules/vscode-extension-tester/package.json:59-61`, `out/util/codeUtil.js:196-203`, `out/browser.js:182` |
| Captures | CI (ubuntu-latest = 26.04 since 2026-10-22, xvfb, window 1280×900, never set by the suite) is DPR 1; local macOS is DPR 2; `VSBrowser.takeScreenshot` returns the whole window, crop with the outer `iframe.webview` rect; 13 of 15 states 0 px between runs, the rest live nuget.org content, the caret and toasts | H26, H27, H76–H78 |
| Bundle ceilings | `esbuild.mjs`: extension 297,018 / 322,502 (25,484 left), webview 551,394 / 577,766 (26,372), sidebar 333,913 / 351,245 (17,332) at the CI build of `e4d6e97`; `react-dom` is 38 % / 63 % of the webviews | `node esbuild.mjs --production --analyze` |
| Theme dumps | `docs/design/themes/<theme>.css` for Dark Modern, Light Modern, Dark High Contrast, Light High Contrast, Dark 2026, Light 2026, from the planning probe (1.142.0, classic, macOS); P0.14 regenerates them on CI at 1.140.0 in both looks | file header |
| Artboard export | Proven locally (`docs/design/export-method.md`): ExTester opens "Browser: Open Integrated Browser", ChromeDriver lists the page as a second window handle, CDP `Emulation.setDeviceMetricsOverride` sets width and DPR 1, `Page.captureScreenshot` `clip` captures; 5–6 s per run; unverified on Linux | P0.27 gate 0 |
| Coverage on `main` | 95.83 / 89.82 / 94.34 / 96.26 (statements / branches / functions / lines) | CI run 39843006107 |
| Required checks on `main` | Lint, Test (ubuntu/windows), E2E (1.85.0/stable), UI, Build & Package; with P0.5b the job is `E2E (1.90.0)`, so the owner replaces the required check before the release PR merges (D54) | ruleset; memory of the Dependabot setup |
| Floor (D25, D54) | VS Code 1.90.0 (2024-06-03): Electron 29, Chromium 122, Node 20.9; 1.89 is Chromium 120 / Node 18.18; hosts 1.85–1.89 stay on 1.18.9; ExTester renders the floor (any release from 1.90, ChromeDriver floor 115) in P0.9's `ui-floor` lane, classic look only | research Appendix E |
| Advisor | `/advisor claude-fable-5-1` persisted; both subagents `model: fable` | `/advisor` |

---

## 5. Phases and work items

Legend: **Gate** = command → expected result. **Ask** = item-specific triggers (the universal and design triggers of
§2.3 always apply). ⚑ = architecture-advisor before code; ⚑-design = design-advisor before code. **G-UI** = §2.8.
Estimates in session-days, in parentheses; "UI" marks items costed at the UI rate (§7).

### P0 — Design-measurement harness (≈ 24.5 d) · hard gate: no P1+ item starts before the P0 gate holds

**P0 ordering rule.** P0.0 is the owner's patch; the first session after it is applied commits it (row text). Sessions
run P0.1, then **P0.3 before P0.2** (`CLAUDE.md`'s 2.0 section loads as overriding instructions until P0.3 replaces
it), then P0.4 → P0.12, **P0.27a** (artboard A: P0.13 and P0.19 need its PNGs and spec), P0.13 → P0.27, P0.29 and P0.30;
the tracker lists the rows in this order. P0.28 runs as soon as P0.0 is `done` (at the latest
before the P0 gate); until then its Notes `after P0.0` let sessions pass over it without blocking later rows. If P0.1
records that the `Workflow` tool does not resolve, the session continues with the fallback of §2.9.

| ID | Item | Inputs → Outputs | Gate | Ask |
|---|---|---|---|---|
| P0.0 | **Owner action: the bundled settings patch** (D44; `patches/README.md`). The owner applies `patches/settings-and-launch.patch` on `labs/ux` (`git -C ~/github/nuiget apply patches/settings-and-launch.patch`): the allow rules in `.claude/settings.json` (`code-server`, the browser pane, `npx extest`, `npm run check:*`, `gh api`, `shasum -a 256`, `git worktree add`/`list`, `gh workflow run ci.yml`, `npm view`) and a new `.claude/launch.json` (`nuiget-web`). The first session that finds exactly these two files changed (RUN-ux §1) commits them together with this tracker row (`done`, its Notes) and nothing else: `git add .claude/settings.json .claude/launch.json docs/plans/STATUS-ux.md`, commit `chore(claude): apply the owner's settings patch (UX-P0.0)`. Until then no `git stash`, `git reset` or `git checkout -- .` runs (they would revert the owner's change). | patch → `.claude/settings.json`, `.claude/launch.json` | `git show --stat HEAD` lists `.claude/settings.json`, `.claude/launch.json` and `docs/plans/STATUS-ux.md` only; `grep -c 'code-server' .claude/settings.json` ≥ 1; `grep -c 'gh workflow run' .claude/settings.json` ≥ 1 | — (owner) |
| P0.1 | **Workflow-by-name probe** (D45, A2). In this session (Opus, ultracode off) call the `Workflow` tool by name `design-judge`, then `precommit-review`, then `phase-review`, each with `args` `{}`: a script that resolves answers with its own argument error (`design-judge: args.item (plan item id) is required`, `precommit-review: args.range is required …`, `phase-review: args.phase is required`) without starting an agent. Record per name `resolves` or `does not resolve: <exact error>`, and any permission prompt with its rule text. (0.25 d) | — → tracker Notes | three results recorded in the row | A name does not resolve or the tool is absent: close the row with the result and continue with the direct-advisor fallback of §2.9 for every pre-commit, judge and phase-review step; the session never stops for it, and its report names the missing tool once on the owner line |
| P0.2 | **Hook: owner-only settings, the test-retire sentinel, read-only `gh api`, the advisors' text** (D29, D44; ADR-010; `scripts/hooks/guard.mjs.draft`, `scripts/hooks/guard.test.mjs.draft`, `docs/plans/protocol-text/guard-consult.md`; runs after P0.3). The drafts replace `guard.mjs` and `guard.test.mjs` (then the `.draft` files are removed): `OWNER_SETTINGS` with its own predicate (not `isFrozen`, which the contract sentinel unlocks) denying Edit/Write of `.claude/settings.json`, `.claude/settings.local.json`, `.claude/launch.json`, `.mcp.json`, shell writes to them, and `git apply`/`patch` without `--check` whose headers touch them (`git add`/`git commit` of the owner's change stay allowed); `.claude/.test-retire` (`rm`/`mv`/`unlink`/`git rm`/`git mv` of a `*.test.ts(x)` only for paths listed in it; `git commit` denied while it exists); `gh api` denied for any method but GET, for `-f`/`-F`/`--field` without `-X GET`, and for `--input`; the `CONSULT` text and first line per the draft. The draft renames two test titles, which this row names as rewrites: "names the consultation that is required" (now "…, with both advisors") and "…while the sentinel exists" (now "…while the contract sentinel exists"). Until this row lands `gh api` is not read-only by permission: RUN-ux §4 forbids non-GET use. The gotcha rows "Settings files are frozen" and "Test retirement" (`copilot-instructions.rows.md` §4, §5), the first with its "stop" replaced by RUN-ux §4's rule: write the patch to `patches/<name>.patch`, add an owner-action row naming the apply command, and continue with work that does not need it. ARCHITECTURE.md's "Repository Assistance Resources" paragraph on the guard (named here, outside the 2.0 section) describes the new denials. `.gitignore` lists `.claude/.test-retire` from the approval commit (A12; verify). (0.5 d) | guard.mjs, guard.test.mjs, copilot-instructions, ARCHITECTURE.md | `node --test scripts/hooks` green (the draft's cases incl. each settings path with and without `.claude/.contract-change`, a listed and an unlisted test path, commit with the sentinel, non-GET `gh api`); `npm run docs:check` → 0; `grep -c 'test-retire' .gitignore` → 1 | — |
| P0.3 | **Protocol replacement** (brief §5; `docs/plans/protocol-text/*.md`). `CLAUDE.md`: "## 2.0 execution protocol" to the end → "## UX execution protocol" (`CLAUDE.md.section.md`); `.github/copilot-instructions.md`: the "2.0 plan in progress" bullet (line 25 at `e4d6e97`) → "UX plan in progress", the rows "Frozen contracts" and "Missing neighbour module" (line 148) replaced, the two "CHANGELOG.md Rules" bullets (D21, D40) — `copilot-instructions.rows.md` §1–§3, §7, §8 (§6, the pending-measurement row, lands with P0.10); the `description` of `.claude/agents/architecture-advisor.md` and `.github/agents/architecture-advisor.agent.md` (`advisor-descriptions.md`) and the latter's body ("nUIget 2.0 execution plan", "D1 to D13", `docs/plans/STATUS.md` at line 38) naming both plans, this plan's decision table and `docs/plans/STATUS-ux.md`; `.vscodeignore` gains `captures/**` if absent (`.gitignore` has `captures/` from the approval commit, A12); `findings-ledger.md` "How to read" per `ledger-how-to-read.md` if the approval commit lacks it (A1). A kept historical reference carries `(history)`. (0.5 d) | — → 7 files | `grep -rn -e 'RUN.md' -e 'labs/2.0' -e 'docs/plans/STATUS.md' CLAUDE.md .github/copilot-instructions.md scripts/hooks/guard.mjs .claude/agents` → every listed line contains `(history)` (or nothing is listed); `grep -n -e 'D1 to D13' -e 'docs/plans/STATUS.md' .github/agents/architecture-advisor.agent.md` → empty; `npm run docs:check` → 0; `node --test scripts/hooks` green | — |
| P0.4 | **Dependency policy** (D43). Re-check each constraint (`npm view typescript-eslint peerDependencies`, `npm view @vitest/mocker peerDependencies`, Node 24 vs `@types/node`); `.github/dependabot.yml` gains named `ignore` rules for `typescript` ≥ 7, `@types/node` > 24, `msw` ≥ 3 beside the blanket major rule, each with its constraint as a comment, and an ignore of `@vscode/codicons` (every version: a bump is its own item, ADR-012); adjudicate every open Dependabot PR (today #31, red on Test): reproduce the bump on `labs/ux`, record the cause; a bump that a call-site fix makes green lands here with the fix; the tracker records a verdict per PR and the owner's one command (`gh pr close <n> --comment "<reason>"` or "merges itself when green"). DEP-SWEEP is noted, not done. (0.5 d) | dependabot.yml; package.json and lock only for a landed bump | `npm view` outputs pasted; `npx vitest run` green; a verdict per open Dependabot PR | a bump that needs changes beyond the bumped package's call sites |
| P0.5 | **Coverage floor** (D42, A8). `vitest.config.mts` global thresholds 65/50/55/65 → 90/80/85/90; the `src/webview/**` ratchet untouched; the coverage summary step of `ci.yml` and "MANDATORY: Tests" item 5 print the new numbers. (0.25 d) | vitest.config.mts, ci.yml, copilot-instructions | `npm run test:coverage` → exit 0, totals ≥ 90/80/85/90 pasted | a total below its new floor |
| P0.5b | ⚑ **Floor 1.90.0** (D25, D54; research Appendix E). Sentinel `UX-P0.5b` for the floor sentences of `docs/adr/000-release-and-compatibility-policy.md` (VS Code 1.90.0, Chromium 122, Node 20.9) and ADR-011 Decision 6; `package.json` `engines.vscode` `^1.90.0` and `@types/vscode` `1.90.0` (exact; `check:vsix` validates it); `esbuild.mjs` targets `node20`/`chrome122` and the three bundle ceilings re-measured (`Math.ceil(measured × 1.1)`, sizes pasted); `@types-host/node` → `npm:@types/node@20.19.43` (amended at the owner's P0-gate ratification of 2026-10-30) with the `tsconfig.json` lib and comment; `ci.yml` E2E matrix `vscode: ['1.90.0', 'stable']`; `src/test/lint/webview-css-baseline.test.ts` BASELINE 122 (the 16 entries at or below 122 retire, the 10 above stay, the "every entry > BASELINE" assertion stays non-vacuous); README requirements; CHANGELOG `### Changed` `**Breaking:**` (VS Code 1.90 or newer); the tree text that goes stale with the floor: in `.github/copilot-instructions.md` the gotcha rows "Extension host is Node 18.15" and "CSS feature newer than Chromium 114", the `E2E (1.85.0)` mentions in "A red CI run is not always a code failure", and the Tooling rows "Test CLI's Mocha runs inside the extension host" (Node 18 on 1.85) and "VS Code declarations"; ARCHITECTURE.md's tokens section ("`scrollbar-color` is not available in Chromium 114", "Chromium 114, the browser of VS Code 1.85") and its baseline sentence; `.github/workflows/ci.yml:176` (the E2E matrix). The scrollbar note for P0.22 and ARCHITECTURE: on Chromium ≥ 121 a `scrollbar-color` other than `auto` switches the `::-webkit-scrollbar` rules off, so the 10 px token scrollbars keep the WebKit rules and add `scrollbar-color: auto` as the reset (ADR-011 Decision 6), measured once in the UI job. (1 d) | package.json, lock, esbuild.mjs, tsconfig.json, ci.yml, lint test, ADR-000, ADR-011, README, CHANGELOG, copilot-instructions, ARCHITECTURE.md | `npm run check-types` → 0; `npm test` green; `node esbuild.mjs --production --analyze` inside the new ceilings; `npm run package:vsix` and `npm run check:vsix` green; `E2E (1.90.0)` and `E2E (stable)` green; `grep -rn -e '1\.85' -e 'Chromium 114' -e 'Node 18' .github/copilot-instructions.md ARCHITECTURE.md .github/workflows/ci.yml` lists only historical references (each marked `(history)` or naming the 1.x or 2.0 past) | a Node 20 or Chromium 122 change that breaks a test; record the owner's ruleset action for P7.5 (`E2E (1.85.0)` → `E2E (1.90.0)`) |
| P0.6 | **Dense static fixture workspace** (H28, H72, MULTI-FOLDER). `src/test/ui/fixtures/dense-workspace/`: `dense.code-workspace` with the folders `app/` and `tools/`; `nuget.config` (`<clear/>` + nuget.org); `app/Gateway/Gateway.csproj` (`net8.0;netstandard2.0`), `app/Catalog/Catalog.csproj` under `app/Directory.Packages.props` (CPM), `tools/Utility/Utility.csproj`, each with 12–15 direct references at pinned versions incl. a prerelease, a floating version (`Utility`), ≥ 3 ids of 40+ characters (e.g. `Microsoft.Extensions.DependencyInjection.Abstractions`) and one package pinned to a version with a permanent advisory (e.g. `Newtonsoft.Json` 12.0.1); `tools/Unsupported/Unsupported.csproj` with `tools/Unsupported/global.json` `{"sdk":{"version":"8.0.425","rollForward":"disable"}}` (A5); `src/test/lint/dense-fixture.test.ts` asserting that structure. Named states assert structure, never a live "latest" value. (1 d) | — → fixture, lint test | lint test green; `dotnet restore` of the three SDK-10 projects → 0; `dotnet package list --vulnerable --project app/…` lists the advisory pin; in `tools/Unsupported` `dotnet --version` → `8.0.425` | a pinned version missing from nuget.org or its advisory withdrawn |
| P0.7 | **UI job: SDKs, fixture restore, VS Code pin, look keys** (D35; H10, H32, H61, H66). `ci.yml` `ui` job: `setup-dotnet` `dotnet-version` multi-line `10.0.x` and `8.0.425` (the `global.json` literal, never `8.0.x`); restore of the four fixture projects with `actions/cache` on `~/.nuget/packages` keyed by `hashFiles` of the fixture's project, props, `global.json` and config files; a step asserting `dotnet --version` in `tools/Unsupported` prints `8.0.425` (a failed resolution reads as *supported*); `actions/cache` on the ExTester VS Code download keyed by the pinned version; `test:ui` → `--code_version 1.140.0`; the job passes `--storage /tmp/nuiget-ui --extensions_dir /tmp/nuiget-ui/extensions`; `src/test/ui/settings.json` += `"workbench.experimental.modernUI": true`, `"window.density.layout": "default"`, `"workbench.experimental.modernUIUppercaseViewHeaders": false`; new `src/test/ui/settings.classic.json` (`modernUI: false`); `dense-fixture.test.ts` asserts the SDK literal in `global.json` and `ci.yml` agree. Gotcha rows for the pin and the classic file. (1 d, UI) | ci.yml, package.json, settings files, lint test | UI job green; its log shows VS Code `1.140.0`, the Unsupported check `8.0.425`, a VS Code cache hit on the second run; every existing v2 suite green under Modern UI | `setup-dotnet` cannot install 8.0.425; a v2 suite red only under Modern UI |
| P0.8 | **Named states, Tier A** (H20, H77, X41). `src/test/ui/v2/states.ts`: the one list of named states (`name`, `surface`, `tier` A/B/marketing/hero, `themes`, `widths`, `look`, `setup`, `masks`), replacing the `ScreenshotState` union (callers and the CI "Check the named screenshots" step migrated); helpers `setPanelWidth(px)`, `setSidebarWidth(px)` (window rect and sash), `selectTheme`; `src/test/ui/v2/capture/capture.ui.test.ts` opens `dense.code-workspace`, captures every Tier A state and logs the outer `iframe.webview` rect per capture; `scripts/crop-png.mjs <png> <x> <y> <w> <h> <out>` (CSS px at DPR 1; seeded from `docs/design/export-proof/crop.mjs` and the research bundle's PNG reader; `design-judge`'s refuter crops boxes with it) writes the webview crop as `<state>.<theme>.<width>.png` at the root of the `ui-screenshots` artifact (the raw window PNGs may stay in ExTester's timestamp folder), so `gh run download <id> -n ui-screenshots -D captures/<run-id>` yields the flat layout the goldens, the judge and the judge log use; npm scripts `test:ui:capture` and `test:ui:classic`, and `npm run test:ui` runs the v2 suites and then `test:ui:capture`, so the pending list (P0.10) prints at the end of `npm run test:ui`; Tier A = every state in Dark Modern at panel 1200 / sidebar 300 under Modern UI, the theme-sensitive subset (selection, focus, badges, section headers, details) in Light Modern and Dark High Contrast and once under `settings.classic.json`, and `sidebar-narrow-200px`; `main-installed-single` also at panel 932 in both looks (the width of artboard A, P0.27a); a classic-pass capture names its theme part `<theme>-classic` (`main-installed-single.dark-modern-classic.932.png`), so the two looks never share a file name; the states the 2.0 set lacks: `main-installed-details` (an installed package with an update selected, details loaded; P9.fix-5's state), loading-first, revalidating, empty, error, sources-unavailable, unsupported, unresolved, CPM, All Projects with a provisional badge, multi-folder All Projects, filter mode, hover, keyboard focus, unfocused list, open dialog, main 800, sidebar 170/250. Gotcha row "A capture suite runs only through `test:ui:capture`". (1 d, UI) | states.ts, capture suite, package.json, ci.yml | UI job green; the check step prints one PNG per Tier A state; the capture step ≤ 6 min by its log timestamps | Tier A over 6 min: ask which states move to Tier B (drop none) |
| P0.9 | **Tier B, the floor lane and the macOS lane** (D55; H25, N64). `ci.yml`: `workflow_dispatch` inputs `tier` (`A`/`B`) and `negative_sha`; job `ui-matrix` (Tier B: six themes × panel 800/1200/1600 × sidebar 200/300/400, Modern UI, one shard per theme, each ≤ 15 min), job `ui-floor` (the Tier A states at `--code_version 1.90.0`, classic look since Modern UI does not exist there: the floor's Chromium 122 rendered and measured, which closes N64) and job `ui-macos` (`macos-26-intel`, the free Intel runner, Tier A, measurements and captures, never goldens), all on `workflow_dispatch` only; RUN-ux §6 triggers them at phase gates. The floor lane's VS Code is outside ExTester's declared range (a warning) and informational until green twice. (0.75 d, UI) | ci.yml, states.ts | one dispatched run: six shards green each ≤ 15 min, `ui-floor` green on 1.90.0, `ui-macos` green, artifacts `ui-screenshots-<theme>`, `ui-screenshots-floor` and `ui-screenshots-macos` present; ledger N64 closed | a shard over 15 min; ExTester cannot start 1.90.0 |
| P0.10 | **`measure.ts` (1): framework, gap membership, shared insets** (MS-1, MS-4, MS-5; H8, H9, H33). `src/test/ui/v2/measure.ts`, called from P0.8's capture suite: a registry `rule(id, { helper, scopes, tolerance })` with a status per scope, `'hard'` or `{ pending: '<item>' }`; rule ids exactly as Appendix B writes them (`DS-GRID-2a` block gaps and `DS-GRID-2b` header proximity are two ids); scopes are a state group (`main-installed`, `main-updates`, `browse`, `details`, `dialogs`, `sources`, `sidebar`) and, where Appendix B names one, an element group (`toolbars`, `headers`, `main-header`, `rows`, `tabs`, `controls`); tolerances written once (D34); lines in the one format of §2.7 and gotcha row §6: `[measure] <name>: <value> (pending <item>)` or `[measure] <name>: <value> (hard)`, `<name>` = `<rule>@<state>` or `<rule>@<state>/<element group>`; assertions for `hard` only; the pending list printed at the end of `npm run test:ui` (the capture suite runs last, P0.8); `not measurable` when a selector is absent (a hard rule then fails, never passes). Helper 1 gap membership (every sibling gap a scale value ± 0.5 px, symmetric where the rule says, DS-GRID-2b proximity); helper 2 shared insets (left edges of the named regions ± 1 px). **Insets are content insets:** start, end, top and bottom are measured from the box's padding box (minus a visible scrollbar) to the union of its visible leaf content (text ranges, images, SVGs, controls), never to direct children that fill the box; this is what makes V3 and V4 visible. Two rules where tolerances differ: **PF-6** (P9.fix-6: the left edges P9.fix-6 aligned, at today's P9.fix-6 tolerance) `hard`; DS-INSET-1 at 1 px over every region, DS-INSET-2, DS-GRID-1, DS-GRID-2a, DS-GRID-2b `pending` per Appendix B. The P0 hooks of interaction model §8.1, as attributes on existing elements only (no DOM or style change), their rows moved into §8: `main-header` (`MainShell.tsx`), `installed-toolbar` (`InstalledTab.tsx`), `updates-toolbar` (in two files: `UpdatesTab.tsx` and `AllProjectsUpdates.tsx`), and `section-box-<name>` with `data-variant` through an optional `variant` prop of `SectionHeader` (`pane`, `group` or `level`, default `group`), **pre-ruled by this plan so design trigger 5 does not fire for it**, mapped as: Installed `direct` and `transitive` and the All Projects project headers = `group`; the sidebar's Installed and Updates sections = `pane`; the details pane's Dependencies and Required by groups (per framework) = `level`. The gotcha row "A `pending` measurement flipped early" (`copilot-instructions.rows.md` §6), whose format this row matches. (1 d, UI) | measure.ts, capture suite, `SectionHeader.tsx` and its callers, the hook sites, interaction model §8, copilot-instructions | UI job green; a `[measure]` line per rule and Tier A state; the pending list at the end of `npm run test:ui`; PF-6 hard and green; DS-INSET-2@main-installed-single/toolbars prints 16/6 and the header boxes print non-zero insets | a P9.fix rule red on today's tree; a hook that needs a new element |
| P0.11 | **`measure.ts` (2): heights with workbench parity, box centring** (MS-2, MS-6; H34). Helper 3: heights ± 1 px of their token, and parity with the workbench measured in the same session (Extensions row and search box, pane header, Settings select, button and input, quick input, editor tab strip; both looks) written to `docs/design/workbench/<look>.json` from the run's artifact; helper 4: a control's box centre within 1 px of its row's. **PF-3b** (P9.fix-3: check box and icon centred in the comfortable row) and **PF-5** (P9.fix-5: details Uninstall and Update share left edge and height ± 1 px) `hard`; DS-HEIGHT-* `pending` per Appendix B. (1 d, UI) | measure.ts → docs/design/workbench/*.json | UI job green; PF-3b, PF-5 hard and green; both JSON files committed | a workbench selector absent on 1.140.0 |
| P0.12 | **`measure.ts` (3): truncation, overlap and clipping, chrome still, target size** (MS-3, MS-7, MS-8). Helper 5 `scrollWidth ≤ clientWidth` for named text at the reference widths; helper 6 no two sibling rects intersect, every child inside its parent's content box, no `scrollHeight > clientHeight` unless the spec declares it, persistent chrome rects equal across states ± 0.5 px; helper 7 targets ≥ 24 × 24 px. **PF-2** (P9.fix-2: the first transitive header follows the last direct row in the same scroller, at most two block gaps below it), **PF-3a** (P9.fix-3: authors not truncated at panel 1200), **PF-4** (P9.fix-4: the primary toolbar button's right edge within today's P9.fix-4 tolerance of the list's right edge) `hard`; DS-INSET-3, DS-OVERFLOW-2 (vacuous on the probe), DS-ROW-5 `pending`. (1 d, UI) | measure.ts | UI job green; PF-2, PF-3a, PF-4 hard and green; `DS-OVERFLOW-2@main-installed-all` prints the V3 badge rect | — |
| P0.27a | ⚑-design **Artboard A corrected and committed** (D46–D50, round 1: A; runs after P0.12 and before P0.13, which, like P0.19, needs its spec). Correct `docs/design/artboards/round1/A-Extensions.dc.html` and its `tokens-A.css` to the Design System (`docs/design/design-system.md` §16): main-panel rows and group headers are not inset; the sidebar inset is 8 px under Modern UI; the Browse description stays the row's middle line (T-27); tab labels keep 11 px uppercase until P0.14 binds the Extensions editor navbar. Add `scripts/serve-artboards.mjs` (static server on 127.0.0.1; no `python3` rule). Render with the proven route (`docs/design/export-method.md`: the proof test `docs/design/export-proof/zz-export.ui.test.ts.txt` compiled as a capture suite, run on the ubuntu `ui` job, which is also P0.27's gate 0) `docs/design/artboards/main-installed-single.dark-modern.932.png` (Modern UI) and `docs/design/artboards/main-installed-single.dark-modern-classic.932.png` (classic), named exactly as P0.8 names the captures (theme part `<theme>`, or `<theme>-classic` for the classic look), so the compare step pairs artboard and capture by file name with no mapping; write `docs/design/artboards/main-installed-single.spec.json` from the rendered DOM rects (element test id → rect, inset, gap, height, token names). The owner's pick fixed the direction, not the pixel values: the design-advisor approves the correction against composition A before the commit. (0.5 d, UI) | the artboard and its token file, script, capture suite → 2 PNGs, spec.json | the two PNGs, measured with `docs/design/export-proof/measure.mjs`, match `main-installed-single.spec.json` within 1 px; the design-advisor's approval pasted into the handoff note | the route does not render on Linux (stop: P0.27's fallback) |
| P0.13 | **`measure.ts` (4): spec conformance and rule coverage**. Helper 8 compares the rects of `docs/design/artboards/<state>.spec.json` (test id → expected rect, inset, gap, height, token names) within D34, `pending: <screen item>` for every state that has a spec (the first is P0.27a's `main-installed-single.spec.json`, compared with the captures `main-installed-single.dark-modern.932.png` and `main-installed-single.dark-modern-classic.932.png`; an artboard and its capture share one file name); `scripts/check-rule-coverage.mjs --states <list>` (or `--states all`) prints each `DS-*` id of `design-system.md` the states exercise that no `rule()` asserts (design trigger 6). (0.75 d, UI) | measure.ts, script | UI job green; `node scripts/check-rule-coverage.mjs --states all` prints only ids Appendix B lists as judge-only or owned by a later helper | a spec names a test id no state renders |
| P0.14 | **Theme dump and the missing exemplar states** (research §18). A capture-suite step built from `docs/design/probe/zz-probe.ui.test.ts.txt` (A1) reads every resolved `--vscode-*` property off the webview root, the body classes and the `--nuiget-*` computed values under the six themes in both looks on 1.140.0 in CI, and writes `docs/design/themes/<theme>.css` (classic, the existing header format) and `<theme>.modern.css`; the exemplar measurements of P0.11 gain hover, keyboard focus, unfocused list, sidebar 170/200/250, main 220/400/600/800, All Projects with a provisional badge and dialogs. (1 d, UI) | capture suite → 12 theme files, workbench JSON | the files committed from the run's artifact; the diff against the planning dumps listed in STATUS (only 1.142.0 vs 1.140.0 differences); every DS rule research Appendix B marks not measurable now prints a `[measure]` line or is listed judge-only | a token the Design System aliases is absent on 1.140.0 |
| P0.15 | **Goldens and pixel diff** (MS-9; H27, H76, H78). Dev dependencies `pixelmatch`, `pngjs`; `scripts/compare-goldens.mjs <screenshots dir>` takes the already-cropped `<state>.<theme>.<width>.png` files of P0.8 (refusing an uncropped window PNG), applies the state's masks, compares with `src/test/ui/v2/golden/<state>.<theme>.<width>.png` (`includeAA: false`, threshold 0.1) and prints `[diff] <state>: <n> px (<pct> %, tolerance …)`; per-state tolerance in `states.ts` (0.5 % to start, 0 px once masked); a text-metrics fingerprint per capture (resolved font family, width of a reference string, runner image); refuses a PNG whose DPR is not 1 (CI-to-CI only). Initial goldens = today's captures marked `baseline`; screen items replace them with design-advisor-approved goldens. A `ui` job step, informational. (1 d, UI) | package.json, script, golden/ | UI job green; on a rerun of the same SHA `[diff]` is 0 px for every masked Tier A state | a state that cannot reach 0 px with masks (paste the diff image) |
| P0.16 | **`scripts/ui-harness.mjs` and the negative-control job** (H11). `node scripts/ui-harness.mjs` with the options `--vsix <path>`, either `--tier <A or B>` or `--states <list>`, `--look <modern or classic>`, `--storage <dir>` and `--build-sha <sha>`: without `--vsix` it packages the working tree once; with `--vsix` it runs the split ExTester commands (`get-vscode`/`get-chromedriver` at 1.140.0, `install-vsix -f <vsix>` into `<storage>/extensions`, `run-tests` of HEAD's compiled capture suites); `--build-sha` makes `/tmp/nuiget-<sha>` with `git worktree add`, runs `npm ci` and `npx vsce package` there and prints the VSIX path; it never checks out an old commit in the main tree. CI's capture steps call it; the `negative-control` job (`workflow_dispatch` input `negative_sha`) builds that SHA's VSIX in a second checkout and runs HEAD's harness on it. (1 d, UI) | script, package.json, ci.yml | `node scripts/ui-harness.mjs --tier A --storage /tmp/nuiget-ui` → exit 0 locally; the UI job green through the script | — |
| P0.17 | **Negative control (a): the pre-fix tree** (D36). `gh workflow run ci.yml --ref labs/ux -f negative_sha=80940aa` (`80940aa` = `1784642^`); the run must report, with coordinates, PF-2 (`1784642`, transitive section pinned to the bottom), PF-3a and PF-3b (`8c1f643`, authors truncated, check box off-centre), PF-4 (`b83316d`, toolbar buttons bunched left), PF-5 (`aacde06`, details buttons misaligned), PF-6 (`c50d335`, drifting left insets); output pasted into the item's handoff note and summarised in `docs/design/negative-control.md` (rule, state, value, coordinates, tree, run id). A local run (`--build-sha`) is optional and never the record. (1 d, UI) | — → negative-control.md | each of PF-2…PF-6 red on `80940aa` with coordinates; none `not measurable` (PF-3a excepted by the owner's ratification of 2026-10-30: `none cut` on both trees at 1200 is a true measurement, P9.fix-3 is PF-3b's) | a PF rule passes on `80940aa`: the harness is blind; fix the helper, never the expectation |
| P0.18 | **Negative control (b): the current tree** (D36). The harness on HEAD before any screen item must report V2–V5 by measurement in the ledger's states, as `pending` lines with failing values: V2 toolbar control edges vs the list edge (`main-installed-single`), V3 the badge rect intersecting the list border (`main-installed-all`), V4 header top vs bottom gap (`main-installed-single`, `main-transitive-expanded`), V5 a sibling gap off the scale (`main-installed-single`, `main-updates`); PF-2…PF-6 green; zero red `hard` rules; V1 recorded judge-only with DS-HEIGHT-4/6/7 as its numeric pending part. Appended to `docs/design/negative-control.md`. The run's cropped Tier A captures are committed as `docs/ux/reference-2.0/<state>.<theme>.<width>.png` (with their run id and sha256 in a `README.md` there): the permanent "before" set of the before/after pages (P2.10, P7.4); the PNGs of run 39025149785 (classic, full window) stay the V1–V5 evidence only. (0.75 d, UI) | — → negative-control.md, `docs/ux/reference-2.0/` | the four V rules print failing values in the named states; no red hard rule | a failing value outside V2–V5 at blocking severity that the ledger does not classify: add a V-row first, then a pending rule |
| P0.19 | **Judge probe and hardness bookkeeping** (D37; H35). `design-judge` in screen mode on the P0.17 and P0.18 captures (`captures/<run-id>/`) against committed artboards. The five states the ledger and the P9.fix defects name: `main-installed-single` (V1, V2, V4, V5; P9.fix-3, -4, -6), `main-installed-all` (V3), `main-transitive-expanded` (V4; P9.fix-2), `main-updates` (V1, V5; P9.fix-4) and `main-installed-details` (P9.fix-5; a P0.8 state: an installed package with an update selected, details loaded). **At approval only `main-installed-single` has an artboard**: round 1's composition A, corrected, rendered and specified by P0.27a (`main-installed-single.dark-modern.932.png`, `main-installed-single.dark-modern-classic.932.png`, `main-installed-single.spec.json`), judged against the captures of the same file names; the other four come with round 3's states. So P0.19 evaluates criterion (a) on `main-installed-single` (P9.fix-3, -4, -6 on `80940aa`; V1, V2, V4, V5 on the base) and records the rest (P9.fix-2, P9.fix-5, V3) as `pending artboard`; the first item that commits one of those artboards re-runs this judge step for its state, and P2.11 records criterion (a) as met only when all ten are. `docs/plans/judge-log/` with the format of `judge-rubric.md` §9 and `P0.19.json`. (0.75 d, UI) | — → judge-log | judge JSON pasted; criterion (a) per state recorded `met`, `not met` (missing findings named) or `pending artboard` | a panel over the ≤ 25-agent budget: split by state |
| P0.20 | **CSS lint gate (1)** (D28; H12, H36, H64, H79, H81, V6, V21; CA-R1). Vitest lints in `src/test/lint/` (no stylelint): `pxLength` (px/em/rem outside `tokens.css` in width, height, min/max sizes, insets, borders, outlines, radii, line-height), `duplicateSelector` (a selector in more than one stylesheet except `body`/`:root`), `specificity` (ceiling (0,2,0)), `override`/`singleOwner` (a property on a `.nuiget-<primitive>` class or its descendants declared in more than one rule across `src/webview/**/*.css`; feature stylesheets set placement only: `grid-*`, `flex`, `order`, `align-self`, `justify-self`, `margin-*`); baseline `src/test/lint/__fixtures__/css-audit-baseline.json` from `docs/research/2026-10-23-ux-research/css-audit-work/baseline.json` (A1), entries `{file, rule, selector, item}` with `item` = the plan item that removes it. (1 d) | lint tests, baseline | `npx vitest run --project backend src/test/lint` green; baseline 116 entries (`pxLength` 58, `duplicateSelector` 1, `specificity` 41, `override` 16) | a count differing from the audit: paste the diff (the audit is not edited) |
| P0.21 | **CSS lint gate (2) and its negative control** (H36, H69; ADR-010 Decisions 6–7). `deadRule` and `disableComment` (no `stylelint-disable`/`eslint-disable` under `src/webview/**`, comment-aware reader), each with a planted-defect test since neither has a hit on the tree; the TSX rule (every `style=` under `src/webview/**/*.tsx` is a `cssVars({ '--nuiget-…': value })` call); the done rule (an entry whose `item` is `done` in `STATUS-ux.md` fails); `scripts/check-css-baseline.mjs --item <ID>` (G-UI step 1); negative control as a test: with the baseline emptied in memory the new rules hit exactly the 116 audited places by file and rule and the existing rules stay green. (0.75 d) | lint tests, script | lint green; the negative-control test asserts 116 hits matching the audit | — |
| P0.22 | **10 px token scrollbars** (D25, V15). With Chromium 122 at the floor, `scrollbar-color` needs no progressive-enhancement allowlist. On Chromium ≥ 121 a `scrollbar-color` other than `auto` (VS Code's default webview stylesheet sets one on `html`) switches the `::-webkit-scrollbar` rules off, so the roots keep the token-coloured WebKit rules that draw the 10 px scrollbars and add `scrollbar-color: auto` as the reset (ADR-011 Decision 6); the test `the scrollbars are drawn with the scrollbar tokens` (`webview-stylesheets.test.ts`) rewritten (named) to pin both; a UI-job probe line measures the rendered scrollbar thickness and colour once on 1.140.0 (and in the 1.90.0 lane). Per-look thickness (8 px under Modern UI) is a look token (P1.1). (0.5 d, UI) | primitives.css, lint tests, goldens | lint green; `[probe] scrollbar` line shows 10 px in the token colour in both lanes | no combination draws the token scrollbars on 1.140.0: record V15 as a host limitation and ask |
| P0.23 | **Accessibility harness (1): ARIA snapshot and full axe per state** (H17, H30, H31, H46, H47; a11y-full-axe-real-page). From inside the webview (axe's `getRole` and accessible text, no CDP): an accessible-tree snapshot per named state in `src/test/ui/v2/aria/<state>.json`, compared on later runs; the full axe ruleset plus `label-content-name-mismatch` and `target-size` per Tier A state with every layer open, under every theme of `theme.ui.test.ts` on the same state set; `incomplete` allowed only in the details pane until P3.4. (1 d, UI) | capture suite, aria/*.json | UI job green; `[axe]` 0 violations per state, or each violation a `pending` rule with its owner item | — |
| P0.24 | **Accessibility harness (2): keyboard paths, focus after close, reduced motion** (H29, H48, H86, H87; a11y-focus-after-close, a11y-reduced-motion-both-signals). ExTester keyboard paths of interaction model §5 per screen (tab order against an expected sequence, row keys, dialog trap/Escape/restore; `[keys]` lines); a shared jsdom helper asserting `document.activeElement` is never `<body>` after a `Dialog`/`ConfirmDialog` closes, wired into every feature test that opens one, with the same hard/pending registry (A6's two cases `pending: P4.4`); a runtime check under `workbench.reduceMotion: on` that `body.vscode-reduce-motion` is set and nothing animates (`pending: P4.5`). (1 d, UI) | capture suite, test helper | UI job green; `[keys]` lines per screen; `npx vitest run` green with the pending cases printed | — |
| P0.25 | **Accessibility harness (3): contrast coverage, rule-coverage ledger** (H49, H88; a11y-text-contrast-all-states, a11y-nontext-contrast). Contrast in a hovered row, an open ConfirmDialog, the search popup and the README state; an offline lint over the token pairs of `docs/design/themes/*.css`; a jsdom setup file logging each axe rule outcome that fails when a rule in `src/test/lint/__fixtures__/axe-rule-coverage.json` becomes inapplicable. (0.75 d, UI) | capture suite, lint, setup file | UI job and `npx vitest run` green; failures land as pending rules (A7, A8, A14) | — |
| P0.26 | **Perf timing in Chromium** (H57–H60, H71). In-page stamps (`performance.now()` in the webview, read by ExTester) for panel open → first row → authoritative list → icons, select → details, search → first result, on the dense workspace; `[perf] <mark>: <ms>` lines; informational; measured rows added to `docs/perf-baseline.md`. (0.5 d, UI) | capture suite, docs | `[perf]` lines in the UI log; rows committed | — |
| P0.27 | **Artboard export** (`docs/design/export-method.md`). Gate 0 (one green run of the proof test on the ubuntu `ui` job, proving that ChromeDriver on Linux under xvfb lists the Integrated Browser's `WebContentsView` page as a second window handle) was met by P0.27a's CI run; cite it. Then `scripts/render-artboards.mjs`, using P0.27a's `scripts/serve-artboards.mjs` ("Browser: Open Integrated Browser" by exact label, the second handle, CDP `Emulation.setDeviceMetricsOverride` width and DPR 1, `Page.captureScreenshot` with `clip`, themes and widths by `location.assign` and a new emulation call) writing `docs/design/artboards/<state>.<theme>.<width>.png` with the capture naming of P0.8 (theme part `<theme>-classic` for the classic look); it samples one saturated token pixel per capture and fails loudly on a colour-profile mismatch; `--extensions_dir` under the storage directory. CI-to-CI only (fonts differ on Linux). (1 d, UI) | scripts, capture suite | gate 0 green in CI; a CI render of one state, theme and width is byte-identical across two runs | gate 0 red on Linux: stop; the fallback (a test extension opening the artboard in a webview panel) is a new item the design-advisor sizes |
| P0.28 | **Browser loop: wrapper and first-run probe** (after P0.0; `docs/plans/browser-loop.md`). `scripts/browser-loop.mjs` with the steps `prepare` (fixture copy, restore, VSIX install, Machine settings), `theme`, `wait` (HTTP 200, wraps `curl`) and `stop` (wraps `lsof`); then the §5 first-run probe checklist once with `code-server` 1.142.0 and the built VSIX; each verdict recorded in the tracker Notes. Probe step 9 (can a pane screenshot be saved as a file) decides whether the loop's PNGs can ever reach `design-judge`; until a file route is proven the judge scores ExTester captures only. Informational and optional afterwards (RUN-ux §4). (0.75 d) | script → tracker | `node scripts/browser-loop.mjs wait` → exit 0 against a started server; a verdict per probe step | — |
| P0.29 | **Regression matrix and ledger bookkeeping** (H62, H93, H94). One `R<n>` row per new named state and per measurement helper (kind `ui`, the capture suite and its title), next free ids; ledger rows for the post-release backlog of §6 (status `post-release backlog`); the stale statuses S4, N14, N7, N5 corrected; N87 closed. (0.25 d) | matrix, ledger | `npm run check:matrix` → 0; `grep -c 'post-release backlog' docs/plans/findings-ledger.md` ≥ 18 | — |
| P0.30 | **Docs drift for the UX documents**. `npm run docs:check` does not read the new documents today; `scripts/check-docs-drift.mjs` gains: in `docs/plans/RUN-ux.md`, `docs/design/design-system.md` and `docs/design/judge-rubric.md` every backticked path under `src/`, `scripts/`, `docs/`, `.github/` or `.claude/` exists (except under `captures/`, and except entries of a `FUTURE_PATHS` list, each naming the item that creates it, which fails once that item is `done` and the path is still absent); every `DS-*` id cited in this plan, `RUN-ux.md`, `measure.ts` or the rubric exists in `design-system.md`. This plan's own paths are not drift-checked (most name outputs of later items); its rule ids are. (0.5 d) | script, lint test | `npm run docs:check` → 0; a planted bad path and a planted bad rule id each fail in `docs-drift.test.ts` | — |

**P0 gate:** every P0 row `done` (P0.28 may stay open while P0.0 is the owner's; record it); the UI job green on two
consecutive runs of the same SHA (`gh run rerun <id>` once) with identical `[measure]` output (flake budget) before any
measurement is declared `hard`; the tracker's "Pending measurement rules" table lists every `pending` rule and every
V2–V5 rule is among them; PF-2…PF-6 `hard` and green; both negative-control trees hold (P0.17, P0.18 pasted); the lint
negative control holds (P0.21); the judge probe recorded with criterion (a); one Tier B dispatch and one `ui-macos` run
green; `npm run check:matrix` → 0; PHASE REVIEW by both advisors and the `phase-review` workflow.

### P1 — Design System landing (≈ 4 d)

`docs/design/design-system.md`, `docs/design/tokens.json`, ADR-010–013 and interaction model v2 arrive with the
approval commit; this phase makes the tree follow them.

| ID | Item | Inputs → Outputs | Gate | Ask |
|---|---|---|---|---|
| P1.1 | ⚑-design **`tokens.css` on the Design System** (D24, D28; ADR-011 Decisions 3–5, 7, 8; V9, V14, V17, V49, V64, H6, H80; DS-GRID-3, DS-TYPE-2/3). Every spacing, radius, type, weight, codicon-size and line-width token aliases its exported `--vscode-*` token with the classic value as fallback (`--nuiget-space-6: var(--vscode-spacing-size160, 16px)`, `--nuiget-line-width: var(--vscode-strokeThickness, 1px)` replacing the hairline literals); type in px on {10,11,12,13,18,26}; the 13 colour roles of ADR-011 Decision 7 and `checkbox.selectBackground`, `checkbox.selectBorder` (D52) as aliases; the look tokens re-valued under `:root[data-look="modern"]` and the density and uppercase attributes; duration tokens zero under `body.vscode-reduce-motion` as under `prefers-reduced-motion`; `--nuiget-target-min` a pointer-target floor only (V14); the three unused tokens deleted; `webview-tokens.test.ts` learns the new selectors, the alias form, the role list of `tokens.json` and `ROW_HEIGHT` = the row-height tokens; `em` font sizes in `primitives.css` replaced by the px tokens (no other rule change). Goldens of every state updated in the same commit. (1 d, UI) | tokens.css, webview-tokens.test.ts, primitives.css (font sizes), goldens | G-UI; `node scripts/check-css-baseline.mjs --item P1.1` → 0; DS-GRID-3 and DS-TYPE-2 `hard` | a state still red on DS-TYPE-2 stays pending with its screen item (record) |
| P1.2 | ⚑ **ADR-008 residue** (ADR-008-AMEND). If `grep -n 'ErrorBoundary' docs/adr/008-webview-architecture.md` is empty: sentinel `UX-P1.2`, one sentence naming the ErrorBoundary of both entries as ADR-008's (P9.9); delete the sentinel; commit. If the approval commit already carries it, close the row `skipped` with the grep output. (0.25 d) | docs/adr/008 | `git diff --stat` names `docs/adr/008-webview-architecture.md` only; `npm run docs:check` → 0 | — |
| P1.3 | **Look attributes at first paint** (D23; ADR-011 Decision 2; DS-DENSITY-2). The host reads `workbench.experimental.modernUI`, `window.density.layout` and `workbench.experimental.modernUIUppercaseViewHeaders` as it reads `workbench.tree.indent` and writes `data-look`, `data-density`, `data-uppercase-headers` on `<html>` in `renderWebviewHtml` (host template change, no contract change); the "Design System" row of interaction model §8.1 moves into §8; capture states record their look from the attribute. (0.75 d, UI) | `src/host/services.ts`, the two hosts, tests | G-UI; host test `writes the look attributes on the document element`; the Tier A classic pass shows `data-look="classic"` | — |
| P1.4a | ⚑-design **Codicon sync script and lint** (D27; ADR-012; V13, H22, H23, H75; DS-ICON-1/5). `@vscode/codicons` as an exact-pinned devDependency (newest release at the item's date); `scripts/sync-codicons.mjs` writes the icon module from the icon plan's list (each component keeps the SVG's `viewBox` and path data verbatim, `/* @__PURE__ */ React.memo`, `size`/`className`/`title`); a Vitest lint comparing each icon's name, viewBox and paths with the pinned release; third-party notice in `LICENSE`, credit in README, the module header states MIT code and CC-BY-4.0 drawings. (0.75 d) | package.json, script, lint test, LICENSE, README | `node scripts/sync-codicons.mjs --check` → 0; the lint green | a glyph of the icon plan missing from the release |
| P1.4b | **Icons regenerated** (V51, V65; DS-ICON-2/4). `icons.tsx` regenerated; the two custom glyphs mapped to codicons; the Verified mark `verified-filled` at 16/12 in `extensionIcon.verifiedForeground`; `webview-icons-pure.test.ts`'s count follows the icon plan; every capture that shows an icon re-approved (goldens updated, judge run). (0.75 d, UI) | icons.tsx, callers, goldens | G-UI; bundle sizes pasted, inside the ceilings | a ceiling crossed |
| P1.5 | **Design reference check**. `scripts/check-design-tokens.mjs`: every token of `docs/design/tokens.json` exists in `tokens.css` with the same alias and fallback; every rule id of `docs/design/design-system.md` is unique and has a measurement line (rule ids cited elsewhere: P0.30). Runs in CI's Lint job. (0.5 d) | script, ci.yml | `node scripts/check-design-tokens.mjs` → 0 locally and in CI | the Design System and `tokens.css` disagree: design-advisor rules which one changes |

**P1 gate:** the alias form held by the tokens lint; the look attributes on both roots in both looks; the icon lint and
the design reference check green in CI; G-UI green on every Tier A state with the goldens refreshed; one Tier B dispatch
and one `ui-macos` run green; phase review.

### P2 — First vertical slice: the main-panel Installed tab (≈ 17 d) · re-base checkpoint

Only the primitives the Installed tab uses are rebuilt here (Listbox, Row, SectionHeader, Toolbar, IconButton, Tabs,
Badge, and the new Button, Checkbox, Select, TextField), each in place with every caller migrated in the same item (the
sidebar included), its old rules deleted and the lint gate at zero entries for the primitive and for every stylesheet
that selected its classes; `sidebar-narrow-200px` is in every primitive item's capture set. No `v2` or `legacy`
directory; no second generation of a primitive between items. The slice closes V1–V5 (their rules flip to `hard`).
The actions menu lands here too: ADR-013 requires both surfaces in one item (Listbox serves both) and the research
requires its runtime proof on the floor (1.90.0) in the first slice. D48 (round 1: A) makes every list one grouped list per view:
P2.1a and P2.1c–P2.1f build it for the main panel, P3.1 and P3.7c–P3.7d move the Updates tab and the sidebar onto it.

| ID | Item | Inputs → Outputs | Gate | Ask |
|---|---|---|---|---|
| P2.1a | ⚑-design **Listbox: the grouped list's model** (D48; V7, X37, LIST-RENDER-ALL, CA-R4; supersedes the P9.fix-2 ruling's DO-NOT). One listbox per view: sections and projects become group rows (a role and marker of their own, not `option`), one scroll element, real virtualization over all rows (the estimate reads the row-height token; CA-R4 test `ROW_HEIGHT equals the token`), one tab stop. `Listbox.test.tsx` titles that assert per-section lists rewritten (named). (1 d, UI) | Listbox.tsx, primitives.css | G-UI; PF-2 still hard; `Listbox.bench.ts` within baseline | — |
| P2.1b | **Typed row adapter** (V26, V70, H40, CA-R5). `Listbox` stops reading `Row` by DOM structure and class; a typed `RowModel` feeds both; the §8 row triad (`package-row-<id>`) and every ExTester `.nuiget-row-*` read kept or migrated in the item. (1 d) | Listbox, Row, callers, v2 UI helpers | G-UI; `interaction-model-testids.test.ts` green | — |
| P2.1c | ⚑-design **Grouped list: keyboard model and group rows** (D48; ADR-013 Decision 8; X11). Group rows (Direct, Transitive, a target framework inside Transitive, a project under All Projects): Enter expands or collapses; Left/Right collapse or expand, or move to the parent or first child; arrows cross groups; Home/End over the whole list (PageUp/PageDown and type-ahead are P4.3); the group row's accessible name and count; one bulk-selection state machine for every consumer. **⚑-design question before code:** tree and treeitem roles with `aria-level` and `aria-expanded` (the workbench's custom tree) versus a listbox that marks expansion otherwise, since `aria-expanded` on `role="option"` can fail axe's `aria-allowed-attr`; this item updates the listbox contract of ARCHITECTURE.md (and the gotcha rows on `role="option"`) to the ruling. (1 d, UI) | Listbox, a shared selection hook, ARCHITECTURE.md | G-UI; axe `aria-allowed-attr`, `aria-required-children` and `nested-interactive` each `passes` (`axeRuleOutcome`) in the jsdom tests of `Listbox` and on the grouped Installed states; `[keys]` paths cross groups | the ruling changes the §8 row triad (stop: P2.1f carries it) |
| P2.1d | **Grouped list: Installed consumers** (D48). `InstalledTab` and `InstalledProjectSection` (single project and All Projects) render one grouped list; the badges leave the header's actions (V3 is closed in P2.6). (1 d, UI) | installed feature | G-UI | — |
| P2.1e | **Grouped list: transitive consumers** (D48). `TransitiveSection` and `AllProjectsTransitiveSection` render group rows inside the Installed list (per-TFM `level` groups); the domain functions of `AllProjectsTransitiveSection` move out of the view module. (1 d, UI) | installed feature, details | G-UI | — |
| P2.1f | **Grouped list: hooks and tests** (D48; H40). The per-project list ids of interaction model §8 (one listbox per project today, e.g. `sidebar-updates-list-<name>`) become group-row ids, and so do the transitive lists (`transitive-list`, `transitive-list-<tfm>`) and the header hooks `section-header-<name>` and `section-box-<name>`, reconciled here with the roles P2.1c ruled; `interaction-model-testids.test.ts` and the §8 tables updated; the ExTester helpers and harness scenarios that address a per-project list migrated. (1 d) | interaction model §8, v2 UI helpers, harness | `npx vitest run --project backend src/test/lint` green; UI job green | — |
| P2.2 | ⚑-design **Row on the Extensions anatomy** (D46; V10, V12, V22, V23, V27, V32, V35, V39, V66, V68, V69; DS-ROW-1/3/5/6, DS-HEIGHT-3, DS-ICON-3, DS-COLOR-2/5, DS-DIVIDER-1, DS-FOCUS-1..4, DS-DENSITY-1). The Extensions row of D46 (72 px, two lines, the border inside the height); 36 px icon (24 at ≤ 250 px, hidden at ≤ 200 px); name truncates last; hover, selection and focus band over the whole row and its actions; hover never paints over selection; inactive selection when the list is unfocused; `list.focusOutline` 1 px; focus per look (D30); no line between rows; density from the surface, not a call-site prop. `Row.test.tsx` titles asserting 78 px or the divider rewritten (named). (1 d, UI) | Row.tsx, primitives.css, tokens (row height only, trigger 2) | G-UI; the Row rules of Appendix B flipped for `main-installed-*` | — |
| P2.3 | ⚑-design **Button and Checkbox** (D26, D51, D52; V18, V20, V29, V38, A7; DS-HEIGHT-6/9, DS-COLOR-6/7, a11y-nontext-contrast). `Button` (primary/secondary, 26 px, 12 px type, radius 4, padding 4/8, disabled at opacity 0.4 per D51, secondary hover); `Checkbox` (the 18 px workbench check box, radius 3, in the `checkbox.*` roles; a selected row's check box takes `checkbox.selectBackground`/`checkbox.selectBorder`, D52); every raw `nuiget-button` and check box of the Installed tab, the main header and the sidebar migrated. (1 d, UI) | 2 primitives + tests, callers | G-UI; DS-HEIGHT-6 (V1) and DS-HEIGHT-9 flipped | — |
| P2.4 | **Select and TextField** (D26; V24, V29; DS-HEIGHT-7). `Select` as a native wrapper (26 px); `TextField` for both search boxes; the three text-input blocks and four raw selects migrated (main header selectors, search boxes on both surfaces). (1 d, UI) | 2 primitives + tests, callers, search.css | G-UI; DS-HEIGHT-7 flipped | — |
| P2.5 | ⚑-design **Toolbar, IconButton and Tabs** (V1, V2, V11, V37, V41, V46, V52, V56, X45; DS-INSET-2, DS-HEIGHT-4/8, DS-COLOR-3/4/5, DS-ICON-2, DS-OVERFLOW-3). Toolbar: an end slot, start and end insets equal to the content inset, a declared minimum width and one overflow behaviour budgeting MI10/MU8's two icon buttons; IconButton: 22 px hover box in a ≥ 24 px target, `icon.foreground` (`disabledForeground` when disabled, D51), `toolbar.hoverBackground`/`activeBackground`; Tabs: strip height on the workbench reference measured in P0.11, `panelTitle.*` colours and a 1 px `panelTitle.activeBorder`, no boxed tabs in high contrast. (1 d, UI) | 3 primitives + tests, main.css placement rules | G-UI; V1's DS-HEIGHT-4 and V2's DS-INSET-2@toolbar and MS-1 at 1 px flipped | — |
| P2.6 | ⚑-design **SectionHeader and Badge** (V3, V4, V17, V33, V42, V43, V47, V53, V54, X3, X36, X60, MI12; DS-GRID-2b, DS-INSET-3, DS-HEIGHT-10, DS-TYPE-5, DS-COPY-5, DS-OVERFLOW-2). One header anatomy for both surfaces (X36): `section-box-<name>` with `data-variant` `pane`/`group`/`level`; in-list group headers as tree rows (body size, normal case); an end inset; a badges slot apart from actions; the header nearer its rows than the block above; Badge an 18 px pill in px type, boxed in high contrast; one count style per surface; the §8.1 "Installed slice" row for the Modern UI header moved into §8. (1 d, UI) | 2 primitives + tests, callers | G-UI; V3 and V4 rules flipped | — |
| P2.7 | **Main shell chrome** (V5, V30, V44, V55, X38, H82, CA-R3; DS-GRID-1 and DS-GRID-2a, DS-INSET-1, DS-TYPE-7, DS-DIVIDER-4, DS-OVERFLOW-1). Header rhythm on the 4/8 gap set; one content inset for title, search box, tab label, first toolbar control, chevron, check box or icon; panel title 13/600; one divider role; a shell chrome hook shared with `SidebarView` (`wc -l src/webview/main/MainShell.tsx` < 300); MainShell's context subscriptions narrowed and Row memoized. (1 d, UI) | MainShell, SidebarView, hook, main.css | G-UI; V5's DS-GRID-1 and DS-GRID-2a@`main-installed-*` flipped | — |
| P2.8a | **Installed tab: single project and transitive** (V45, X51; DS-ROW-2, DS-STATE-7). The tab on the new primitives; direct and transitive rows share icon and text x; SDK-implicit rows say in text why they cannot join a bulk action; the `transitive-*` hooks of §8.1 rendered and moved; spec conformance hard for `main-installed-single`, `main-transitive-expanded`, `main-transitive-details`; goldens approved by the design-advisor against the artboards. (1 d, UI) | installed feature, goldens, specs | G-UI | — |
| P2.8b | **Installed tab: All Projects and the state cells** (X3, X41, X49; DS-STATE-1/2/3, DS-HEIGHT-11). All Projects (two folders, provisional badge); every Installed state cell (loading-first and revalidating with a 2 px bar, empty welcome-style, inline error, partial, unsupported) with the `installed-*` hooks of §8.1 rendered and moved, and a Tier A capture each; every V1–V5 rule `hard`; the lint gate at zero for every slice file. (1 d, UI) | installed feature, states.ts, goldens | G-UI; `grep -c 'pending P2' ` on the run's `ui-output.txt` → 0 | — |
| P2.9a | ⚑ **The native actions menu, both surfaces** (D32; ADR-013 Decision 4; X1, X12, X18, H14, A3; a11y-hint-truthful). `package.json` `contributes.menus["webview/context"]` and hidden commands for both webview ids, `when` clauses on `webviewSection` and the row facts; `data-vscode-context` on every row wrapper (hook row moved into §8); `Listbox` stops `preventDefault` and dispatches a synthetic `contextmenu` for Shift+F10 and the ContextMenu key; the sidebar's QuickPick menu migrated; central rows confirm with the host modal listing the preview's projects; the Installed hint truthful; gotcha rows "Context menu under All Projects", "Central row without the preview" and "Buttons inside `role="option"`" updated. (1 d, UI) | package.json, Listbox, rows, SidebarHost, pickers, menu commands, tests | G-UI; jsdom tests of the context object, no `preventDefault`, the synthetic event | universal trigger (`contributes`) is this item's ⚑ |
| P2.9b | **Queued operations busy everywhere and the floor proof** (D32; ADR-013 Decision 5; X25). The host merges a progress emitter with the queue's and fires `ops/progress` status `queued` with `projectPaths` and `packageIds` for operations it submits; gotcha row "An operation that waits in the queue has no `ops/progress`" updated; e2e `the row menu uninstalls through webview/context` (right-click and Shift+F10). (1 d) | host, extension.ts, e2e test | `E2E (1.90.0)` and `E2E (stable)` green with the new test; harness scenario `queued menu operation marks the row busy` green | the menu does not open on 1.90.0 (stop: the advisors rule) |
| P2.10 | **First before/after page** (owner touchpoint 5; design round 3). `scripts/contact-sheet.mjs <checkpoint> --before docs/ux/reference-2.0 --after captures/<run-id>` (the before set of P0.18): per named state the 2.0 capture and the new one side by side at 1:1 (never downscaled), the judge verdict and the measurement summary beneath, and under each pair the only question, "better" or "not better"; writes `docs/design/contact-sheets/slice-1.html` and `.png`. Then **stop** (RUN-ux §7). A "not better" goes to the design-advisor and `design-judge`; each defect they name becomes first a harness rule that fails on the current captures, then a `P2.fix-n` row. (0.75 d) | script → contact sheet | the page lists every Tier A state of the slice; the owner's answer recorded per state in the tracker | — (stop) |
| P2.11 | ⚑ **Re-base** (§7). Hours from `git log --reverse --format='%at %h %s' origin/main..HEAD` with gaps over 3 h removed; P0–P2 measured against plan; the remaining phases re-estimated at the measured rate; the judge's disposition rate over P2 (D37 criterion (b)) computed by the design-advisor; the architecture-advisor rules on the re-based plan; recorded as a dated "Re-base" subsection of §7 (the §5 rows are not edited) and in the tracker. If the re-based total exceeds this plan's total by more than 50 %, **stop**: the owner cuts features (P5.x rows → `skipped`). (0.25 d) | — → §7, tracker | both rulings pasted; the D37 date recorded if both criteria hold | > 150 % (stop) |

**P2 gate:** V1–V5 rules `hard` and green; every P2 primitive and file at zero baseline entries; the menu proven on
1.90.0; the owner's answers on `slice-1` recorded and every "not better" closed by a `P2.fix-n`; the re-base recorded;
one Tier B dispatch and one `ui-macos` run green; phase review (both advisors, `phase-review`; the design-advisor
computes the judge disposition rate).

### P3 — Remaining primitives and screens (≈ 16 d)

| ID | Item | Inputs → Outputs | Gate | Ask |
|---|---|---|---|---|
| P3.1a | ⚑-design **Updates tab rebuilt on the grouped list, single project** (V8, X53; D48; D29 rewrite in place). One `CentralUpdateDialog` mount and one `useInstallAction`; rows `old → new` with the arrow as text; `UpdatesTab.test.tsx` titles rewritten (named). (1 d, UI) | updates feature, tests | G-UI | — |
| P3.1b | **Updates tab: All Projects and states** (X52; DS-STATE-1). `AllProjectsUpdates` on the same model; the first row keeps its y between Installed and Updates (MS-8); empty ("nothing installed" vs "all up to date"), loading, error, sources-unavailable cells with the `updates-*` hooks moved. (1 d, UI) | updates feature, states | G-UI | — |
| P3.2 | ⚑-design **Browse list and quick search** (V58, V62, X50; DS-ROW-2, DS-DIVIDER-3). Browse rows on the anatomy with description and downloads, aligned with Installed rows; quick-search groups with quick-pick separators and a `descriptionForeground` label, codicon chevrons; `browse-*` and `search-suggestions-*` cells. (1 d, UI) | search feature, SearchBox | G-UI | — |
| P3.3a | **PropertyList, GroupCaption and the details facts** (V29, V59, V61; DS-COPY-2, DS-TYPE-3). Two primitives; facts as a two-column property list with no colons and one value column; headings at 600. (1 d, UI) | 2 primitives, DetailsInfo, TransitiveDetails | G-UI | — |
| P3.3b | ⚑-design **Details header, actions and split** (V50, V57, X55, DETAILS-GRID; DS-INSET-4, DS-HEIGHT-5, DS-TYPE-7, DS-OVERFLOW-3/5, DS-STATE-7). `details-header` with a 20 px inset; a 36 px `details-tab-bar`; title 18/600; tab labels on the title's x; the actions grid with a minimum width and a wrap; split bounds in px; a disabled Update says why in text; `details-*` cells. (1 d, UI) | DetailsPane, Sash bounds, layout/* | G-UI | — |
| P3.4 | **README typography and details contrast** (V25, A5, A8, DETAILS-CONTRAST; a11y-text-contrast-all-states). README type on the ramp (body exempt); syntax colours on text roles; `readme-*` cells; the details-pane `incomplete` tolerance of `theme.ui.test.ts` removed. (0.75 d, UI) | ReadmeView, main.css README block, theme test | G-UI; `theme.ui.test.ts` green without the tolerance | — |
| P3.5 | ⚑-design **Dialogs and layers** (V19, X9, H74, H83, CA-R2; DS-DIVIDER-2). One dialog anatomy for ConfirmDialog (a list API), Multi Install, Bulk Uninstall and Update all; the scrim a literal black token at the workbench opacity (the tokens lint widened by one line); elevation only on layers; Popover retired through `.claude/.test-retire` (`Popover.tsx`, `Popover.test.tsx`) after a design-advisor ruling, or kept if the ruling says so. (1 d, UI) | dialogs, primitives, tokens (trigger 2) | G-UI | — |
| P3.6 | **Sources dialog** (H84, N82). SourceSettingsDialog and SourcesControl on the new primitives; remove-source confirm through ConfirmDialog; the add-source form forces clear text whenever the password contains a `%VAR%` placeholder anywhere, with a unit test; `source-settings-*` cells. (1 d, UI) | sources feature | G-UI; the N82 test green | — |
| P3.7a | ⚑-design **Sidebar sections and compact rows** (D47; V36, V60, X54, H39; DS-HEIGHT-1/2, DS-TYPE-5, DS-INSET-1/2/3, DS-DENSITY-1). Section headers at the look's pane-header height (22 classic, 28 Modern UI) with the host's casing; compact rows at 22 px (D47), name first; titles and names on the native header's x; both surfaces sort installed packages by id; the computed-style tests that pin rule text rewritten (named). (1 d, UI) | sidebar, Row compact | G-UI | — |
| P3.7b | ⚑ **Sidebar header content** (X15, X20, X47, X65, X66; SB2, SB10, SB13; DS-OVERFLOW-4, DS-COPY-5; A7). The active source's name on a header line; ≤ 4 view-title actions, the rest under `...` (`contributes.menus`); filter mode expands collapsed sections; the provisional badge on All Projects headers; no `0` beside a spinner (the test asserting "counts 0" rewritten, named). (1 d, UI) | sidebar, package.json | G-UI | universal trigger (`contributes`) |
| P3.7c | **Grouped list: sidebar Installed** (D48). `InstalledSection` and `ProjectPackages` render the sidebar's Installed section as one grouped list (folder captions and projects as group rows; the collapsed content stays mounted as `hidden`, as the main panel does). (1 d, UI) | sidebar | G-UI | — |
| P3.7d | **Grouped list: sidebar Updates** (D48). `UpdatesSection` and `ProjectUpdates` on the grouped list; the inline Update-all confirm replaced by the shared dialog body; one update-candidate rule for both surfaces. (1 d, UI) | sidebar | G-UI | — |
| P3.8 | **Sidebar Browse and states** (X22, X67; SB9, SB14; DS-STATE-1..4). Browse results with Uninstall and Delete on installed rows and no `+` where installed everywhere; the search box focused on first render; `sidebar-*` cells. (1 d, UI) | sidebar | G-UI | — |
| P3.9 | **Shared chrome** (V15, V16, V33, V56, V63). The sash a 1 px separator with a transparent hit area that highlights after 300 ms in `sash.hoverBorder`; scrollbars on P0.22's rules with the per-look thickness token (10 classic, 8 Modern UI); one divider role on both surfaces; high-contrast tabs and badges checked in both HC themes. (1 d, UI) | Sash, primitives.css, tokens (trigger 2) | G-UI | — |
| P3.10 | **State cells sweep** (X41, X49; DS-STATE-1..4, DS-HEIGHT-11). Every remaining screen × state cell (All Projects Updates, details, sources, sidebar Updates) with a marker and a Tier A capture; welcome-style empty states (left-aligned, 20 px side padding, at most one button); inline errors with one action; a 2 px bar where the work is. (1 d, UI) | features, states.ts | G-UI; §8.1 has no row left for P3 | — |
| P3.11 | **Microcopy** (X48, X56; DS-COPY-1/4). Title Case labels, sentence-case messages, `...` (three ASCII periods) on commands that open UI, one noun per field; `src/test/lint/microcopy.test.ts` over the TSX string literals. (0.5 d) | features, lint test | lint green; README key and command names unchanged or regenerated | — |
| P3.12 | **Leftover stylesheet debt** (V6, V21, V28, V30, V67, V70, H81; research §18: the store slices and `main.css:317-590` audited with the component audit's verdict table). Remaining per-surface patches deleted, duplicated blocks moved into primitives, cascade order fixed, the slice audit recorded in `src/webview/shared/STATUS.md`. (1 d, UI) | stylesheets, STATUS | G-UI; `css-audit-baseline.json` holds no entry owned by P1–P3 | — |

**P3 gate:** no baseline entry owned by P1–P3; every DS rule `hard` on every Tier A and Tier B state except those Appendix
B assigns to P4/P5; Tier B and `ui-macos` green; phase review.

### P4 — Interaction and accessibility (≈ 10.5 d)

| ID | Item | Inputs → Outputs | Gate | Ask |
|---|---|---|---|---|
| P4.1 | ⚑ **Polish contract bundle** (D39; ADR-011 Decision 2, ADR-013 Decisions 3–4; H15). Sentinel `UX-P4.1`: `ExtensionConfig` gains the three look values (each entry writes them onto `<html>` on `config/changed`); a contributed boolean setting for the delete confirmation (default on) in `ExtensionConfig` and a request that writes it; `projectPath?` on `ui/viewPackage`; `ui/contextMenu` removed (unsent since P2.9a); `docs/protocol.md` regenerated, `guards.ts` records, dependent tests; README settings table. (1 d) | `src/protocol/**`, host, entries, package.json | `npm run docs:protocol:check` → 0; host test `look change reaches an open webview`; `extension-config-settings.test.ts` green | universal trigger (`contributes`) |
| P4.2a | ⚑-design **Keyboard model: main panel and writes** (D31; ADR-013 Decisions 1–3; A1, A2, X13, X14, W8; a11y-enter-not-destructive). Enter selects and shows details on every main-panel list (Updates included); Ctrl/Cmd+Enter writes; Delete (Cmd+Backspace) confirms with `confirm-dialog-do-not-ask` (hook moved; the setting from P4.1); Delete on Updates rows; every key named in its list's hint; interaction model §5 and README keys updated; tests asserting a write on Enter rewritten (named); CHANGELOG `### Changed` breaking entry. (1 d, UI) | Listbox keymaps, main features | G-UI; `[keys]` paths green on every main list | — |
| P4.2b | **Keyboard model: sidebar Enter opens the main panel on the row** (D49; X17, X26; F8 folded in). Enter on a sidebar row (Installed, Updates, Browse) opens the main panel on the row's own tab and selects that row through `projectPath?` on `ui/viewPackage` (P4.1); the sidebar's Ctrl/Cmd+Enter and Delete as in P4.2a; the menu's "View Package Details" takes the same route. (1 d, UI) | sidebar, MainPanelHost, details | G-UI; harness scenario `sidebar Enter opens the row's own tab`; `[keys]` paths green on every sidebar list | — |
| P4.3 | **Search ↔ list and list keys** (ADR-013 Decision 6; SB7, X21, X35, A11, A12, A18). Ctrl/Cmd+DownArrow from a search box to its list's active row and Ctrl/Cmd+UpArrow back, both surfaces; PageUp/PageDown and type-ahead in `Listbox`; the combobox describes its hidden keys. (1 d, UI) | SearchBox, Listbox | G-UI | — |
| P4.4 | **Focus management** (A6, A15, A16; a11y-focus-after-close). Focus after a bulk confirm goes to the list, never `<body>`; the empty-list focus target gets a role, a name and a ring; links get the focus token; the jsdom guard `hard` everywhere. (0.5 d, UI) | features, primitives | G-UI; `npx vitest run` with no pending focus case | — |
| P4.5 | **Motion** (A4, V48; DS-MOTION-1/2, a11y-reduced-motion-both-signals). Transitions 100–150 ms ease-out; spinner 1.5 s steps(30); indeterminate progress 4 s; the runtime reduced-motion check `hard`. (0.5 d, UI) | tokens (trigger 2), primitives.css | G-UI | — |
| P4.6 | **Announcements and semantics** (A9, A10, A13, A14, A17, A19, A20; a11y-first-load-announced). Main-panel first loads announced (Installed, Updates, details, README); each outcome announced once on the surface that started it; README headings re-levelled under the pane's h2; hover contrast ≥ 4.5:1 in the light themes; a selected compact row marked in Dark High Contrast; Multi Install's reason tied to its check box. (1 d, UI) | features, LiveStatus | G-UI | — |
| P4.7 | ⚑-design **Operation feedback** (D50; ADR-013 Decision 7; X8, X40, X77; DS-STATE-5/6). Per D50: no toast for a single success (in-place state, `-ing` labels, live region, status bar); warnings, failures and bulk summaries keep toasts; queued and running look different on the row and in the status bar; `src/host/feedback.ts` tests rewritten (named). (1 d, UI) | host/feedback.ts, rows | G-UI; `feedback.test.ts` green | — |
| P4.8a | ⚑ **Provisional chunk merges into the authoritative list** (X7). Per-id merge in the installed slice (additions, versions and removals from the provisional chunk; evaluated-only fields kept); `installed.test.tsx` R5 and the sentence at `ARCHITECTURE.md:440-442` rewritten (named); a harness scenario for a save while the list is authoritative. (1 d) | store/installed, ARCHITECTURE | `npx vitest run --project frontend src/webview/shared/store` green; harness green | — |
| P4.8b | **Settling and revalidation cues** (X31, X76, X78, N81(a)). A settling row state between `ops/completed` and the key's next answer; streamed update rows inserted without re-sorting under the pointer; a 2 px bar on the first provisional list; `firstUsefulRender` under All Projects. (1 d, UI) | store/ops, updates, shells | G-UI | — |
| P4.9 | ⚑ **Perceived speed in core (cuttable)** (X32, X33, X43, X75). The provisional tier emits after the cached SDK probe and before the config walk (ADR-009 unchanged); the vulnerability data set warmed core-side with a bounded leg; All Projects asks lite metadata with the provisional rows; the sidebar's unused metadata request stops if P5.4 is cut (A11); benches updated, `npm run bench:save`. (1 d) | core/catalog, core/feeds, benches | `npm run bench` green; `[perf]` lines of P0.26 not worse | an ADR-009 change needed |
| P4.10 | **Forced colours and zoom** (research §18). A Tier B state at `window.zoomLevel` 2 and the forced-colours coverage of the tokens lint recorded; findings land as pending rules with an owner item. (0.5 d, UI) | states.ts, lint | G-UI | — |

**P4 gate:** every `a11y-*` rule `hard` except `a11y-sr-speech` (out of scope, A21 backlog); the §5 keyboard paths
walked on every screen; interaction model §5–§6 match the code; the polish contract bundle landed (or recorded as cut);
one Tier B dispatch and one `ui-macos` run green; phase review.

### P5 — Features (≈ 15.5 d) · each P5.x is cuttable by the owner at P2.11 or later

Order by user benefit (research §10; W5): F1 vulnerability truth, F2 deprecation and remediation, F3 Consolidate,
F7 sidebar vulnerability marks, F8 precise navigation (folded into P4.2b by D49), F4 promote transitive, F5 palette commands, F6 Restore and
Collapse/Expand, F9 Browse continuity, F10 mapping visibility, F11 one central-update confirmation. A cut feature's rows
become `skipped`; P5.0 bundles only the contracts of features still in scope.

| ID | Item | Inputs → Outputs | Gate | Ask |
|---|---|---|---|---|
| P5.0 | ⚑ **Feature contract bundle** (D38, D39, D56; H16, H41, H43). Sentinel `UX-P5.0`: `domain.ts` deprecation (reason, alternate package; installed and latest version) and a tri-state per-version vulnerability flag (absent = unknown); the bare-row `found` chunk on `search/query` (MB3, D56); ADR-009 amended for the installed-version registration read and the search chunk; `docs/protocol.md`, `guards.ts`, dependent tests. Carries only the parts of features still in scope; MB3's chunk always. (1 d) | `src/protocol/**`, ADR-009 | `npm run docs:protocol:check` → 0; `npx tsc --noEmit` → 0 | — |
| P5.1a | ⚑ **F1: unknown is not "none"** (G1, G2, H44). No allowed source with vulnerability data → the entry stays absent, the UI says "unknown"; transitive vulnerabilities counted in the Installed tab count, filterable, the section opens when one exists; All Projects through `enableTransitive`. (1 d, UI) | core/feeds/vulnerability, enricher, installed | G-UI; test `no vulnerability resource means unknown, not none` | — |
| P5.1b | **F1: severity on badges** (MI7, DP8, X24, V40). Highest severity and count on row badges in `problemsErrorIcon/WarningIcon/InfoIcon.foreground`, words and icon first. (0.5 d, UI) | Badge, rows | G-UI | — |
| P5.2a | ⚑ **F2: core deprecation and per-version flags** (G3, G4). The search response's latest-version deprecation; a registration read per enriched id for the installed version; per-version flags from the vulnerability resource; tests incl. "absent is unknown". (1 d) | core/feeds | backend tests green | — |
| P5.2b | ⚑-design **F2: deprecation and remediation in the UI** (G3, G4, W5). Deprecated rows and details (reason, alternate), vulnerable versions marked in the version selector, update rows naming the advisory they fix. (1 d, UI) | rows, details, updates | G-UI | — |
| P5.3a | **F3: Consolidate model** (G5). Version drift across projects under All Projects (central rows out, overrides in), through `ops/bulkUpdateAllProjects` with a version. (0.75 d) | store/allProjects | frontend tests green | — |
| P5.3b | ⚑-design **F3: Consolidate view** (G5). The view (place decided by the design-advisor, closest to Visual Studio's Consolidate tab within the workbench look). (0.75 d, UI) | updates feature | G-UI | — |
| P5.4 | **F7: sidebar vulnerability marks** (X19, X46, X57, X75, DP10). The sidebar renders the lite metadata it asks for (a vulnerability mark per row; no package icons in the 22 px compact rows of D47). (1 d, UI) | sidebar | G-UI | — |
| P5.5 | **F8: precise navigation** (X17, X26). Folded into P4.2b by D49 (round 1: A): the sidebar's Enter needs the same route. | — | — | — |
| P5.6 | **F4: promote a transitive package** (G6). A transitive row becomes a direct reference in a single project at its resolved version. (1 d, UI) | transitive, ops | G-UI; e2e on the e2e workspace | — |
| P5.7a | ⚑ **F5: palette commands** (G7). Six host commands (open, refresh, check updates, update all, install by id, restore) with tests and docs. (1 d) | extension.ts, package.json | `extension.test.ts` green; `npm run docs:check` → 0 | universal trigger (`contributes`) |
| P5.7b | ⚑ **F5: category and keybinding** (X16, G19). `category: "nUIget"` instead of the "nUIget: " title prefix; one keybinding to open the manager; README tables regenerated. (0.5 d) | package.json, README | `node scripts/check-readme.mjs` → 0 once P6.4a exists, else `docs:check` → 0 | universal trigger |
| P5.8 | **F6: Restore and Collapse/Expand all** (G10, X39, X58, X45, X82, RESTORE-HEADER, MI10, MU8). Restore project(s) in the header; Collapse all/Expand all on the Installed and All Projects Updates toolbars inside P2.5's overflow budget; CHANGELOG's "not back" sentence revised. (1 d, UI) | header, toolbars | G-UI | — |
| P5.9a | ⚑ **F9: Browse rows first** (D56; MB3, X23, X34). `Catalog.search` answers the bare-row `found` chunk of P5.0 before enrichment (with step 1 of the audit's fix: no redundant lookup for API rows); Browse renders the rows under the 2 px progress bar and fills icons and lookups as they arrive; `docs/perf-baseline.md` records the P7.2d rule as opened by the owner ahead of its trigger. Not cut with F9 (A11). (1 d, UI) | core/catalog, core/feeds/search, store/search, BrowseList, perf-baseline | G-UI; harness scenario `browse rows render before enrichment`; `[perf] search → first result` (P0.26) below its baseline | an ADR-009 change beyond P5.0's amendment |
| P5.9b | **F9: Browse continuity** (X74, X61, X63, X64, MB16, MB18, MB19, A11). A new search keeps the old results under the progress bar; the version selector follows the prerelease toggle with a bounded list; ArrowLeft/Right collapse and expand group rows (D48, P2.1c), so MB18's 1.x tab switching is not restored: the Details/README tabs keep their own arrow keys; the first Browse load announces. MB16 and MB19 move to P7.3 if this row is cut. (1 d, UI) | search, details | G-UI | — |
| P5.10a | ⚑ **F10: mapping contract** (G8). Sentinel `UX-P5.10a`: which sources a package may come from, on details and install; `docs/protocol.md`, guards, tests. (1 d) | `src/protocol/**`, core/feeds/policy | `npm run docs:protocol:check` → 0 | — |
| P5.10b | **F10: mapping in the UI** (G8). Shown in details and the install picker; no mapping writer (backlog). (1 d, UI) | details, MultiInstallDialog | G-UI | — |
| P5.11a | ⚑ **F11: one central-update confirmation, contract** (X9; ADR-013 Decision 4). Sentinel `UX-P5.11a`: a host-confirmed central-update request so the native menu, the details button and Ctrl+Enter share one confirmation. (0.5 d) | `src/protocol/**` | `npm run docs:protocol:check` → 0 | — |
| P5.11b | **F11: the shared confirmation** (X9). `CentralUpdateDialog` and the host modal unified per the advisor's ruling; gotcha "Central row without the preview" updated. (0.5 d, UI) | updates, host | G-UI | — |

**P5 gate (per feature):** its rows `done` or `skipped`; G-UI green; harness scenarios green; a CHANGELOG entry per
D40. **P5 phase gate:** after the last kept feature; one Tier B dispatch and one `ui-macos` run green; phase review.

### P6 — Marketplace-facing documentation (≈ 6.25 d)

`README.md` is the store page and `CHANGELOG.md` the release-notes tab, both for a user deciding whether to install.

| ID | Item | Inputs → Outputs | Gate | Ask |
|---|---|---|---|---|
| P6.1 | **Developer content gets a new home** (X4; LST-6). `.github/CONTRIBUTING.md` from README lines 257–276 and every other developer passage (build, test, architecture, plans, agent resources, gotchas pointers); nothing deleted without a new home; `docs:check` follows the moved tables. (0.5 d) | README, `.github/CONTRIBUTING.md` | `npm run docs:check` → 0; each moved block present in its new home (`grep`) | — |
| P6.2 | **Marketing captures** (X68, H65). A `marketing` set in `states.ts` (Dark Modern and Light Modern, panel 1200, sidebar 300, the dense fixture, cursor hidden, no focus ring unless the state is about focus) captured by the UI job on every push; `resources/readme/<state>.<theme>.png` from the artifact (≤ 882 px wide where the Details tab caps the body); `resources/readme/manifest.json` (image → state, source commit, screen files); `scripts/check-readme-images.mjs` fails when a screen file changed after an image's source commit or an image exceeds its budget; `.vscodeignore` excludes `resources/readme/**`. (1 d, UI) | states.ts, resources/readme, script, ci.yml, .vscodeignore | `node scripts/check-readme-images.mjs` → 0 in CI; `npm run check:vsix` green | — |
| P6.3 | **Hero GIF** (LST-5; H50, H54, H55). A `hero` sequence in `states.ts` (open, search, install, update all, sources); `scripts/render-hero.mjs` (pngjs 7 + gifenc 1.0.3, MIT, no dependencies): 5–24 s, ≤ 5 MB, frame timing and size budget in the script; `resources/readme/hero.gif`; no video. (1 d, UI) | states.ts, script, devDeps | the script prints duration and bytes inside the budget | — |
| P6.4a | **`scripts/check-readme.mjs` and generated tables** (LST-1..4, LST-6; H19, H52, H89). Fails on the forbidden headings and words (Development, Contributing, Architecture, Testing, Vitest, ExTester, esbuild, `docs/plans`, `CLAUDE.md`, `ARCHITECTURE.md`, ids such as `P9.`, `N1`, `V1`), relative links the published package would not resolve, images the Marketplace cannot render (`<svg>`, `data:`, non-HTTPS, SVG from untrusted hosts), a contributed setting or command missing from the tables, a length over budget; `scripts/gen-readme-tables.mjs` writes the tables from `package.json` `contributes` in the `docs:check` format; both in CI's Lint job. (0.75 d) | scripts, ci.yml | `node scripts/check-readme.mjs` runs and lists today's violations (the gate turns green in P6.4b) | — |
| P6.4b | ⚑-design **README rewritten from a blank page** (X5, X29, X71, W9). Hero block in the first screen (value proposition, hero GIF, install and Marketplace stats badges from allowed hosts); three or four feature sections in install-motivation order, each a one-sentence benefit and a framed capture; requirements (.NET SDK 10 as the user sees it); generated settings and commands tables; known limitations; privacy (no telemetry); support link; a short link to the repository. Judged in P6.5. (0.75 d) | README | `node scripts/check-readme.mjs` → 0; `npm run docs:check` → 0; `npx vsce ls` | — |
| P6.5 | **README preview and judge** (H18). A UI test opens nUIget's own Details tab in the Extensions view (marked 14 + DOMPurify, the reproducible renderer) and screenshots it in Dark Modern and Light Modern; `design-judge` scores it with the listing rubric (value clear in the first screen, scannable, consistent, professional). (0.75 d, UI) | UI test, states.ts | G-UI steps 4 and 6; zero blocking findings | — |
| P6.6 | **CHANGELOG 2.0.0 for users** (D21, D40; X6, X72, X82, W14). `## [2.0.0]` rewritten (breaking changes first with what to do; no item, finding or rule ids; no file names; `[Unreleased]` folded in); 1.x sections untouched; `scripts/check-changelog.mjs` in CI on every push (forbidden ids, source paths and internal names in any section incl. `[Unreleased]`, headings in the expected order, 1.x sections byte-identical to `origin/main`). (1 d) | CHANGELOG, script, ci.yml | `node scripts/check-changelog.mjs` → 0 locally and in CI | — |
| P6.7 | **Listing metadata** (X30, X69, X70, H53, H90, W6). `description` without "Visual Studio-style UI" within the Marketplace limit; `keywords` deduplicated (merged tags ≤ 30) covering CPM, vulnerabilities and project types; `categories`; `qna` → GitHub issues; `bugs.url`; `galleryBanner` colour from the Design System; `badges` from allowed hosts; the issue forms' stale source paths replaced. (0.5 d) | package.json, `.github/ISSUE_TEMPLATE/**` | `npx vsce ls` lists only what ships; `npm run package:vsix` and `npm run check:vsix` green | — |

**P6 gate:** `check-readme`, `check-changelog`, `check-readme-images` green in CI; the README preview judged with zero
blocking findings; phase review.

### P7 — Pre-release blockers and release (≈ 2.75 d)

| ID | Item | Inputs → Outputs | Gate | Ask |
|---|---|---|---|---|
| P7.1 | ⚑ **Icon breaker** (DP3; X2, V31). Suppression bounded in time; a source that ever answered `found` is never suppressed. (0.5 d) | core/feeds/icons.ts | tests `breaker expires` and `breaker never silences a source that answered found` green | — |
| P7.2 | **Release mechanics** (D41; RELEASE-MECHANICS, W3, W4, H51, H56, H63, LST-2). `ci.yml` packages `nuiget-v2.0.0-pre-release.vsix` with `--pre-release` as an artifact beside the regular one; `docs/release-checklist.md` rewritten for the 2.0.0 pre-release: the owner's squash merge, tag `v2.0.0` on the merged commit before publishing, `vsce publish --pre-release` with `--azure-credential` or `--oidc`, or the upload page (PATs retire 2026-12-01), README images pinned to the tag, `docs/images/nuiget.gif` kept for 1.18.9 installs, the ruleset's required-check rename (`E2E (1.85.0)` → `E2E (1.90.0)`) as the owner's first step, manual checks only the `manual-credentials` matrix rows. (1 d) | ci.yml, release-checklist | CI run lists both VSIX artifacts; `npm run docs:check` → 0 | — |
| P7.3 | **Closure** (§6). Ledger rows for every id closed; backlog rows verified; the regression matrix complete; ARCHITECTURE.md 2.0 section current; MB16/MB19 or the RESTORE-HEADER doc fallback applied if their features were cut (A11). (0.5 d) | ledger, matrix, ARCHITECTURE | `npm run check:matrix` → 0; `npm run docs:check` → 0 | — |
| P7.4 | **Second before/after page** (owner touchpoint 5). `node scripts/contact-sheet.mjs release …` → `docs/design/contact-sheets/release.html` + `.png`, including the README as the Extensions view renders it (P6.5) and the hero GIF; **stop**; a "not better" becomes a rule, then a `P7.fix-n` row. (0.5 d, UI) | contact sheet | the owner's answers recorded | — (stop) |
| P7.5 | **Release pull request**. Version stays 2.0.0; `## [2.0.0] - <date>`; `gh pr create --base main --head labs/ux` with the checklist and the contact-sheet link; **stop** for the owner, who first replaces the `main` ruleset's required check `E2E (1.85.0)` with `E2E (1.90.0)` (D54), then merges and publishes. (0.25 d) | PR | PR open; CI green on it | — (stop) |

**P7 gate:** both blockers closed (DP3, release mechanics); the owner's answers on `release` recorded and every "not
better" closed by a `P7.fix-n`; one Tier B dispatch and one `ui-macos` run green; the release PR open with CI green;
phase review before P7.5.

---

## 6. Tracker and ledger

- **Tracker:** `docs/plans/STATUS-ux.md`, one row per item in execution order (`| ID | Phase | Item | Status | Commit |
  Date | Notes |`), statuses `open`, `in-progress`, `done`, `blocked`, `skipped` (an owner decision, or an
  item folded into another) and `owner action`; a `## Phase gates` section (gate output, the advisors' verbatim answers, tags) and a
  `## Pending measurement rules` table (rule, helper, state group, flipping item) that every flip updates.
- **Ledger:** `docs/plans/findings-ledger.md` keeps its sections; the research letters (X, V6+, A, G, W, H) are listed
  in "How to read and maintain it" by the approval commit (else P0.3). The rows themselves are Appendix A of the
  research report; Appendix A of this plan records which item schedules or closes each id. A finding made during
  execution gets the next free id of its letter and a row in the ledger's section 4. Commits cite `UX-<item>` and the
  ids they close; P7.3 sets the statuses.
- **Triage of every 2.0.1 candidate** (research Appendix C, 48 rows, plus N41 and N72 that it found untriaged). No row
  stays unassigned:

| Bucket | Candidates |
|---|---|
| UX plan item | DP10 → P5.4 (P4.9 stops the request if F7 is cut) · MI7, DP8 → P5.1b · MI10, MU8 → P5.8 · MI12 → P2.6 · MB16, MB19 → P5.9b (to P7.3 if F9 is cut) · MB18 → P5.9b, closed by design (D48: Left/Right act on group rows) · SB2, SB10, SB13 → P3.7b · SB7 → P4.3 · SB9, SB14 → P3.8 · V1, V2 → P2.5 (V1's heights also P2.3, P2.4) · V3, V4 → P2.6 · V5 → P2.7 · N81(a) → P4.8b · N82 → P3.6 · RESTORE-HEADER → P5.8 (doc fallback in P7.3 if cut) · DETAILS-CONTRAST → P3.4 · DETAILS-GRID → P3.3b · MULTI-FOLDER → P0.6 · LIST-RENDER-ALL → P2.1a (research said backlog unless the list structure changes; P2.1a changes it) · ADR-008-AMEND → P1.2 (unless the approval commit did it) |
| Pre-release blocker (P7) | DP3 → P7.1 · RELEASE-MECHANICS → P7.2 |
| Owner, round 2 (decided 2026-10-23) | N64 → P0.9, closed by the `ui-floor` lane on 1.90.0 (D55) · MB3 → P5.9a, rows first (D56) |
| Post-release backlog (ledger rows by P0.29) | N19 · N81(b) · N84 · MI11 · MB13 · MB17 · MH9 (recent searches stay removed, D31) · P7.4 (screen-reader pass) · TF8-WATCHER · METADATA-HEAD · R21-TEST · R15-TEST · MATRIX-HOLES · DEP-SWEEP (noted by P0.4) · CACHED-FIDELITY · PR-TEMPLATE · N41 (repository rulesets, the owner's) · N72 (accepted at P7.2a) |

---

## 7. Estimate and risk

**Method** (brief §4): planned session-days per item; active hours at the measured 2.0 rates — 0.65 h per planned day
for tooling, core and docs items (P0–P8 of 2.0: 57.3 h for 88 days) and 1.1 h per planned day for items marked "UI"
(P9 of 2.0: 13.8 h for 12.5 days); cross-check 0.76 h per item (P9's measured rate per item); phase boundaries and fix
items ≈ 1 h per phase plus ≈ 0.25 h per feature mini-phase; sessions of 4–9 h (the 2.0 lengths, ended by compaction).

| Phase | Items | Session-days | of which UI | Active hours |
|---|---|---|---|---|
| P0 Harness | 32 + owner row | 24.5 | 17.25 | 23.7 |
| P1 Design System | 6 | 4.0 | 2.5 | 3.7 |
| P2 First slice (grouped list) | 18 | 17.0 | 14.0 | 17.4 |
| P3 Screens | 17 | 16.25 | 15.75 | 17.7 |
| P4 Interaction and a11y | 12 | 10.5 | 7.5 | 10.2 |
| P5 Features F1–F11 (F8 folded into P4.2b) | 18 (+1 skipped row) | 15.5 | 9.75 | 14.5 |
| P6 Listing | 8 | 6.25 | 2.75 | 5.3 |
| P7 Release | 5 | 2.75 | 0.5 | 2.0 |
| Boundaries and fix items | — | — | — | ≈ 10.5 (8 phases × 1 h + 10 mini-phases × 0.25 h) |
| **Total** | **116** (118 tracker rows) | **96.75** | **70.0** | **≈ 105** |

- **Rounds 1 and 2 are in these numbers:** D48's grouped list adds six one-day rows (P2.1c–P2.1f, P3.7c–P3.7d)
  against the research's +7.0 days (Listbox +2.0: P2.1a and P2.1c, P2.1f; eight consumers +5.0 over four rows of two
  consumers each); the seventh day is not planned and is left to the re-base. D49 folds F8 into polish (P4.2b, +1 day
  in P4, −1 in P5). D54's floor raise adds P0.5b (+1 day in P0); D56's rows-first Browse adds P5.9a (+1 day in P5); correcting and
  committing artboard A adds P0.27a (+0.5 day in P0).
- **Sessions:** ≈ 105 h is 12 sessions at 9 h, 27 at 4 h, ≈ 16 at the 2.0 mean of about 6.5 h.
- **Cross-check:** 116 items × 0.76 h = 88 h, plus boundaries ≈ 99 h: consistent with the day-based figure.
- **Against the brief's reference:** polish only (P0–P4, P6, P7) is 81.25 days ≈ 88 h with boundaries, against the
  reference 45–55 days ≈ 50–65 h: **+48 % to +81 %**. **P0 (24.5 days) is what pushes polish-only above the reference**
  (without it polish is 56.75 days, at the reference's top with the grouped list in); its three largest blocks are the
  measurement helpers P0.10–P0.13 (3.75 days), the harness script with the two negative controls and the judge probe
  P0.16–P0.19 (3.5 days) and the accessibility harness P0.23–P0.25 (2.75 days). Features are 15.5 days, inside the
  reference 15–20.
- **Re-base rule (P2.11):** after the first vertical slice, hours measured from `git log --reverse --format='%at %h %s'
  origin/main..HEAD` with gaps over 3 h removed; the remaining phases re-estimated at the measured rate; if the
  re-based total exceeds this plan's total (96.75 days, ≈ 105 h) by more than 50 % (> 145 days or > 158 h), the session
  stops and the owner cuts P5.x features. A "Re-base" subsection is appended here; §5 rows are not edited.

| Risk | Mitigation |
|---|---|
| Fable quota: a 57-agent Fable workflow burned a 5-hour window and paid usage | Saved workflows only (D45); ≤ 25 Fable agents per run, split by state; `design-judge` costs 4 agents per state; the advisors run in the background |
| Dependabot keeps moving `main` (and a red PR such as #31 stays open) | Merge `origin/main` at every session start; named ignore rules (P0.4); a red merge is fixed before any item; sessions never merge or close PRs |
| ExTester and VS Code version float (`max`, 1.138–1.140 declared) | `--code_version 1.140.0` pinned (D35); download cached; a bump is its own item that re-captures goldens and re-runs both negative controls |
| Modern UI experiment flips again or classic is removed | Follow the host (D23): both looks token-switched; Tier A has a classic pass; the attribute comes from the host's setting, not from a guess |
| Artboard export unverified on Linux (second window handle, colour profile, fonts) | P0.27 gate 0 before any script; saturated-pixel check; CI-to-CI only; fallback test-extension route sized by the advisor |
| Global Azure DevOps PATs retire 2026-12-01 | D41: `--azure-credential`, `--oidc` or the upload page in the rewritten checklist (P7.2) |
| Bundle ceilings (17 kB sidebar, 26 kB webview headroom) | Every webview item pastes the three sizes; a crossing is a stop-and-ask with the delta; no element library (D26); icons per bundle (ADR-012) |
| D48 grouped list (decided: +6 days in rows P2.1c–f, P3.7c–d; every list consumer rebuilt) | One item per consumer pair; the re-base after P2 measures it; features are cut before polish |
| CSP and the codicon font route | Inline SVG chosen (D27); the font route stays costed and is proven in a live webview at the floor before any switch |
| Floor raise to 1.90.0 (D54) | P0.5b lands early in P0; the E2E job downloads 1.90.0 (the N37/N65 handling and the `vscode-test` cache apply); the `ui-floor` lane runs outside ExTester's declared range and is informational until green twice; users on 1.85–1.89 keep 1.18.9 (README requirements, CHANGELOG `**Breaking:**`); the `main` ruleset's required check `E2E (1.85.0)` must become `E2E (1.90.0)` or the release PR cannot merge (owner action named in P7.5) |
| Flaky captures make `hard` rules red at random | Flake budget (two green runs of one SHA) before any rule is `hard`; masks for live content; the dense fixture is static |
| The judge is blind to small offsets (H35) | Geometry is the gate; the judge stays informational until D37 holds; every finding carries a disposition |
| The owner's two before/after pages surface "not better" late | Each "not better" becomes a failing rule first, then a fix row; the P2 page comes before the large phases |
| A capture or decision cites a gitignored or local artefact | `captures/<run-id>/` only, by run id and sha256; local DPR 2 captures never update goldens (§2.6) |

---

## Appendix A — Ledger crosswalk (where each research id lands)

Ids of research Appendix A by item. "Evidence" ids inform a decision and need no item; "backlog" ids get a ledger row
at P0.29.

| Item | Ids |
|---|---|
| P0.6 | H28, H72 |
| P0.7 | H1, H10, H24, H26, H32, H61, H66 |
| P0.8 | H20, H76, H77, X41, W7 |
| P0.9 | H25 |
| P0.10 | H8, H9, H33 |
| P0.11 | H34 |
| P0.15 | H27, H28, H76, H78 |
| P0.16 | H11 |
| P0.18 | V1–V5 (control) |
| P0.19 | H35 |
| P0.20 | H12, H36, H64, H79, H81, V6, V21 |
| P0.21 | H36, H69 |
| P0.22 | V15 |
| P0.23 | H17, H30, H31, H46, H47 |
| P0.24 | H29, H48, H86, H87 |
| P0.25 | H49, H88, W7 |
| P0.26 | H57, H58, H59, H60, H71 |
| P0.29 | H62, H93, H94 |
| P1.1 | V9, V14, V17, V49, V64, H6, H80 |
| P1.3 | H15 |
| P1.4a | V13, H22, H23, H75 |
| P1.4b | V51, V65 |
| P2.1a | V7, X37 |
| P2.1c | X11 |
| P2.1b | V26, V70, H40 |
| P2.2 | V10, V12, V22, V23, V27, V32, V35, V39, V66, V68, V69 |
| P2.3 | V18, V20, V29, V38, A7 |
| P2.4 | V24, V29 |
| P2.5 | V1, V2, V11, V37, V41, V46, V52, V56, X45 |
| P2.6 | V3, V4, V17, V33, V42, V43, V47, V53, V54, X3, X36, X60 |
| P2.7 | V5, V30, V44, V55, X38, H82 |
| P2.8a | V45, X51 |
| P2.8b | X3, X41, X49 |
| P2.9a | X1, X12, X18, H14, A3 |
| P2.9b | X25 |
| P3.1a | V8, X53 |
| P3.1b | X52 |
| P3.2 | V58, V62, X50 |
| P3.3a | V29, V59, V61 |
| P3.3b | V50, V57, X55 |
| P3.4 | V25, A5, A8 |
| P3.5 | V19, X9 (scrim; the unification is P5.11), H74, H83 |
| P3.6 | H84 |
| P3.7a | V36, V60, X54, H39 |
| P3.7b | X15, X20, X47, X65, X66 |
| P3.8 | X22, X67 |
| P3.9 | V15, V16, V33, V56, V63 |
| P3.10 | X41, X49 |
| P3.11 | X48, X56 |
| P3.12 | V6, V21, V28, V30, V67, V70, H81 |
| P4.1 | H15, H16, X26 (contract field) |
| P4.2a | A1, A2, X13, X14, W8 |
| P4.2b | X17, X26 |
| P4.3 | X21, X35, A11, A12, A18 |
| P4.4 | A6, A15, A16 |
| P4.5 | A4, V48 |
| P4.6 | A9, A10, A13, A14, A17, A19, A20 |
| P4.7 | X8, X40, X77 |
| P4.8a | X7 |
| P4.8b | X31, X76, X78 |
| P4.9 | X32, X33, X43, X75 (if F7 is cut) |
| P5.0 | H16, H41, H43 |
| P5.1a | G1, G2, H44 |
| P5.1b | X24, V40 |
| P5.2a, P5.2b | G3, G4, W5 |
| P5.3a, P5.3b | G5 |
| P5.4 | X19, X46, X57, X75 |
| P5.6 | G6 |
| P5.7a | G7 |
| P5.7b | X16, G19 |
| P5.8 | G10, X39, X45, X58, X82 |
| P5.9a | X23, X34 |
| P5.9b | X61, X63, X64, X74 |
| P5.10a, P5.10b | G8 |
| P5.11a, P5.11b | X9 |
| P6.1 | X4 |
| P6.2 | X68, H65 |
| P6.3 | H50, H54, H55 |
| P6.4a | H19, H52, H89 |
| P6.4b | X5, X29, X71, W9 |
| P6.5 | H18 |
| P6.6 | X6, X72, X82, W14 |
| P6.7 | X30, X69, X70, H53, H90, W6 |
| P7.1 | X2, V31 |
| P7.2 | W3, W4, H51, H56, H63 |
| Evidence (decisions, §4, §7) | X10, X27, X28, X44, V34, V71, W1, W2, W10, W12, W13, H2, H3, H4, H5, H7, H13, H21, H37, H38, H42, H45, H67, H68, H70, H73, H92, H95 |
| Post-release backlog | X42, X59, X62, X73, X79, X80, X81, A21, G9, G11, G12, G13, G14, G15, G16, G17, G18, G20, G21, W11, H85, H91 |

## Appendix B — Measurement rules at the end of P0 and the items that flip them

`hard` at P0: PF-2 (P0.12), PF-3a (P0.12), PF-3b (P0.11), PF-4 (P0.12), PF-5 (P0.11), PF-6 (P0.10); DS-ROW-4, DS-TYPE-1,
DS-TYPE-4, DS-TYPE-6, DS-COPY-3 (pass on the probe); `a11y-full-axe-real-page` (P0.23, details-pane `incomplete`
tolerated until P3.4). Every other rule lands `pending` with the items below (per state group; "main" = the main
panel's Installed states unless named). A rule that P0.14 finds green on today's tree is set `hard` by P0.18 and
recorded. Judge-only: V1's residual "looks squeezed", DS-DENSITY-2 under compact density, optical centring, DS-COPY-1
wording beyond casing.

| Rule | Helper | Catches | Flipped by |
|---|---|---|---|
| DS-GRID-1 | 1 gap membership | V5 | main: P2.7 · updates: P3.1b · browse: P3.2 · details: P3.3b · dialogs: P3.5 · sources: P3.6 · sidebar: P3.7a |
| DS-GRID-2a (block gaps, two values) | 1 | V1, V5 | main: P2.7 · then as DS-GRID-1 |
| DS-GRID-2b (header proximity) | 1 | V4 | main: P2.6 · then as DS-GRID-1 |
| DS-GRID-3 | lint | — | P1.1 |
| DS-INSET-1 | 2 shared insets (1 px) | — | main: P2.7 · details: P3.3b · sidebar: P3.7a |
| DS-INSET-2 | 2 | V2, V3, V5 | toolbars: P2.5 · headers: P2.6 · main header: P2.7 · sidebar: P3.7a |
| DS-INSET-3 | 6 containment | V2, V3 | rows: P2.2 · headers: P2.6 · sidebar: P3.7a |
| DS-INSET-4 | 2 | — | P3.3b |
| DS-HEIGHT-1, DS-HEIGHT-2 | 3 heights | — | P3.7a |
| DS-HEIGHT-3 | 3 | — | P2.2 |
| DS-HEIGHT-4 | 3 + parity | V1 | P2.5 |
| DS-HEIGHT-5 | 3 + parity | — | P3.3b |
| DS-HEIGHT-6 | 3 + parity | V1 | P2.3 |
| DS-HEIGHT-7 | 3 + parity | V1 | P2.4 |
| DS-HEIGHT-8 | 3, 7 target | — | P2.5 |
| DS-HEIGHT-9 | 3 | — | P2.3 |
| DS-HEIGHT-10 | 3 | — | P2.6 |
| DS-HEIGHT-11 | 3 | — | main: P2.8b · rest: P3.10 |
| DS-ROW-1, DS-ROW-3, DS-ROW-6 | 2, 4, 6 | V2 (ROW-3) | P2.2 |
| DS-ROW-2 | 2 | — | transitive: P2.8a · browse: P3.2 |
| DS-ROW-5 | 5 truncation | — | comfortable: P2.2 · compact: P3.7a |
| DS-TYPE-2 | computed styles | — | P1.1 (a state still red stays with its screen item) |
| DS-TYPE-3 | computed styles | — | P1.1 · details headings: P3.3a |
| DS-TYPE-5 | computed styles | — | groups: P2.6 · sidebar: P3.7a |
| DS-TYPE-7 | computed styles | — | panel title: P2.7 · details title: P3.3b |
| DS-ICON-1, DS-ICON-5 | lint | — | P1.4a |
| DS-ICON-2 | computed styles | — | P2.5 |
| DS-ICON-3 | 3 | — | P2.2 |
| DS-ICON-4 | computed styles | — | P1.4b |
| DS-COLOR-1 | computed colours vs dumps | — | main: P2.8b · each screen with its P3 item |
| DS-COLOR-2 (vacuous on the probe) | computed colours, unfocused-list state | — | P2.2 |
| DS-COLOR-3 | hover state | — | P2.5 |
| DS-COLOR-4 | computed colours | — | P2.5 |
| DS-COLOR-5 | computed colours | — | rows: P2.2 · tabs: P2.5 |
| DS-COLOR-6 | computed opacity and colours | V38 | text buttons (opacity 0.4): P2.3 · icon buttons and action labels (`disabledForeground`): P2.5 |
| DS-COLOR-7 | computed colours | — | P2.3 |
| DS-DENSITY-1 | 3 | — | main: P2.2 · sidebar: P3.7a |
| DS-OVERFLOW-1 | 5, 6 at minimum widths | — | main: P2.7 · details: P3.3b · sidebar: P3.7a |
| DS-OVERFLOW-2 (vacuous on the probe) | 6 | V3 | P2.6 |
| DS-OVERFLOW-3 | 6 at narrow widths | — | toolbars and tabs: P2.5 · details actions: P3.3b |
| DS-OVERFLOW-4 | workbench DOM | — | P3.7b |
| DS-OVERFLOW-5 | 6 at 220 px | — | P3.3b |
| DS-STATE-1..4 | markers + captures | — | main: P2.8b · updates: P3.1b · rest: P3.10 |
| DS-STATE-5, DS-STATE-6 | outcome states | — | P4.7 |
| DS-STATE-7 | text present | — | P2.8a · details: P3.3b |
| DS-FOCUS-1..4 | focus states | — | rows: P2.2 · controls: P2.3, P2.4 · tabs: P2.5 |
| DS-MOTION-1, DS-MOTION-2 | runtime check | — | P4.5 |
| DS-COPY-1, DS-COPY-4 | microcopy lint | — | P3.11 |
| DS-COPY-2 | text | — | P3.3a |
| DS-COPY-5 | text | — | main: P2.6 · sidebar: P3.7b |
| DS-DIVIDER-1 | computed borders | — | P2.2 |
| DS-DIVIDER-2 | computed shadows | — | P3.5 |
| DS-DIVIDER-3 | computed borders | — | P3.2 |
| DS-DIVIDER-4 | computed borders | — | P2.7 |
| MS-8 chrome still | 6 | P9.fix-2 class | `hard` at P0.12 for persistent chrome; the Installed↔Updates first-row y: P3.1b |
| a11y-focus-after-close | jsdom guard | A6 | P4.4 |
| a11y-enter-not-destructive | keyboard paths | A1, A2 | main lists: P4.2a · sidebar lists: P4.2b |
| a11y-hint-truthful | text | A3 | P2.9a |
| a11y-reduced-motion-both-signals | runtime check | A4 | P4.5 |
| a11y-text-contrast-all-states | axe contrast states | A8, A14 | README: P3.4 · hover: P4.6 |
| a11y-nontext-contrast | axe, offline lint | A7 | P2.3 |
| a11y-first-load-announced | live-region check | A9, MB19 | main: P4.6 · Browse: P5.9 |
| CA-R3 | `wc -l` | — | P2.7 |
| CA-R4 | lint (`ROW_HEIGHT` = token) | — | P2.1a |
| CA-R1, CA-R2, CA-R5 | lint gate; Popover; §8 lint | — | P3.12; P3.5; held from P0 by `interaction-model-testids.test.ts` |
| LST-1..4, LST-6 | `check-readme.mjs` | — | P6.4b |
| LST-2 | checklist and pinned URLs | — | P7.2 |
| LST-5 | `render-hero.mjs` budget | — | P6.3 |

## Appendix C — Owner touchpoints (verbatim from the brief, §4)

"My touchpoints, in full: (1) the §1 state report; (2) at most three design rounds (§3); (3) plan approval; (4) one
bundled settings patch at plan approval (every allow rule and `.claude/launch.json` entry the gates and the browser loop
need, including the browser note's unapplied patch), applied with one command; (5) a before/after page at most twice —
after the first vertical slice and before the release pull request — produced by `node scripts/contact-sheet.mjs` and
committed as `docs/design/contact-sheets/<checkpoint>.html` (+ `.png`): for each named state the 2.0 capture and the new
capture side by side at 1:1 (never downscaled; 1 px defects are the point), the judge verdict and the measurement
summary beneath, and under each pair the only question I answer, "better" or "not better"; a "not better" goes to the
design-advisor and the judge panel, who produce the defect list with coordinates, and **anything they or I name becomes
first a harness rule that fails on the current captures, then a fix item** — I never list defects and am never asked to
describe the same category twice; (6) starting each Opus session; (7) merging the release pull request and publishing.
Those pages are the only time I look at screenshots."

In this plan: (1)–(3) precede approval; (4) is P0.0; (5) is P2.10 and P7.4; (6) is §2.11 and RUN-ux §9; (7) is P7.5.
Additional stops that need the owner only when they occur: an `OWNER MUST DECIDE` ruling, an owner-action row (a
patch the session wrote), the re-base stop of P2.11, and a denied permission prompt.

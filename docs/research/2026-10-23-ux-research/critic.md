# Completeness critic: the nUIget UX-research sweep

Date 2026-10-23. Tree `/Users/mattias/github/nuiget` on `main` at `e4d6e97` (read-only). Research bundle under
`/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/` (`research/`,
`probe/out/`, `captures/39025149785/20261017T103410/`). Paths below are relative to those two roots unless absolute.

Every verdict here names what I opened. "Per draft, not re-verified" marks a fact I took from a refuter draft rather
than from the primary source.

## 0. Answer first

1. **The verification layer is the largest hole, and the narrative misstates it.** `research/verify-result.json`
   tallies `holds 14, corrected 126, refuted 0, unverifiable 2, missing 33` and carries `critic: null, floor: null,
   modern: null`. The 33 "missing" are every decision-relevant claim of three dimensions (performance 12,
   visual-audit 10, candidates-triage 11). On disk, batch 16 (performance) has all three lenses as JSON
   (`refute-batch16-evidence.json` and `batch16-counter-verdicts.json` at 02:16, before the 06:38 assembly;
   `verdicts-batch16-evidence.json` 06:52 and `verdicts-batch16-consequence.json` 06:55 after it) and its consequence lens holds **X33 `refuted`** and **X34
   `unverifiable`**; batch 18 (triage) has a counter JSON (`batch18-counter-verdicts.json`) plus evidence and
   consequence as Markdown drafts; batch 17 (visual-audit) never ran. `report-narrative.md:19` says "refuted none
   outright"; `report-narrative.md:4,10,103` cite "a completeness critic, a floor analysis and a Modern UI
   verification" and Appendices D–F, none of which exist (`ls research/` has no `critic.md`, `floor.md` or
   `modern-ui.md`; this file is the first).
2. **Nobody measured the look a real user of VS Code 1.142 sees.** Both the CI captures (1.140.0) and the local probe
   (1.142.0) are classic because ExTester injects `workbench.experimental.modernUI: false` and
   `workbench.enableExperiments: false` (`node_modules/vscode-extension-tester/out/util/codeUtil.js:196-197`) and
   launches with `--disable-experiments` (`out/browser.js:182`). The narrative's answer #2 ("the look to target is the
   classic workbench, measured on 1.142.0") rests on ExTester's VS Code, not on the host. `--code_settings` are
   merged on top of the injected defaults (`codeUtil.js:160`), so a Modern UI run is one settings key away and was not
   done. All 72 rules' `M` values are CSS-read, not measured.
3. **27 of 72 bound rules are not measurable from the probe, and the V3 state does not exist in it.** `rules-bound.md`
   §8 already lists the missing states (hover, keyboard focus, unfocused list, All Projects with a provisional badge,
   transitive expanded, narrow widths, empty/error/unsupported/revalidating, border colours, durations, `--nuiget-*`
   computed values, the top document's body class, Settings scope tabs and the Extension editor navbar, Modern UI).
   Three rules bind to a premise the exemplar itself fails (DS-GRID-2, DS-INSET-2, DS-FOCUS-3) and five "pass" by
   absence of the state that would fail them (DS-OVERFLOW-2, DS-COLOR-2, DS-ROW-2, DS-ROW-4, DS-COPY-3).
4. **Every bound workbench number is macOS, DPR 2, `-apple-system`; the gate runs on ubuntu, DPR 1.** The
   measurement report's own Lane column says text widths and line boxes are platform-dependent
   (`measurement.md:43`). The Design System would be written from numbers the CI lane has never produced.
5. **Ids drift between the reports and the ledger.** `feature-gaps.md` numbers its gaps G1–G21 by its own order
   (G1 = deprecation at `:214`, G3 = "reports none" at `:252`), the ledger renumbers them (G1 = none-vs-unknown,
   G3 = deprecation), and `architecture.md` §8.2 cites the report's numbering. `performance.md` uses X-1…X-14 and
   H1–H6, `accessibility.md` H1–H8, `candidates-triage.md` F1–F17; the ledger has them as X7…, H57…, H46…, V31….
   Listing R1–R6 collide with measurement R1–R10 (`rules-bound.json.duplicateIdsInOtherRules = ["R1".."R6"]`, and
   `gen-ledger.mjs` builds `ruleText` with `Object.fromEntries`, so one set silently overwrites the other).
6. **The letter scheme does not fit the repository ledger it claims to extend.** `docs/plans/findings-ledger.md:12-18`
   defines `U` user experience, `P` performance, `D` architecture smells, `T` tests and build, `N` new, `V` "visual
   findings of the owner's screenshot reviews", `C-<group>-n`. The sweep adds `X` (duplicating `U`), `H` (a catch-all
   that overlaps `T` and absorbs architecture, component-base, listing and bookkeeping rows) and extends `V` with
   agent findings. Listing has no letter and is spread over H, W and X.
7. **Competitor user signal fell between two dimensions**: `user-signal.md` §12 says it "would be G",
   `feature-gaps.md` gaps say it is "another dimension's letter, W". Nobody mined it. It is the only external voice
   on NuGet-in-VS-Code: `gh api repos/pcislo/vscode-nuget-gallery` answers 89 stars, 24 open issues, and
   `search/issues` counts 92 issues; the reviews API the user-signal dimension used for nUIget works for the peers.
8. **Costs come in three units and three rates with no conversion**: session-days (component-base, feature-gaps,
   triage, architecture), planned days at an assumed 1.1 h (component-audit), the measured 0.76 h per P9 item
   (H37's correction) and the plan's own 0.52 h per planned day (H37 counter lens, plan §7). Option B's prose says
   8–11 session-days, its own table sums to 8.5–12.0 (H2). Bundle headroom is quoted from two builds (CI
   551,394/333,913 in `run-39843006107.log:1646-1648`; local 548,943/333,252 from stale `node_modules`, per
   `batch16-counter-evidence.md:17-21`).

## 1. What is missing against the brief

| Brief item | Delivered | Missing (modality, source, verification, thinness) | Evidence |
|---|---|---|---|
| (1) Design rules with stable ids and a measurement each; V1–V5 mapped; gallery; costed component base | 72 `DS-*` rules + 39 other rules in `sweep-result.json.rules` (111), all with a `measurement` field; V mapping in `rules-bound.json.v`; a URL table of 23 exemplars; option C costed | No rendered gallery (the exemplars are URLs plus fetched CSS/README of 8 extensions in `research/exemplars/`); no Modern UI values measured; the 1.85 values never re-derived; `DS-ICON-5` and `DS-DENSITY-2` judge-only; the icon decision costed on one side (inline SVG only; the font route's bytes exist in `component-base.md:334` but no cost row) | `design-rules.md:418-447` ("not screenshotted"); `rules-bound.md:510-511`; `component-base.md:377-387` (C1–C5, no font row) |
| (2) Measurement ranked by signal-to-noise with CI vs local and cost per run | Ten techniques, a Lane column, run cost per technique, three CI runs compared | pixelmatch itself never executed (a stricter max-channel differ stood in); no vision-judge accuracy experiment; the keyboard walk and the in-frame a11y snapshot not prototyped; the local lane cost is not recorded although the probe ran three times on this Mac (`probe/out-run1`, `out-run3`, `out`); `measurement.md` §13 still lists "a local macOS ExTester run (not executed)" | `measurement.md:40-57`, `sweep-result.json` measurement gaps; `probe/` listing |
| (3) Code audit with keep/refactor/rebuild per primitive and feature | 46 units with verdicts and quarter-day costs; CSS baseline of 116 entries | Store slices (1,973 lines) "not read line by line; keep by default"; `tokens.css` beyond spacing and `main.css:317-590` README typography not audited; VS Code workbench source "not consulted" by component-audit (every list/tree comparison a hypothesis); costs not dry-run | `sweep-result.json` component-audit gaps; `component-audit.md:529-546` |
| (4) UX inventory and deviations | Screen × state matrix, action table, 20 deviations, IA trees, 890 strings | ARCHITECTURE.md 2.0 section, the ADRs and the plan not opened by this agent (D10, D14–D19 taken from the task text); sidebar All Projects and every dialog but one documented from code only | `sweep-result.json` ux-inventory notReachable |
| (5) Visual audit against the rules | V1–V5 traced to CSS and rules; 18 further findings | No DOM probe at the time of writing (the probe came later); no hover, focus, dialog, loading, empty, error, narrow-main, Modern UI or Chromium-114 render; Light Modern checked against `main@54d565d`, not 1.140's theme; **its ten decision-relevant claims (V14–V19, X9, V37–V39) were never refuted** (batch 17 absent) | `sweep-result.json` visual-audit gaps; `claim-batches.json` n=17; no `*batch17*` file |
| (6) Accessibility with automated substitutes for the screen-reader pass | 17 defects (A6 reproduced in jsdom), the coverage ledger, eight harness proposals H1–H8 | Zoom/reflow (1.4.4, 1.4.10) and text spacing (1.4.12) not examined; forced colours not emulated; All Projects tab order not read; hover/open-layer contrast computed, not measured; `a11y-sr-speech` has a manual measurement only; CDP into the webview frame (H1b) untested | `accessibility.md:452-470`; `sweep-result.json.rules` `a11y-sr-speech.measurement` = "manual NVDA/VoiceOver pass (P7.4)" |
| (7) Feature gaps vs Visual Studio, Rider, Marketplace | 21 gaps, VS 2026 / Rider 2026.2 / C# Dev Kit / 16 managers from their own README/manifest/source | Rider read through fetch summaries; two JetBrains blog posts 403, one help page 404; Rider's vulnerability, deprecation and CPM display unverified; no competitor installed or run; Open VSX not searched; the `webview/context` stable version "n/v" | `sweep-result.json` feature-gaps notReachable and gaps; `feature-gaps.md:583-600` |
| (8) User signal (issues, discussions, Marketplace, CHANGELOG) | All four for nUIget; 413 headlines classified; git log | **Competitor signal not mined** (see §0.7); Reddit/SO/Discord one search; the 15 captures and 12 reference JPEGs not viewed by this agent; CHANGELOG area counts ±10 % regex noise | `user-signal.md:381-394` |
| (9) Listing audit | README/CHANGELOG, vsce rules from source, three renderers, 32 peers measured, manifest fields | The Marketplace keep-list observed, not enumerated; pruning threshold unknown (> 37 KiB); Open VSX; whether the Marketplace reads SUPPORT.md; the "never sends a privately mapped id to nuget.org" claim taken from CHANGELOG:38, not code | `listing.md:456-468` |
| (10) Performance and perceived speed | jsdom scratch measurements, three CI logs, 14 symptoms, 6 harness proposals | **No Chromium timing at all** (bundle parse, mount, re-render, vulnerability download); sidebar and All Projects render counts unmeasured; the 2,323 ms local cold search unexplained; **its twelve decision-relevant claims were refuted on disk but never merged** (X33 refuted: the proposal does not follow; X34 unverifiable) | `performance.md:485-505`; `verdicts-batch16-consequence.json` |
| (11) Architecture constraints and contract impact | Per-proposal data path, wire, slice, host, core, contract, cost; native levers verified in 1.85 source | Runtime hypotheses: Shift+F10 → synthetic `contextmenu` → native menu; a relative `url()` in `dist/webview.css` under the resource scheme; `getState` after a `webview.html` reassignment; a webview view's badge in the Activity Bar; dynamic `import()` under the nonce CSP; per-proposal bundle deltas not measured | `architecture.md:441-462` |
| Triage into ux-item / pre-release-blocker / post-release-backlog | 48 rows, 26/2/18 | A fourth bucket `owner-decides` (N64, MB3) the brief did not define; open ledger rows the "2.0.1" grep misses (N41 open, N72 "P7.6 may reopen") untriaged; only 2 of 15 captures opened; **its eleven decision-relevant claims are refuted on disk as drafts only** (batch 18 evidence and consequence are `.md`, not merged) | `candidates-triage.md:48-64`; `docs/plans/findings-ledger.md:145,198`; `refute-b18-consequence-draft.md`, `refuter-evidence-batch18-draft.md` |

Modalities never run anywhere in the sweep: a Modern UI render; a hover, keyboard-focus, unfocused-list, narrow,
empty, error, unsupported, revalidating, dialog-over-editor or multi-folder state in the probe; a Chromium 114 (VS Code
1.85) render of the webviews (and none is possible under ExTester 8.28.1: `driverUtil.js:283-285` throws for
Chromium < 115, "ExTester requires VS Code 1.90 or newer"); a probe on the CI lane; a Windows or Linux probe at all;
pixelmatch; a vision-judge accuracy test; a screen reader; forced colours; a competitor product; an exemplar extension
(GitLens, GitHub PRs, Jupyter) rendered in the same session as nUIget.

## 2. The verification layer

| Fact | Evidence |
|---|---|
| 175 decision-relevant claims in 18 batches × 3 lenses | `claim-batches.json`; `verify-workflow.js:94-95` |
| `verify-result.json` written 06:38 with 33 `missing` (batches 16, 17, 18) | file mtime; `tally` |
| Batch 16: counter and evidence JSONs at 02:16 (before the assembly, yet dropped: the fold at `verify-workflow.js:105-109` iterates the in-memory `refutations` of `pipeline`, `:95`, not the `research/` directory); a second evidence run 06:52 and the consequence lens 06:55 after it. The two evidence runs disagree (02:16: holds 10, holds-with-correction 2; 06:52: holds 5, holds-with-correction 7). Consequence lens: 9 holds-with-correction, **1 refuted (X33)**, 1 unverifiable (X34), 1 holds | `ls -la research/*batch16* verify-result.json`; the four files |
| Batch 18: counter lens JSON (11 verdicts, 06:54); evidence and consequence as drafts (`refuter-evidence-batch18-draft.md`, `refute-b18-consequence-draft.md` 07:09) | file listing |
| Batch 17: no file of any lens | `ls research/ \| grep -i batch17` → nothing |
| `critic`, `floor`, `modern` are `null` | `verify-result.json` |
| Narrative claims "54 Fable refuters … corrected 126, confirmed 14, refuted none, left 2" (= 142 of 175) and Appendices D–F | `report-narrative.md:4-5,17-21,103` |
| §8, §13 and §15 of the narrative say "refutation of this batch pending" | `report-narrative.md:269,387,434` |

X33's refuted consequence (`verdicts-batch16-consequence.json`): "Drop the protocol split and the persisted advisory
map; instead warm the vulnerability data set core-side, bound its leg so a hung endpoint cannot hold the icons
(vulnerabilities absent, never []), add the sizes to H71, and put only the refresh/all re-download to the owner." The
narrative §13 still carries X33's original proposal by implication.

Also unreconciled: `design-rules.md:458` still lists "why 1.140.0 rendered classic despite the default" as an open
gap after H1's refuters answered it (ExTester's injection); the per-dimension reports were never updated with their
corrections, so the bundle ships texts that contradict Appendix A.

## 3. Contradictions between reports (and between reports and the probe)

| # | A | B | Resolution |
|---|---|---|---|
| C1 | `design-rules.md:109` DS-HEIGHT-3 "Today 78"; plan D15 "78 px" (`docs/plans/…execution-plan.md:528`) | Probe: the comfortable wrapper is **79** (`probe/out/nuiget/main-installed-single.json` `all[44]` `rect.h 79`, `minHeight 78px`); `visual-audit.md:316` pitch 79; V39; `rules-bound.md` DS-HEIGHT-3 nuiget 79 vs workbench 72 | The token is 78 (`tokens.css:33`) and `primitives.css:238-241` adds a 1 px bottom border outside it; the measurable quantity is the row pitch (79). DS-HEIGHT-3 must bind to the pitch including the line; D-A chooses 72 (Extensions) or a 78 + 1 card, not "78". |
| C2 | `design-rules.md` V10: Extensions icon 42 px (1.85) / 36 px (cur) | Probe 36 (`rules-bound.md:110-138`); V10's correction binds to 36 | 36 for the design; the 1.85 figure is CSS-read and unverifiable under ExTester (Chromium < 115 cannot run). |
| C3 | The brief: captures from "a 1.105-era build" | `research/ui-job.log:223` "Downloading VS Code: 1.140.0 / stable", `:231` ChromeDriver 150.0.7871.124; every report agrees | 1.140.0. Record VS Code, Chromium, runner image and the injected ExTester settings with every capture set (H24). |
| C4 | `report-narrative.md:19` "refuted none" | `verdicts-batch16-consequence.json` X33 `refuted` | Merge batch 16, restate §1 and §13. |
| C5 | `report-narrative.md:4,10,103,436-444` cite the critic, `floor.md`, `modern-ui.md`, Appendices D–F | `verify-result.json` `critic/floor/modern: null`; no such files | Run the Critic phase (`verify-workflow.js:98-101`); until then §16 and D-F are unsupported. |
| C6 | Narrative §3 bundle headroom from CI: 551,394 / 333,913 / 297,018 (`run-39843006107.log:1646-1648`) | H45, X44, `component-base.md:206`, `performance.md:437`: 548,943 / 333,252 (local; `batch16-counter-evidence.md:17-21` says the local `node_modules` was stale against the lockfile) | One measurement on `e4d6e97` after `npm ci` in a scratch clone; H4's headroom arithmetic (28,823 / 17,993) and option C's "stays inside the ceilings" need the CI base (26,372 / 17,332). |
| C7 | `ux-inventory.md:27-28`: `webview/context` stable since 1.72, release notes fetched | `architecture.md:446`: 1.72 notes not fetched, 1.85 source used; `feature-gaps.md:483-484`: version "n/v, believed below 1.85" | Settled by the two together (notes + `arch-src/webviewElement-1.85.ts`); write it once. Sidebar view: `ux-inventory.md:576` "not verified" vs `architecture.md:206` "verified in `webviewViewPane.ts:176-182`" → source-verified, runtime-unverified. |
| C8 | Context-menu cost 0.5–1 d (`feature-gaps.md:485`) | U1b 0.5 d + 0.25 d, U1a unpriced in the row (`architecture.md:280-281`); narrative 1–1.5 d (`:53,236`); component-audit "+1–1.5 d" | U1a at 1–1.5 d including the `Listbox` change (stop `preventDefault`, synthetic `contextmenu` for Shift+F10) and X25's busy-while-queued fix; the 1.85 handler returns on `defaultPrevented` only (`vscode-src/r185/index.html:1104-1108`, read). |
| C9 | `design-rules.md:146` DS-ICON-1 "same codicon release as the host"; DS-ICON-5 keeps two precedents (inline SVG, font) | V13's consequence lens: "same release as the host" is unsatisfiable (a 1.85 host draws pre-redraw glyphs, 1.142 post-redraw; the webview cannot load the host's font) → pin one; `component-base.md:330-336` decides inline SVG; H70/`architecture.md:405`: the font is admitted by `font-src` and blocked only for `@font-face` through the build, a `<link>` to `codicon.css` as the official sample does is open | DS-ICON-1 → "the pinned codicon release"; cost the font route (149,508 + 38,876 bytes under `resources/`, outside the JS ceilings) beside C1 before the decision is recorded. |
| C10 | `design-rules.md:310-311` "24 named codicons + 2 custom" (26) | `icons.tsx`: 23 `/** Codicon:` headers, 2 `/** Custom:`, 26 exports (`grep -c`); `component-base.md:233` "23 named codicons"; V13: Verified reuses the check path | 23 named + 1 alias (Verified) + 2 custom. |
| C11 | V13 counter lens: 5 pre-redraw verbatim, 5 redrawn, 13 none | H22 evidence lens: 4 verbatim pre-refresh (close, loading, link-external, add), 14 hand variants, 5 current | `icon-matches-final.txt`: pre-redraw 5 (close, **check**, loading, link-external, add), post-redraw 5, none 13. H22 omitted `check`. "18 of 23 differ from the current drawing" holds either way. |
| C12 | Costs in session-days (component-base §1, feature-gaps §1, triage §3, architecture §8) | Planned days at 1.1 h (`component-audit.md:20,224`); measured 0.76 h per P9 item and the plan's 0.52 h per planned day (H37 lenses) | One unit (session-day) and the measured rate range; option B is 8.5–12.0 by its own table (H2), not 8–11. |
| C13 | `rules-bound.md` DS-COLOR-2 **pass** | `design-rules.md` V12 and `css-audit.md` V23: selection ignores list focus, no inactive colour (`primitives.css:106-124` has no `:focus-within` condition; `listWidget.ts:922/963` scopes it) | The rule's unfocused half was never measured; the verdict is not-measurable, and by source it fails. |
| C14 | DS-OVERFLOW-2 **pass**, listed as V3's catching rule | `rules-bound.md:297-316`: the V3 state is not in the probe; `.nuiget-section-actions` has width 0 at the list's edge | not-measurable until `main-installed-all` is probed; V3 is mapped by proxy only. |
| C15 | A2: Enter is destructive "in two lists" | X13 and narrative §9: three (sidebar Browse Enter installs) | Three lists bind a write to Enter (install, update, uninstall); "destructive" is the wrong word for install. |
| C16 | Narrative §3: ExTester "accepts any version on the stable list (1.142.0 ran locally)" | `node_modules/vscode-extension-tester/out/util/driverUtil.js:283-285` throws for Chromium < 115: "ExTester requires VS Code 1.90 or newer" | Accepted ≥ 1.90 with a warning; 1.138–1.140 is the declared range; the 1.85 floor cannot render under ExTester (changes N64 option A). |
| C17 | `measurement.md` §13 / `sweep-result.json` notReachable: "A local macOS ExTester run (not executed)" | The probe ran ExTester locally three times (`probe/out-run1`, `out-run3`, `out`; `rules-bound.json.meta.probe`) | Sequencing; update §13 and record the run's wall time (none is recorded). |
| C18 | DS-HEIGHT-4 binds V1 to the Settings editor scope tabs (≈ 33, CSS-read) | `rules-bound.md:273-284` compares nUIget's 25 px strip to the **editor tab strip** (35); the Settings strip "not in the DOM dump"; H34: V1 has no in-page reference | Add `.settings-tabs-widget .action-item` and `.extension-editor .navbar` to `WORKBENCH_SPECS` and bind; until then V1's height rule is unmeasured. |
| C19 | V4 by ink: 11 above / 22 below (`design-rules.md:243`, `measurement.md:125`) | V4 by box: 4 / 12.44; by line box 8.27 / 16.71 (`rules-bound.md:318-330`); the workbench 10 / 6.4 is PNG + box | One frame for the rule (box) with the workbench measured in the same frame; ink stays informational. H33's "confirmed box pair" is still open. |
| C20 | Brief: three triage buckets | `candidates-triage.md:48-64` adds `owner-decides` (N64, MB3) | Keep rule 4 only with the owner question and the default bucket stated per row. |
| C21 | `gen-ledger.mjs:40`: letters "extend `docs/plans/findings-ledger.md` (X, V from V6, A, G, W, H)" | `docs/plans/findings-ledger.md:12-18`: U, P, D, T, N, V (= owner's screenshot reviews), C | Map before committing rows (see §4). |
| C22 | `user-signal.md:383-384`: competitor signal "would be G" | `feature-gaps.md` gaps: "another dimension's letter, W" | Assign to user-signal (W) in the next round. |
| C23 | `report-narrative.md:126,459`: `docs/design/design-system.md`, `docs/design/DECISIONS.md`; `gen-ledger.mjs:42`: `docs/research/2026-10-23-ux-research/` | `ls docs/design docs/research` → no such directories on `main` | Mark as "to be created" or cite the plan item that creates them. |

## 4. Ledger letters misassigned

The sweep's legend (`gen-ledger.mjs:16`): X = UX and interaction, V = Visual, A = Accessibility, G = Feature gaps,
W = User signal, H = Measurement, harness and tooling. Letter by dimension (from `sweep-result.json.findings`):
design-rules H2/V19/X6; component-base H13/X1/V3; measurement H21; css-audit V9/H8; component-audit V10/X4/H7;
ux-inventory X11/A2; feature-gaps G21/X19; architecture H10/X3; accessibility A18/H8; user-signal W10/X3; listing
H12/W4/X11; performance X16/H6; visual-audit V23/X2; candidates-triage V2/H8/X6/A1.

| Rows | Assigned | Why it is wrong | Better |
|---|---|---|---|
| H2–H7, H21–H24 (component-base decision, listbox contract, bundle delta, jsdom, size tokens, Dependabot drift, Chromium 114, icons, licence, capture baseline) | H | Decisions about the component base and its licence, not measurement or harness | an architecture/decision letter (the repo's `D`, or a new one); H24 and H21 may stay H |
| H14–H16, H41–H45, H70, H85 (native chrome levers, settings contract, contract inventory, row content, procedure cost, hidden contracts, G2 cost, bundle ceilings, CSP, persisted state) | H | Architecture constraints | `D` (architecture) |
| H18–H19, H50–H56, H65, H89–H90 (renderers, vsce rules, video, link rewriting, docs:check, keywords, GIF tooling, hero GIF, PATs, image size, pruning, SUPPORT.md) | H | Listing and release mechanics; "tooling" only by stretch | a listing letter (`L`) |
| H37, H82, H83, H84 (cost model, MainShell size, dead code, docs drift) | H | Code quality and bookkeeping | `D` / `T` |
| H62, H63, H92–H95 (backlog bookkeeping, release checklist, brief accuracy, ledger hygiene, CI gating) | H | Process and release, not measurement | `T` or a process note, not a finding letter |
| X4–X6, X29–X30, X68–X73 (README content, CHANGELOG, structure, positioning, images, qna, keywords, icon) | X | Listing content, not interaction | `L` |
| W3, W4, W9, W14 (live listing, image hosting, peers' listings, "Works with") | W | Listing state and peers, not user signal | `L` (W9 may stay W) |
| X7, X31–X34, X37, X38, X43, X44, X74–X80 (perceived speed, virtualization, re-renders, bundle, request order) | X | Performance; the repo already has `P` | `P` (X74, X77, X78 are interaction and may stay X) |
| X41 (captures show only ready states), X82 (CHANGELOG coupling) | X | Harness and process | H / T |
| X53 (`useInstallAction` ×3, `CentralUpdateDialog` ×6) | X | Code structure | `D` |
| V6, V7, V8, V21, V24, V26–V30, V64, V67–V70 (override rules, virtualization contract, Updates tab duplicated, cascade, missing primitives, Listbox↔Row coupling, duplication, unused tokens, density prop, layout leaks) | V | Code structure of stylesheets and components; nothing visual is asserted | `D` |
| V31 (DP3 icon breaker blast radius, core feeds) | V | Core correctness | `P`/`N` (it is a triage row with `sourceIds: DP3`) |
| A5 (details-pane contrast never measured) | A | Harness coverage | H |
| A1 (Enter on main Updates updates) duplicates X13/A2 | A | Same defect under two letters | one id, cross-referenced |
| G1 (`[]` recorded when no source carries vulnerability data) | G | A correctness defect against the repository's own "empty is not unknown" rule, not a competitor gap; I verified the mechanism: `src/core/feeds/vulnerability.ts:107-108,122` (`withData` empty → `data` `[]` → `sourcesUnavailable: false`) and `src/core/feeds/enricher.ts:71-73` (`lite.vulnerabilities = known.vulnerabilities`) | `N` (new defect) with a G cross-reference |

Duplicates across letters with no cross-reference (`sourceIds` is set on only 13 of 299 rows): X1/X12/X18/A3 (no
main-panel menu), A1/A2/X13 (Enter writes), X39/G10 (Restore), X41/H20 (capture states), V13/H22 (icon drawings),
V9/H6 (token aliasing), H1/H24/H26 (captures are 1.140), X40/A10 (triple feedback), X33/X75/DP10 (sidebar metadata),
H25/H61 (ExTester cannot render the floor), W10 and X20–X24/X57–X67 (open parity rows).

## 5. Rules that lack a measurement or catch nothing

| Rule(s) | Problem | Evidence |
|---|---|---|
| DS-GRID-2 ({4, 8} block gaps) | The exemplar fails it: the Extensions view measures 5 and 10 | `rules-bound.md:357-361,537-541` |
| DS-INSET-2 (symmetric insets) | The Extensions header pads 5/12/6/20; the Settings item 12/14/18/14; only `setting-item` is symmetric | `rules-bound.md:541-543` |
| DS-FOCUS-3 (keyboard-only focus ring) | The classic list paints `1px solid #0078d4` after a WebDriver click | `probe/out/workbench/extensions-states.json` `selected.outline` (read); `rules-bound.md:544-546` |
| DS-OVERFLOW-2 | "pass" without the only state (V3) that would fail it | `rules-bound.md:297-316` |
| DS-COLOR-2 | "pass" on the focused half; the unfocused half unmeasured and failing by source (V23) | `rules-bound.json` DS-COLOR-2 note; `css-audit.md` V23 |
| DS-ROW-2, DS-ROW-4, DS-COPY-3 | pass on one row kind, one action, one message | `rules-bound.json` notes ("Only direct rows were on screen", "one action per row", "One message captured") |
| DS-FOCUS-2 | Cannot discriminate: `list.focusOutline` = `focusBorder` in all four default themes | `rules-bound.json` DS-FOCUS-2 note |
| DS-ICON-4 | Colour cannot tell `textLink.foreground` from `extensionIcon.verifiedForeground`; the glyph is not a probe field | `rules-bound.json` DS-ICON-4 note |
| DS-COPY-1 | The regex as written ("every word of 4+ letters capitalised") lets "Select all" pass and is not Title Case | `rules-bound.json` DS-COPY-1 note |
| DS-HEIGHT-4, DS-HEIGHT-5, DS-INSET-4 | Exemplar element not in `WORKBENCH_SPECS` (Settings scope tabs, Extension editor navbar and header) | `rules-bound.md:603-618` |
| DS-HEIGHT-7 | The reference is a range (25–26) across Search, Extensions, Settings and quick-input boxes; the 28 px `.search-box` of design-rules is not the rendered control | `rules-bound.md:524-526` |
| DS-DENSITY-1, DS-ICON-3 | Redundant: measured entirely by DS-HEIGHT-2/3 and DS-ROW-1/6 | `sweep-result.json.rules` measurement text |
| DS-STATE-1 | Measures the harness ("each cell has a `data-testid` and a named capture"), not the design | same |
| DS-ICON-1 | "Same codicon release as the host" cannot be satisfied by any shipped asset | V13 consequence lens |
| DS-ICON-5, DS-DENSITY-2 | Judge-only by construction | `sweep-result.json` design-rules summary |
| `a11y-sr-speech` | Measurement is "manual NVDA/VoiceOver pass (P7.4)", which the brief asked to substitute | `sweep-result.json.rules` |
| 15 lint-type rules marked `not-measurable-from-probe` (`pxLength`…`disableComment`, CA-R1…R5, `icons-match-pinned-codicons`, the token rules, listing R1–R6) | Measured elsewhere (the css-audit baseline, `wc -l` of MainShell = 308, `ROW_HEIGHT` vs tokens); the verdict column conflates "needs another instrument" with "unmeasured" | `rules-bound.md:555-601`; `css-audit-work/baseline.json` |
| Listing R1–R6 vs measurement R1–R10 | Duplicate ids; `gen-ledger.mjs:63` `Object.fromEntries` keeps one set | `rules-bound.json.duplicateIdsInOtherRules` |
| 6 `workbenchRef.value` and 14 `nuigetRef.value` fields are objects | `gen-ledger.mjs:66` interpolates them → "[object Object]" in Appendix B (DS-GRID-1/2, DS-TYPE-2/3, DS-ICON-4, DS-COPY-1; DS-INSET-1/2/3, DS-ROW-2/3, DS-OVERFLOW-1, DS-STATE-1, DS-COPY-2, DS-DIVIDER-1/2 …) | `node -e` over `rules-bound.json` (run) |

## 6. V1–V5 mapping, weakest first

| V | Mapped to | Weakness |
|---|---|---|
| **V3** (badge on the list border) | DS-INSET-3, DS-OVERFLOW-2 | No probe state has the badge (`main-installed-all`, `main-transitive-expanded` not captured); DS-INSET-3 fails on a proxy (`.nuiget-section-actions` width 0 at x 931), DS-OVERFLOW-2 passes vacuously. The CI PNG `main-installed-all.png` shows it, the DOM does not. |
| **V4** (header margins) | DS-GRID-2(b) only; R4 is a "Candidate" | Three measurement frames disagree in magnitude (ink 11/22, box 4/12.4, line box 8.3/16.7); the workbench pane header has the opposite asymmetry (10 above, 6.4 below), so "symmetric" is not what the exemplar does; no proximity rule is bound; H33's confirmed box pair is open. |
| **V5** (no single scale) | DS-GRID-1, DS-GRID-2(a), DS-INSET-2 | DS-GRID-2's {4, 8} and DS-INSET-2's symmetry are premises the exemplar fails (§5); `rules-bound.md:349-351` says "the workbench does not use a single scale either … a nUIget scale is a design decision". The rule can only fail nUIget by a choice the Design System has not yet made. |
| **V1** (squeezed) | DS-HEIGHT-4/6/7, DS-GRID-2 | DS-HEIGHT-4's exemplar was never measured (C18); the comparison used the 35 px editor tab strip, which is not an in-editor scope tab; H34 says V1 has no in-page reference; the narrative itself keeps a judge-only residual ("still looks squeezed after the heights match"). |
| **V2** (misaligned) | DS-INSET-2/3, DS-ROW-3 | Sound and measured (16/6, band to 907 vs actions to 931), but the shipped gate still tolerates 8 px where V2 is 6 px (H9; `main-installed.ui.test.ts:101` per H9's lens), and DS-ROW-3's "actions inside the band" is decision D-A, not a measurement. |

## 7. Next research round

Priority: **must** before the Design System or the plan is written; **should** before the plan's P0; **could** later.

| # | Priority | Gap | How (agent, files, command) |
|---|---|---|---|
| 1 | must | Merge batch 16, finish batch 18, run batch 17, regenerate the tally and the ledger; restate the narrative | Refuter agents (`verify-workflow.js:75-77` prompt) for batches 17 and 18 (ids from `claim-batches.json` n=17, 18); merge from the on-disk `*batch*.json` files by id with a small script (the fold at `verify-workflow.js:105-124` iterates the in-memory `refutations` of `pipeline`, not `research/`, so a plain re-run or resume loses them again), preferring the later evidence run (06:52) per id or reconciling the two where they disagree; write `verify-result.json`; `node gen-ledger.mjs <scratchpad> <out-md> report-narrative.md`; edit `report-narrative.md:17-21,269,387,434` and §13 for X33. |
| 2 | must | Produce `floor.md` and `modern-ui.md` (the narrative cites both) | Two agents with the `floor` and `modern` prompts of `verify-workflow.js:84-92`; write to `research/`; then §16 and D-F of the narrative. |
| 3 | must | A Modern UI probe run, and the pin decision | Probe agent: copy `probe/zz-probe.ui.test.ts`; run `extest` with `--code_settings` of a file containing `"workbench.experimental.modernUI": true` (merged on top of ExTester's defaults, `codeUtil.js:160`); record `document.body.className` of the top document and the pane-header/quick-input/button metrics; rerun `rb-tools/bind.py` to fill the `M` column; decide which look `src/test/ui/settings.json` pins (and capture both). |
| 4 | must | Re-probe the missing states (27 rules, V3) | Probe agent on `probe/zz-probe.ui.test.ts` with `rules-bound.md` §8 as the spec: `main-installed-all` with a provisional badge, `main-transitive-expanded`, hover/focus/unfocused list, sidebar 170/200/250 and main 220/400/600, empty/error/unsupported/revalidating fixtures, `borderBottomColor`, durations, `--nuiget-*` computed values, `.settings-tabs-widget .action-item` and `.extension-editor .navbar` in `WORKBENCH_SPECS`; rerun `bind.py`. |
| 5 | must | Run the probe on the CI lane (ubuntu, DPR 1) and bind twice | A workflow run on a labs branch that adds `zz-probe` to the UI job once (or `workflow_dispatch`), uploading `probe/out` as an artefact; `bind.py` with `--lane ubuntu`; the Design System cites both columns and marks platform-dependent rules (DS-TYPE-2/4, DS-ROW-5). |
| 6 | must | Crosswalk report-internal ids to ledger ids; resolve R1–R6 | Synthesis agent: a `## Ids` header in `feature-gaps.md` (G report→ledger), `architecture.md` §8.2, `performance.md` (X-n/H-n), `accessibility.md` (H1–H8), `candidates-triage.md` (F1–F17); rename listing rules `LST-1..6` and measurement `MS-1..10` in `rules.json`, `rules-bound.json.otherRules` (fill `dimension`), `gen-ledger.mjs`; set `sourceIds` on the duplicate rows of §4. |
| 7 | must | Fix the rule premises and vacuous passes before adoption | Rules agent on `rules.json`/`design-rules.md` §3: turn DS-GRID-2, DS-INSET-2, DS-FOCUS-3 into decision rows (closest-to-the-workbench: 5/10 gaps? asymmetric headers? click outline?) with the measurement that follows the decision; DS-ICON-1 → pinned release; DS-COLOR-2/DS-OVERFLOW-2/DS-ROW-2/4/DS-COPY-3 → `not-measurable` until #4; DS-COPY-1 regex rewritten; DS-HEIGHT-7 one exemplar; drop DS-DENSITY-1 and DS-ICON-3 as redundant or mark derived. |
| 8 | must | Mine competitor user signal | User-signal agent: `gh issue list -R pcislo/vscode-nuget-gallery --state all --limit 200 --json number,title,state,labels,body,comments`; the reviews API with the publisher/extension of each peer (`…/publishers/patcx/extensions/vscode-nuget-gallery/reviews?count=100`, same endpoint as `user-signal.md` §1 row 7); NuGet Package Manager GUI and C# Dev Kit (`dotnet/vscode-csharp` issues labelled nuget); classify by the W/G areas; letter W. |
| 9 | should | One cost unit and rate | Synthesis agent: convert every cost to session-days; state the rate range (0.52 h plan, 0.76 h measured, 1.1 h assumed); fix option B to 8.5–12.0; restate narrative §1 items 3–4, §6, §17 D-C. |
| 10 | should | One bundle base | `git clone` to a scratch directory, `npm ci`, `node esbuild.mjs --production --analyze` on `e4d6e97`; correct H4/H45/X44/component-base §2.8 and the narrative §3 row to one set; the option C "+6,203 / +2,834" delta re-measured on the same base. |
| 11 | should | Settle the context-menu runtime path and cost | Implementing session on a labs branch (the only way to exercise it): one `webview/context` item + `data-vscode-context` on the `Row` wrapper + `Listbox` leaving `preventDefault` alone; assert in the `E2E (1.85.0)` job that the command receives `{…context, webview}`; try the synthetic `contextmenu` for Shift+F10 in the sidebar view too; record the cost against U1a. |
| 12 | should | Cost the font route for icons; recount | Component-base agent: a C1′ row (codicon.css + codicon.ttf under `resources/`, `<link>` via `asWebviewUri`, `font-src ${cspSource}`, VSIX allow-list, 1.85 behaviour, the DS-ICON-1 lint on glyph names); `grep -c '/\*\* Codicon:' src/webview/shared/primitives/icons.tsx` (23) for every count. |
| 13 | should | Corrections folded back into the per-dimension reports | `gen-ledger.mjs` emits `corrections-<dimension>.md` from `verify-result.json` (id, lens, correction) and each report gets a one-line pointer under its title; `design-rules.md:458` and `feature-gaps.md:483-484` updated by hand. |
| 14 | should | Letter scheme reconciled with `docs/plans/findings-ledger.md` | Synthesis agent proposes the mapping of §4 (X→U, performance→P, architecture and code→D, harness→T, listing→L) or adds the new letters to the ledger's "How to read" with definitions; applied before any row is committed. |
| 15 | should | Audit what component-audit skipped | Component-audit agent: `src/webview/shared/store/*.ts(x)` (1,973 lines), `tokens.css` whole, `main.css:317-590`, with the same keep/refactor/rebuild table and the workbench list source (`vscode-src/listWidget.ts`, `abstractTree.ts`) consulted for the list-model decision D-C. |
| 16 | should | Performance timed in Chromium, not jsdom | Probe agent: performance §10 H2/H3 as a probe extension (in-frame `MutationObserver` + `performance.now()` for panel open → first row → authoritative → icons; search keystroke → suggestions); `nuiget.enablePerformanceLogging` in a fixture `.vscode/settings.json`; replace X33's proposal with the refuted-lens alternative. |
| 17 | should | Triage completeness | Triage agent: rows for N41 (open, owner) and N72 ("P7.6 may reopen"); restate `owner-decides` rows (N64, MB3) with the owner question and the default bucket; the 14 STATUS-only candidates get ledger rows. |
| 18 | should | ExTester floor stated correctly | Fold into `floor.md`: ExTester 8.28.1 runs VS Code ≥ 1.90 only (`driverUtil.js:283-285`); N64 option A needs a non-ExTester route (Chrome for Testing 114 + Puppeteer, per the batch-18 draft, not re-verified). |
| 19 | could | pixelmatch executed; vision judge tested | `npm i pixelmatch pngjs` in a scratch directory (not the repo); diff `captures/39025149785` against `runs/39042850237/shots` with the documented options; one controlled vision-judge run on five crops with known 2–8 px offsets. |
| 20 | could | Exemplar gallery rendered | Probe agent installs GitLens, GitHub Pull Requests and Jupyter into the probe's ExTester profile (`extest install-from-marketplace`) and screenshots their webviews beside nUIget at the same DPR; annotate the 23 URLs with crops. |
| 21 | could | Accessibility modalities | Forced colours via `driver.sendAndGetDevToolsCommand('Emulation.setEmulatedMedia', {features:[{name:'forced-colors',value:'active'}]})` on the top page (H31: routing into the frame unverified); zoom 200 % and 320 px reflow states in the probe; All Projects tab order walk. |
| 22 | could | Rider and Marketplace gaps | WebFetch the two 403 JetBrains posts through `web.archive.org`; the Rider help index for vulnerability/deprecation/CPM; Open VSX search `nuget`; the Marketplace pruning threshold by bisecting a peer README length from the `IsMDPruned` field. |
| 23 | could | Appendix B rendering | `gen-ledger.mjs:66`: `JSON.stringify` object-valued `workbenchRef.value`/`nuigetRef.value`; `report-narrative.md` marks `docs/design/*` and `docs/research/*` as to-be-created. |

## 8. What I opened

Reports: all 14 (`grep -n '^#'` of each; full text of `report-narrative.md`, `rules-bound.md` §4/§6/§8,
`measurement.md:40-57`, `design-rules.md:297-320,418-447`, `architecture.md:276-284`, `feature-gaps.md:475-486`,
`candidates-triage.md:34-64`, `user-signal.md:34-57,146-151,381-394`, `accessibility.md:427-452`,
`performance.md:461-472`, `synthesis-notes.md`). Structured: `sweep-result.json` (dimensions, 299 findings, 111 rules,
48 triage rows), `claims.json` (175), `claim-batches.json`, `verify-result.json`, every `*batch*.json` and refuter
draft, `ledger.json`, `gen-ledger.mjs`, `verify-workflow.js`, `rules-bound.json`, `icon-matches-final.txt`,
`compare-icons-final.mjs`. Probe: the `out/` tree, `nuiget/main-installed-single.json` (`all[44]`, `__document`),
`workbench/extensions.json` (`ext_rows[0]` 72, `pane_headers[0]` 22, `tabs[0]` 35), `workbench/settings.json`
(`buttons[0]` 26), `workbench/extensions-states.json`, `themes/dark-modern.json` (`bodyClass`, 36 size tokens).
Logs: `ui-job.log:215-234`, `run-39843006107.log:1334-1648`. Repository (read-only): `src/webview/shared/tokens.css`,
`primitives.css:84-100,234-248`, `icons.tsx` header counts, `Listbox.tsx`/sidebar `onContextMenu` grep,
`src/core/feeds/vulnerability.ts:100-125`, `enricher.ts:65-80`, `src/test/ui/settings.json`, `esbuild.mjs:24`,
`docs/ux/interaction-model.md:80-100`, `docs/plans/findings-ledger.md:12-28,145,188-192,198,461-473`,
`docs/plans/STATUS.md:106`, the plan's D15 line, `node_modules/vscode-extension-tester/out/util/codeUtil.js:160,186-215`,
`out/util/driverUtil.js:278-290`, `out/browser.js:182`, its `package.json` (8.28.1, 1.138.0–1.140.0),
`package-lock.json:9810-9811`, `vscode-src/r185/index.html:1098-1112`. GitHub: `gh api repos/pcislo/vscode-nuget-gallery`
and `search/issues` (92). Not opened: the capture PNGs and the probe screenshots (no claim here rests on a picture);
`theme-color-live.md`; the Markdown lens drafts beyond batches 16 and 18.

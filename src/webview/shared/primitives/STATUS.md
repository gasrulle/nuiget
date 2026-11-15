# STATUS — src/webview/shared/primitives (UX-P3.fix-13)   commit de27fe0 (proving push; 2b9822b and the closing commit follow)   2026-11-15

git status --short (closing commit): the four goldens with their sidecars and `index.json`, `measure.ts` (the DS-HEIGHT-10
filter and the flip), `measure-collector.test.ts`, DECISIONS, the two judge logs, the tracker and this note

Item: UX-P3.fix-13 ⚑-design "The tab strip's badges do not hide below a 250 px list pane", tracker row
`docs/plans/STATUS-ux.md`. The one counted source directory is this one (`measure.ts` is a §2.1 UI file, the rest are
tests). UX-P3.fix-12's note was this file at ff69c51; its closing run is recorded in its tracker row.

## Verified by running

Baseline at ff69c51 (UX-P3.fix-12's closing tree): `npx tsc --noEmit`, `npm run check-types`, `npx eslint src` → exit 0;
`npm test` → `Tests  2576 passed | 9 skipped` (UX-P3.fix-12's gates); closing run 43742201585 green.

DO 1, `Button.test.tsx` (the test "a button with an icon keeps its label as its name and shows the glyph only in a narrow
toolbar", its tab assertion rewritten in place: the badges join the 250 query's clip rule, and no rule gives them
`display: none`). Red on ff69c51's CSS:

```text
     × a button with an icon keeps its label as its name and shows the glyph only in a narrow toolbar 4ms
AssertionError: expected '@container (max-width: 250px) {\n    …' to match /\.nuiget-tab-count,\n\s+\.nuiget-tab-…/
      Tests  1 failed | 4 passed (5)
```

After step 3: `Tests  5 passed (5)`.

DO 2: `src/test/ui/v2/measure.ts` gains `TabBadges`, `TAB_BADGES_STATUS` (`{ pending: 'P3.fix-13' }`) and `tabBadgesClause`;
the collector's `controlsIn` reads, for the `tabs` container, the pane (the content box of `.nuiget-tabs`, now one helper
shared with the collapsed-glyph fact), each `.nuiget-tab-count`/`.nuiget-tab-badge` box and the labels whose
`scrollWidth > clientWidth`; the `tabs` scope prints `…; badges hidden N, labels cut M` below 250 or `badges shown N`
above, ` (pending P3.fix-13)` while pending; the `details` state group gains `toolbars` (the duty).
`measure-rules.test.ts`: "reads the tab strip's badges: clipped below 250, shown above, the cut labels printed
(DS-OVERFLOW-3, UX-P3.fix-13)": today's fact (`pane 170`, three 18×18 badges, two labels cut) →
`{ text: 'badges hidden 0, shown 3, labels cut 2', pass: false }`. `measure-collector.test.ts`: "reads the tab strip's
badges and cut labels against its tab container (DS-OVERFLOW-3, UX-P3.fix-13)".

DO 3, `primitives.css`: in the 250 block the `display: none` rule of the two tab selectors is gone and they join the
existing clip rule's selector list; the block's comment says the badges leave the pixels and stay in the tab's name;
nothing in the Tabs section changed. `grep -n -A3 'nuiget-tab-count' primitives.css` → :458 (the clip rule) and :1403 (the
Tabs base rule, `display: inline-flex; flex: none`); no `display: none` follows either.

Gates after the edits:

- `npx tsc --noEmit` → exit 0; `npm run check-types` → exit 0; `npx eslint src` → exit 0; `npm run lint` → exit 0
- `npx vitest run --project backend src/test/lint` → `Tests  484 passed (484)`
- `node scripts/check-css-baseline.mjs --item P3.fix-13` → `check-css-baseline: 0 entries for P3.fix-13`
- `npm test` (final tree, after follow-up 1) → `Test Files  181 passed (181)`, `Tests  2580 passed | 9 skipped (2589)`, `[axe-coverage] 74 files, 42 rules
  passed somewhere, 0 missing`
- `npm run bench` → exit 0; `npm run docs:check` → exit 0; `npm run check:matrix` → `282 rows: 277 covered, 2 gap, 3
  manual-credentials; 0 finding(s).`

Local reading 1 (DO 4; macOS, DPR 2, never evidence): capture suite `90 passing`, `22 failing`: the 21 known local-only
(DS-SCROLL-1 ×15, SPEC `project-selector Δx` ×5, colour profile ×1) and one new red, the stop-and-ask of DO 4:

```text
[measure] DS-INSET-2@main-browse-details/toolbars: not measurable (hard)
[measure] DS-INSET-3@main-browse-details/toolbars: not measurable (hard)
[measure] DS-OVERFLOW-3@main-browse-details/toolbars: not measurable (no toolbars) (hard)
```

The other details states read green (`DS-INSET-2@main-installed-details/toolbars: 16/16 4/4 (hard)` ×4,
`…@main-transitive-details/toolbars: 16/16 4/4`, `DS-INSET-3 … toolbar end 16 (target 16)`, `DS-OVERFLOW-3@main-installed-details/toolbars:
[installed-toolbar] 2/2 reachable; collapsed 1: glyph 16×16, centre dx 0 dy 0, name "Select All" (hard)` at 400 and
`labelled 1: icon hidden, label shown` ×3); the tab clause read `badges hidden 3, labels cut 0 (pending P3.fix-13)` on the
four narrow cells and `badges shown 1|2|3` on the wider ones. Follow-up 1 (below) ruled the fix.

Follow-up 1, DO 1: `DETAILS_BROWSE_STATES = ['main-browse-details']` (`src/test/ui/v2/measure.ts`), from the twelve states
`stateGroup` maps to `details` (the `ready(…)` names of `states.ts`) and their reaches in the capture suite:

| State | View its details pane opens from | In the constant |
|---|---|---|
| `main-browse-details` | Browse (`REACH['main-browse-results']`, then the Newtonsoft.Json Browse row) | yes |
| `main-installed-details` | Installed, Gateway (Newtonsoft.Json 12.0.1) | no |
| `main-installed-hover-current` | Installed, Gateway (Newtonsoft.Json under the pointer) | no |
| `main-transitive-details` | Installed, Gateway (a transitive row) | no |
| `main-details-readme` | Installed, Gateway (the README tab of an installed row) | no |
| `main-details-empty` | Installed, Gateway (no row current) | no |
| `main-details-loading` | Installed, Gateway (Serilog, metadata held) | no |
| `main-details-error` | Installed (Serilog, metadata released as a failure) | no |
| `main-details-readonly` | Installed, Gateway then Utility held | no |
| `main-details-unsupported` | Installed, Unsupported.csproj (`REACH['main-installed-unsupported']`, Polly) | no |
| `main-readme-loading` | Installed (Serilog, README held) | no |
| `main-readme-error` | Installed (Serilog, README released as a failure) | no |

DO 2: `elementGroups`' `details` case adds `toolbars` unless the state is in the constant (`detailsToolbars`, written as
`firstRow` is); `grep -n 'DETAILS_BROWSE_STATES' measure.ts` → the definition and one use. DO 3: `measure-rules.test.ts`
"measures the list toolbar beside a details pane, except where the pane opens from Browse (UX-P3.fix-13)";
`npx vitest run --project backend src/test/lint` → `Tests  485 passed (485)`; tsc, check-types, eslint → exit 0.

`node esbuild.mjs --production --analyze` → `dist/extension.js 299573 / 326720`, `dist/webview.js 587771 / 613761`,
`dist/sidebar.js 362256 / 374532` (unchanged); `npm run package:vsix` → `Packaged: nuiget-v2.0.0.vsix (17 files, 613.05 KB)`;
`npm run check:vsix` → `check:vsix: OK`.

Local reading 2 (follow-up 1, DO 4; macOS, DPR 2, never evidence) on this tree: v2 suites `49 passing`; capture suite `91
passing`, `21 failing`, the 21 known local-only (DS-SCROLL-1 ×15, SPEC `project-selector Δx` ×5, colour profile ×1);
`test:ui:classic` `7 passing`, `6 failing` (the same classes). `grep -c '@main-browse-details/toolbars'` → 0;
`grep '/toolbars' | grep details | grep -c 'not measurable'` → 0. Every toolbars-scoped line of the details states
(count, line; `main-transitive-details` is in DS-OVERFLOW-3's `exceptStates`, so it prints the two inset rules only):

```text
   1 [measure] DS-INSET-2@main-details-empty/toolbars: 16/16 4/4 (hard)
   1 [measure] DS-INSET-2@main-details-error/toolbars: 16/16 4/4 (hard)
   1 [measure] DS-INSET-2@main-details-loading/toolbars: 16/16 4/4 (hard)
   2 [measure] DS-INSET-2@main-details-readme/toolbars: 16/16 4/4 (hard)
   1 [measure] DS-INSET-2@main-details-readonly/toolbars: 16/16 4/4 (hard)
   1 [measure] DS-INSET-2@main-details-unsupported/toolbars: 16/16 4/4 (hard)
   4 [measure] DS-INSET-2@main-installed-details/toolbars: 16/16 4/4 (hard)
   1 [measure] DS-INSET-2@main-installed-hover-current/toolbars: 16/16 4/4 (hard)
   1 [measure] DS-INSET-2@main-readme-error/toolbars: 16/16 4/4 (hard)
   1 [measure] DS-INSET-2@main-readme-loading/toolbars: 16/16 4/4 (hard)
   1 [measure] DS-INSET-2@main-transitive-details/toolbars: 16/16 4/4 (hard)
   1 [measure] DS-INSET-3@main-details-empty/toolbars: toolbar end 16 (target 16) (hard)
   1 [measure] DS-INSET-3@main-details-error/toolbars: toolbar end 16 (target 16) (hard)
   1 [measure] DS-INSET-3@main-details-loading/toolbars: toolbar end 16 (target 16) (hard)
   2 [measure] DS-INSET-3@main-details-readme/toolbars: toolbar end 16 (target 16) (hard)
   1 [measure] DS-INSET-3@main-details-readonly/toolbars: toolbar end 16 (target 16) (hard)
   1 [measure] DS-INSET-3@main-details-unsupported/toolbars: toolbar end 16 (target 16) (hard)
   4 [measure] DS-INSET-3@main-installed-details/toolbars: toolbar end 16 (target 16) (hard)
   1 [measure] DS-INSET-3@main-installed-hover-current/toolbars: toolbar end 16 (target 16) (hard)
   1 [measure] DS-INSET-3@main-readme-error/toolbars: toolbar end 16 (target 16) (hard)
   1 [measure] DS-INSET-3@main-readme-loading/toolbars: toolbar end 16 (target 16) (hard)
   1 [measure] DS-INSET-3@main-transitive-details/toolbars: toolbar end 16 (target 16) (hard)
   1 [measure] DS-OVERFLOW-3@main-details-empty/toolbars: [installed-toolbar] 2/2 reachable; labelled 1: icon hidden, label shown (hard)
   1 [measure] DS-OVERFLOW-3@main-details-error/toolbars: [installed-toolbar] 2/2 reachable; labelled 1: icon hidden, label shown (hard)
   1 [measure] DS-OVERFLOW-3@main-details-loading/toolbars: [installed-toolbar] 2/2 reachable; labelled 1: icon hidden, label shown (hard)
   2 [measure] DS-OVERFLOW-3@main-details-readme/toolbars: [installed-toolbar] 2/2 reachable; labelled 1: icon hidden, label shown (hard)
   1 [measure] DS-OVERFLOW-3@main-details-readonly/toolbars: [installed-toolbar] 2/2 reachable; labelled 1: icon hidden, label shown (hard)
   1 [measure] DS-OVERFLOW-3@main-details-unsupported/toolbars: [installed-toolbar] 2/2 reachable; labelled 1: icon hidden, label shown (hard)
   1 [measure] DS-OVERFLOW-3@main-installed-details/toolbars: [installed-toolbar] 2/2 reachable; collapsed 1: glyph 16×16, centre dx 0 dy 0, name "Select All" (hard)
   3 [measure] DS-OVERFLOW-3@main-installed-details/toolbars: [installed-toolbar] 2/2 reachable; labelled 1: icon hidden, label shown (hard)
   1 [measure] DS-OVERFLOW-3@main-installed-hover-current/toolbars: [installed-toolbar] 2/2 reachable; labelled 1: icon hidden, label shown (hard)
   1 [measure] DS-OVERFLOW-3@main-readme-error/toolbars: [installed-toolbar] 2/2 reachable; labelled 1: icon hidden, label shown (hard)
   1 [measure] DS-OVERFLOW-3@main-readme-loading/toolbars: [installed-toolbar] 2/2 reachable; labelled 1: icon hidden, label shown (hard)
```

## Visual evidence (UI items)

Proving run 43746892037 (de27fe0), green on every job; `captures/43746892037/`:

```text
[diff] summary: 114 compared, 110 at 0 px, 4 above tolerance, 0 without a golden, 0 refused
[diff] main-installed-details.dark-modern.400: 1171 px (0.365 %, tolerance 0 %, 151636 px masked, above)
[diff] main-installed-single.dark-modern.220: 1203 px (0.681 %, tolerance 0 %, above)
[diff] main-installed-single.dark-modern.400: 1231 px (0.383 %, tolerance 0 %, above)
[diff] main-installed-single.dark-modern.600: 1317 px (0.273 %, tolerance 0 %, 4440 px masked, above)
[measure] DS-OVERFLOW-3@main-installed-single/tabs: [tab-bar] 2/2 reachable; badges hidden 3, labels cut 0 (pending P3.fix-13) (hard)   (×3)
[measure] DS-OVERFLOW-3@main-installed-details/tabs: [tab-bar] 2/2 reachable; badges hidden 3, labels cut 0 (pending P3.fix-13) (hard)
[measure] DS-OVERFLOW-3@main-installed-details/toolbars: [installed-toolbar] 2/2 reachable; collapsed 1: glyph 16×16, centre dx 0 dy 0, name "Select All" (hard)
```

Changed-pixel boxes (pixelmatch red of `compare()`, masks applied), all inside the tab strip: 220 `20,201,133,35`, 400
`20,135,135,35`, details 400 `20,142,135,28`, 600 `35,137,158,35`. `grep -c '@main-browse-details/toolbars'` → 0; `grep
'/toolbars' | grep details | grep -c 'not measurable'` → 0; 44 new details toolbars lines, all passing. Unchanged:
`DS-COPY-5@main-installed-single: … tabs 2: count badges 3 (hard)` ×8, `[aria] … differs` 0 and 0, the four `[keys] … tab:`
walks as expected (hard); the snapshots' tab names `tab "Installed # # package with known vulnerabilities"`, `tab "Updates
#"`. Hard lines against run 43742201585 (sorted; the tabs clause text and the new details toolbars lines set aside):
identical but DS-HEIGHT-10 at the four cells (the stop-and-ask of DO 5, ruled in the GOLDEN ruling):

```text
< [measure] DS-HEIGHT-10@main-installed-details: count 20.4×20 ×10, 26.7×20 ×2 (at least 19×19) (hard)
> [measure] DS-HEIGHT-10@main-installed-details: count 19×19 ×3, 20.4×20 ×9 (at least 19×19) (hard)
< [measure] DS-HEIGHT-10@main-installed-single: count 20.4×20, 26.7×20 ×3 (at least 19×19) (hard)   (×3)
> [measure] DS-HEIGHT-10@main-installed-single: count 19×19 ×3, 26.7×20 (at least 19×19) (hard)   (×3)
```

sha256: `main-installed-single.dark-modern.220` 761c1a3df3d2315ba28759bd960a15c1a31a57cea69508c8adbce4559e99ed6a, `.400`
413903616a6eb09332df91efba0449c360bed38e9ad34d2d56db2459b302f748, `.600` 1d55e3be6443e4139ef136794580ba55218fca301420cf802634b2ef0423f05f,
`main-installed-details.dark-modern.400` 69aa5cb1c8a6f51cfaf9a3ce9e442e9d9896b88d51e1120d88339527dc368395.

design-judge wf_2b6d085d-a5a (`captures/43746892037/judge-wf_2b6d085d-a5a.json`), the four cells against their committed
goldens: `states 4, candidates 21, standing 6, blocking 2, refuted 0, singleJudge 5, incomplete 0`; dispositions in
`docs/plans/judge-log/P3.fix-13.json` (11 entries): the golden's badges → fixed here; the version and "Addec" clips and
the cut primary → P3.fix-14; the 49 px pane → P3.fix-15. P3.fix-12's four tab findings carry the re-run 43746892037 as
evidence.

Closing (G-UI): the four cells adopted from run 43746892037 only (`captures/43746892037/adopt-4/`): `compare-goldens: 4
goldens adopted from run 43746892037 as approved`; `index.json` holds the four with that run, `approved` and the sha256
above. DS-HEIGHT-10's collector leaves out a badge inside a tab span clipped to at most 1×1 (the tabs clause's predicate);
`measure-collector.test.ts` "leaves a badge in a clipped tab span out of the badge sizes; a shown one stays (DS-HEIGHT-10,
UX-P3.fix-13)". `TAB_BADGES_STATUS` is `'hard'`. §8's tab-strip row in its own commit 2b9822b; the DECISIONS row "Tab
badges below 250 (UX-P3.fix-13)". Gates on the closing tree: `npx tsc --noEmit`, `npm run check-types`, `npx eslint src` →
exit 0; `npx vitest run --project backend src/test/lint` → `Tests  486 passed (486)`; `npm test` → `Test Files  181 passed (181)`,
`Tests  2581 passed | 9 skipped (2590)`, `[axe-coverage] 74 files, 42 rules passed somewhere, 0 missing`; `npm run bench` →
exit 0. `precommit-review` on the closing commit (wf_0f5d6ef7-ecb) → 0 blocking, 2 non-blocking (these gate lines and the
status line), both fixed before the commit. The closing run must read `114 at
0 px`, `pending P3.fix-13` 0, no `19×19 ×3` on DS-HEIGHT-10, `DS-HEIGHT-10@main-installed-single: count 26.7×20` at the
three narrow cells and `…@main-installed-details: count 20.4×20 ×9` at 400, `[aria] … differs` 0.

## Done (tested)

- DO 1-3 above; the tracker's pending-table row of DS-OVERFLOW-3 names the clause; P3.fix-12's tracker row records its
  closing run and SHA.

## Done (untested)

None.

## Pre-commit review

`precommit-review` on the proving commit (wf_292ec600-111): 1 blocking (the staged note lacked local reading 2, which
follow-up 1 orders before the push) and 5 non-blocking; all handled before the commit: reading 2 pasted above; a
Deviations line for the label-width condition; the pending-table row names the `DETAILS_BROWSE_STATES` exception; the
gotcha row "A container-query rule before the base rule it narrows" names both remedies; `npm test` and `npm run bench`
re-run on the final tree.

## Not started

Nothing. The closing run is the proof.

## Deviations from contract/ADR/decision (file:line each)

- The tracker row asks that "each tab label is wider than it was with them"; `tabBadgesClause` (`src/test/ui/v2/measure.ts`) prints
  the labels an ellipsis cuts and does not judge them, as the opening ruling's DO 2 rules (§8 allows the ellipsis second).

## Advisor decisions (date, item, question, answer verbatim)

### 2026-11-15, UX-P3.fix-13, design-advisor, opening ruling

Question: Q1 one push or a reading push first; Q2 the CSS form; Q3 whether the tab's name keeps its badges; Q4 the clause;
the predicted cells and the DS-COPY-5 value.

> Opening ruling for UX-P3.fix-13 at ff69c51. Your facts check out against the tree, with one correction: DS-COPY-5 will not change. Its collector counts `querySelectorAll('.nuiget-badge--count')` (measure.ts:1387), which is presence, not visibility, so `tabs 2: count badges 3` stays at every width.
>
> `git status` shows `docs/plans/STATUS-ux.md` modified, so the tree is not clean as the brief says; I assume that is your tracker edit for this item.
>
> ```text
> DECISION: Q1 (b) one proving push, behind a local reading. Q2 other: no rule moves; the query's tab rule takes the
> clip form the button label already has. Q3 keep the count and the vulnerable mark in the tab's name. Q4 the
> clause as below.
>
> WHY: §8 and the UX-P2.7 row rule that the badges leave the pixels below 250; nothing rules that they leave the
> accessible name, and a name that changes with the pane width tells a screen-reader user less for no gain. The
> 250 query already holds a visually-hidden form for `.nuiget-button-icon + .nuiget-button-label`
> (primitives.css, position absolute, 1 px, clip-path); `.nuiget-tab` is `position: relative`, so the same
> declarations work on `.nuiget-tab-count, .nuiget-tab-badge`. That form sets no property the base rule sets
> (`display`, `flex`), so the source-order conflict disappears without moving the Tabs base rule out of its
> section (ADR-010: one rule per property, no new selector, (0,1,0)). The visible label stays inside the name
> (WCAG 2.5.3), the panel's `aria-labelledby` is untouched, and no ARIA snapshot depends on width.
>
> DO:
> 1. Before the CSS, rewrite in place the Button.test.tsx assertion at :54 that pins the query's tab rule. It
>    asserts that inside the 250 block `.nuiget-tab-count` and `.nuiget-tab-badge` carry `clip-path: inset(50%)`
>    and that no rule in primitives.css gives them `display: none`. Paste its red output on ff69c51.
> 2. measure.ts: add 'toolbars' to the `details` group of `elementGroups` (the duty), and a DS-OVERFLOW-3 `tabs`
>    clause as an exported status `pending: P3.fix-13`, a pure clause function with unit cases and a collector
>    case, as P3.fix-12 did:
>    - list pane at most 250: every `.nuiget-tab-count` and `.nuiget-tab-badge` has a rect of at most 1×1;
>    - list pane above 250: every one present has a rect larger than that;
>    - printed, not judged: how many tab labels are cut (`scrollWidth > clientWidth`); §8 allows the ellipsis
>      second.
>    Value form, for example `badges hidden 3, labels cut 0` or `badges shown 3`. One unit case carries today's
>    fact (pane 170, three badges shown) and fails.
> 3. CSS, primitives.css only: in the 250 block delete the `.nuiget-tab-count, .nuiget-tab-badge { display: none }`
>    rule and add those two selectors to the selector list of the existing clip rule
>    (`.nuiget-button-icon + .nuiget-button-label`). Correct the block's comment. Touch nothing in the Tabs
>    section.
> 4. Local reading before any push: run the capture tier and paste every toolbars-scoped line of the details
>    states and the new tabs clause at the four narrow cells. A red toolbars-scoped line on a details state is a
>    stop-and-ask before the push; do not fix it here.
> 5. Proving push. Expected:
>    - `[diff]`: exactly four cells above 0 px: `main-installed-single.dark-modern.220`, `.400`, `.600` and
>      `main-installed-details.dark-modern.400`. Changed pixels lie inside the tab strip only (about y 201-237 at
>      220, y 137-173 at 400 and 600); nothing shifts vertically. Any other moved cell is a stop.
>    - Clause: `badges hidden 3` at panes 170, 172, 172 and 210; `badges shown 3` at every wider cell.
>    - `main-installed-details` now prints `/toolbars` lines, with `collapsed 1: glyph 16×16, centre dx 0 dy 0,
>      name "Select All"` at 400.
>    - Unchanged: DS-COPY-5 `tabs 2: count badges 3`, DS-OVERFLOW-3 tabs `2/2 reachable`, `[aria] … differs` 0,
>      the `[keys]` lines. Any other hard line that changes value in the four cells is a stop-and-ask with the
>      line pasted (a clipped badge may still be read by a badge collector).
> 6. GOLDEN brief on the green run for the four cells: sha256, the `[diff]` lines, the clause lines, the details
>    toolbars lines, the judge on both states, and the tab names from the run's ARIA snapshot.
> 7. Closing commit: adopt the four as `approved`, flip the status to `hard`, and set §8's tab-strip row to "the
>    badges leave the strip below 250 and stay in the tab's name; then the labels ellipsize". Add a DECISIONS.md
>    row: "Tab badges below 250 (UX-P3.fix-13): hidden by the primitive's clip form, never `display: none`; the
>    tab's name keeps its count and vulnerable mark." Set the four owned findings of judge-log/P3.fix-12.json to
>    their closing state per the judge-log rule.
>
> DO NOT:
> - Move the Tabs base rule, add a second rule for these selectors, or raise specificity.
> - Use `display: none`, `visibility: hidden` or `aria-hidden` on the badges.
> - Change `Tabs.tsx`, its props, `nameOf` or the panel's `aria-labelledby`.
> - Keep the vulnerable badge visible below 250; §8 and the P2.7 row rule both badges out.
> - Fix a red details toolbars line, the Uninstall label, the version clip, the placeholder or the split here.
> - Edit DS-COPY-5, or adopt an ARIA snapshot.
>
> CONTRACT CHANGE: none. Files: src/webview/shared/primitives/primitives.css, Button.test.tsx,
> src/test/ui/v2/measure.ts and its two test files, docs/design/design-system.md §8, docs/design/DECISIONS.md, the
> four goldens with sidecars and index.json, the judge log, STATUS files.
>
> VERIFY:
> - `grep -n -A3 'nuiget-tab-count' src/webview/shared/primitives/primitives.css` shows the selector twice: once in
>   the 250 block's clip rule, once in the Tabs base rule; no `display: none` follows either.
> - `npx vitest run src/webview/shared/primitives/Button.test.tsx`: red on ff69c51, green after step 3.
> - Proving run: `[diff] summary: 114 compared, 110 at 0 px, 4 above tolerance`; closing run 114 at 0 px, the
>   tabs clause `(hard)` without `(pending P3.fix-13)`, `[aria] … differs` 0.
> - `node scripts/check-css-baseline.mjs --item P3.fix-13` prints `0 entries`.
>
> DEFECTS: none new. The four tab-badge findings of P3.fix-12's log are this item's.
> ```
>
> **Not verified**
> - That a clipped, still-rendered badge keeps the tab's computed name in Chromium is standard accname behaviour, not something I measured; step 6's snapshot names prove it. A snapshot is only taken at the state's own width, so the narrow-width name itself is still unread by any gate; if you want it read, say so and I will rule a `[keys]`-style line.
> - The label widths at pane 170 ("INSTALLED" and "UPDATES" at 11 px on the runner's face) may or may not ellipsize; the clause prints it and does not judge it.
> - I did not read `Badge.tsx`, the audit's capture width, or the P2.7 handoff's step that specified `display: none`; if that step names `display: none` as the ruled form, this ruling replaces it for the reason above.
>
> After this change no rule inside a container query precedes a base rule that sets the same property for the same selector. A general lint for that class is now possible with no allowance; it is worth a line to the planning session, not part of this item.

### 2026-11-15, UX-P3.fix-13, design-advisor, follow-up 1 (the Browse details state)

Question (DO 4 stop-and-ask): `main-browse-details` reads `not measurable` on three toolbars-scoped hard rules once the
`details` group gains `toolbars`; the fix, or drop the duty.

> Follow-up 1 ruling for UX-P3.fix-13. I confirmed the working tree holds only the item's files, and that `elementGroups` already builds a state-conditional group (`firstRow`, measure.ts:560) and DS-OVERFLOW-3's `tabs` scope already declares Browse's absence (`tab strip not shown (browsing)`).
>
> ```text
> DECISION: Option (b), in one place: the duty stays in this item, and `elementGroups` leaves 'toolbars' out of the
> `details` group for a details state whose view is Browse. Then push the proving commit.
>
> WHY: The red is not a defect of the product or of the three rules: Browse has no bulk toolbar, which the
> `browse` group already says by carrying no 'toolbars' element group, and `main-browse-details` is a Browse view
> that happens to sit in the `details` group. Three per-rule exemption lists (b as written) would state one fact
> three times and miss the next toolbars-scoped rule. (c) changes which rules judge that state everywhere. (d)
> turns "not measurable" into a pass, which hides a real missing toolbar in an Installed state. (a) costs a
> second item and a second adoption of nothing. The state-conditional group is the helper's existing form
> (`firstRow`).
>
> DO:
> 1. measure.ts: add a named constant, `DETAILS_BROWSE_STATES`, holding every state of the `details` group whose
>    reach opens the details pane from Browse. Fill it from `states.ts` and the capture suite's reaches, not from
>    which states went red; paste the list with each state's view in STATUS.md. `main-browse-details` is in it;
>    say for each other details state why it is not.
> 2. In `elementGroups`, the `details` case adds 'toolbars' unless the state is in that constant, written as
>    `firstRow` is. Change no rule's `exceptStates` or `scopeExceptStates`, and no evaluator.
> 3. Add a measure-rules unit case: `main-browse-details` has no 'toolbars' element group, `main-installed-details`
>    and `main-transitive-details` have it.
> 4. Re-run the local capture tier. Paste the toolbars-scoped lines of every details state: no `not measurable`
>    among them, and no `/toolbars` line at all for the states of the constant. The local failing count returns
>    to the 21 known.
> 5. Push the proving commit. On CI a `not measurable` toolbars line on any details state is a stop-and-ask with
>    the state named; do not extend the constant to go green.
> 6. Carry the constant and its reason into the GOLDEN brief, with the CI toolbars lines of the details states.
>
> DO NOT:
> - Add the state to DS-INSET-2, DS-INSET-3 or DS-OVERFLOW-3 one by one, or make "no toolbar" pass.
> - Move `main-browse-details` to the `browse` group.
> - List a state in the constant because it is red; a non-Browse details state without a toolbar is a finding.
> - Drop the duty, or push before step 4's local reading is pasted.
>
> CONTRACT CHANGE: none. Files: src/test/ui/v2/measure.ts and src/test/lint/measure-rules.test.ts, within the
> item's set.
>
> VERIFY:
> - `grep -n 'DETAILS_BROWSE_STATES' src/test/ui/v2/measure.ts` shows the definition and one use, in
>   `elementGroups`.
> - The proving run's `ui-output.txt`: `grep -c '@main-browse-details/toolbars'` is 0;
>   `grep '/toolbars' | grep 'details' | grep -c 'not measurable'` is 0; `main-installed-details/toolbars` prints
>   the collapsed clause at 400.
>
> DEFECTS: none.
> ```
>
> **Not verified**
> - I did not read `states.ts` or the capture reaches, so I do not know whether `main-browse-details` is the only Browse details state; step 1 settles it.
> - The local reading is macOS at DPR 2 and decides nothing; the CI lines in step 5 do.
>
> The opening ruling's steps 5 to 7 (the four predicted cells, the clause lines, the GOLDEN brief, the closing commit) stand unchanged.

### 2026-11-15, UX-P3.fix-13, design-advisor, GOLDEN ruling

Question: the DS-HEIGHT-10 value change (DO 5 stop-and-ask); are the four cells in the class (adopt and flip);
dispositions and owners for the judge's 11 findings.

> GOLDEN ruling for UX-P3.fix-13, proving run 43746892037 (de27fe0). The brief checks out: the four sha256 values match the files, `ui-diff.txt` shows exactly those four cells above tolerance, the clause prints `badges hidden 3, labels cut 0` four times, and both details-toolbars greps return 0. I opened all four captures: each tab strip reads "INSTALLED" and "UPDATES" whole with no badge, and nothing below the strip has moved. The CSS diff of de27fe0 is the ruled one (the two tab selectors joined to the clip rule, the `display: none` rule gone).
>
> ```text
> DECISION: APPROVE the four cells. DS-HEIGHT-10's collector skips a clipped tab badge, in this item's closing
> commit. Dispositions below.
>
> WHY: The cells are the opening ruling's step 5 prediction: four cells, changed pixels inside the tab strip only
> (20,201,133,35 at 220; 20,135,135,35 and 20,142,135,28 at 400; 35,137,158,35 at 600), 110 cells at 0 px, the
> clause green at panes 170, 172, 172 and 210, DS-COPY-5 and the ARIA snapshots unchanged. DS-HEIGHT-10 states
> the size of a badge the user sees; `shown('.nuiget-badge')` (measure.ts:1437) now reports three badges at
> 19×19 that are clipped to 1 px, which is a reading of nothing. It passes, so it blocks no adoption, but a
> hard line that measures hidden boxes would also hide a real undersized badge behind a count; this item
> created the case and owns measure.ts here, so it corrects the collector rather than leaving a row.
>
> DO:
> 1. Adopt the four cells with `--status approved` from run 43746892037:
>    main-installed-single.dark-modern.220 sha256 761c1a3df3d2315ba28759bd960a15c1a31a57cea69508c8adbce4559e99ed6a
>    main-installed-single.dark-modern.400 sha256 413903616a6eb09332df91efba0449c360bed38e9ad34d2d56db2459b302f748
>    main-installed-single.dark-modern.600 sha256 1d55e3be6443e4139ef136794580ba55218fca301420cf802634b2ef0423f05f
>    main-installed-details.dark-modern.400 sha256 69aa5cb1c8a6f51cfaf9a3ce9e442e9d9896b88d51e1120d88339527dc368395
> 2. measure.ts, the badge collector: leave out a badge whose `.nuiget-tab-count` or `.nuiget-tab-badge` ancestor
>    has a rect of at most 1×1, using the same predicate the tabs clause uses. Add a collector unit case (a
>    clipped tab badge is not in `badges`; a shown one is). Change no target, tolerance or rule.
> 3. Flip TAB_BADGES_STATUS to 'hard'; write §8's tab-strip row and the DECISIONS.md row of the opening ruling's
>    step 7; add to that row: "DS-HEIGHT-10 reads shown badges only."
> 4. Expected in the closing run: `DS-HEIGHT-10@main-installed-single: count 26.7×20 (at least 19×19) (hard)` at
>    the three narrow cells, `DS-HEIGHT-10@main-installed-details: count 20.4×20 ×9 (at least 19×19) (hard)` at
>    400, the wide lines unchanged. A `not measurable` or any other changed hard line is a stop-and-ask.
> 5. docs/plans/judge-log/P3.fix-13.json, 11 entries:
>    - main-installed-single#D1, main-installed-single-400#D3, main-installed-details#D1,
>      main-installed-single-600#D2 (golden draws the badges): fixed, owner P3.fix-13; the goldens are replaced
>      by step 1.
>    - main-installed-single#D2 (49 px details pane): fixed, owner P3.fix-15.
>    - main-installed-single-400#D1, main-installed-single-600#D1, main-installed-single#D3 (version clipped by
>      the facts line): fixed, owner P3.fix-14.
>    - main-installed-single#D4, main-installed-single-400#D2 ("Uninstall Selecte..."): fixed, owner P3.fix-14.
>    - main-installed-details#D2 ("2.0.3 · Addec" cut mid-glyph): fixed, owner P3.fix-14. Same class: a text of
>      the facts line sliced by the line with no ellipsis.
> 6. Add to P3.fix-14's row: the finding main-installed-details#D2 and its box (46,381,84,16 of the details-400
>    cell), and that its helper clause reads every text child of the facts line, not the version alone.
> 7. Set the four tab-badge findings of judge-log/P3.fix-12.json to their closing state per the judge-log rule.
> 8. Push the closing commit; paste its `[diff] summary` and the lines of step 4.
>
> DO NOT:
> - Make DS-HEIGHT-10 skip any badge other than one inside a clipped tab span, or lower its 19×19.
> - Fix the version clip, the "Addec" clip, the Uninstall label or the 49 px pane here.
> - Adopt a fifth cell or an ARIA snapshot.
>
> CONTRACT CHANGE: none.
>
> VERIFY:
> - Closing run: `[diff] summary: 114 compared, 114 at 0 px, 0 above tolerance`; `grep -c 'pending P3.fix-13'` on
>   ui-output.txt is 0; `grep 'DS-HEIGHT-10@main-installed' | grep -c '19×19 ×3'` is 0; `[aria] … differs` 0.
> - `git diff --stat` under src/test/ui/v2/golden/: four PNGs, four sidecars, index.json.
> - `node scripts/check-css-baseline.mjs --item P3.fix-13` prints `0 entries`.
>
> DEFECTS (none blocks approval; all predate this item):
> - captures/43746892037/main-installed-details.dark-modern.400.png 46,381,84,16 DS-ROW-5 major: "2.0.3 · Addec"
>   is sliced at the line's edge with no ellipsis; P3.fix-14.
> - The version clip, the Uninstall label and the 49 px pane are as listed in P3.fix-12's GOLDEN ruling; owners
>   P3.fix-14 and P3.fix-15.
> ```
>
> **Not checked**
> - I did not open the four committed goldens, the `diff/` images or the judge JSON; the finding ids, boxes and severities are taken from the brief.
> - The "all other hard lines identical to run 43742201585" comparison and the classic output are from the brief. I confirmed only the DS-HEIGHT-10 lines, which read as you pasted them.
> - The narrow-width accessible name is still read by no gate; the wide-width names in the snapshot are unchanged, which is what the clip form predicts but does not prove at 250 or under.

## Exact next step (one item ID)

UX-P3.fix-13 is `done` once the closing run reads the GOLDEN ruling's VERIFY. Next open row: P3.fix-14.

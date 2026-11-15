# STATUS — src/webview/shared/primitives (UX-P3.fix-12)   commit d30ed09 (proving push; 5633c4d and the closing commit follow)   2026-11-15

git status --short (closing commit): the four goldens with their sidecars and `index.json`, `measure.ts` (the flip),
`docs/plans/judge-log/P3.fix-12.json`, DECISIONS, the tracker and this note

Item: UX-P3.fix-12 ⚑-design "The collapsed Select All button at 220 draws an empty box", tracker row
`docs/plans/STATUS-ux.md`. The one counted source directory is `src/webview/shared/primitives` (`measure.ts` is a §2.1 UI
file and the rest are tests), so the note is this directory's `STATUS.md` (plan §2.5), as UX-P3.fix-10's was.

## Verified by running

Baseline: `npx tsc --noEmit`, `npm run check-types`, `npx eslint src` → exit 0; `npx vitest run` → `Tests  2575 passed |
9 skipped` (the source tree unchanged since 27791f9); UX-P3.11d's closing run 43734973583 (c5102ad) green.

The reading before any CSS (the row asks for it; the design-advisor ruled it sufficient, no probe push):

- Pixels, `captures/43731497246/main-installed-single.dark-modern.220.png` (sha256 8145c6c6…4974): at y 252 the list pane's
  only non-background columns are x 16 and x 33 (47,47,47, the secondary button's border), the top border at y 241; every
  pixel of x 17-32 × y 241-263 is the background 24,24,24 (no glyph ink). Uninstall Selected (0) has wrapped to a second
  toolbar line (fill y 271-296). The box is 18 px wide while Select All stands alone on line 1.
- Cause by cascade: `@container (max-width: 250px) { … .nuiget-button-icon { display: inline-flex; } … }` came before the
  Button section's `.nuiget-button-icon { display: none; }`, both (0,1,0): the later rule won, the glyph never showed, and
  the label's clip rule (0,2,0) did apply; `.nuiget-button`'s padding 4/8 and 1 px border give 8+8+1+1 = 18 px.

DO 1, `Button.test.tsx` rewritten in place (title "a button with an icon keeps its label as its name and shows the glyph
only in a narrow toolbar"; asserts the top-level `.nuiget-button-icon { display: none; }` precedes the 250 query, keeps its
three existing matches). Red on c5102ad's CSS:

```text
     × a button with an icon keeps its label as its name and shows the glyph only in a narrow toolbar 3ms
 FAIL  |frontend| src/webview/shared/primitives/Button.test.tsx > Button > a button with an icon keeps its label as its name and shows the glyph only in a narrow toolbar
AssertionError: expected 31664 to be less than 16366
      Tests  1 failed | 4 passed (5)
```

After step 3: `Tests  5 passed (5)`.

DO 2, the clause: `src/test/ui/v2/measure.ts` gains `CollapsibleButton`, `COLLAPSED_GLYPH_STATUS` (`{ pending: 'P3.fix-12' }`),
`collapsedGlyphClause` and, in the collector's `controlsIn`, a `collapsible` list per container (each `.nuiget-button`
holding a `.nuiget-button-icon`: the content-box width of its `.nuiget-tabs`, the svg's rect, whether it lies inside the
button and its centre offset, whether the label shows, the label's text); the `toolbars` scope prints
`…; collapsed N: glyph W×H, centre dx a dy b, name "…"` or `labelled N: icon hidden, label shown`, with
` (pending P3.fix-12)` while pending, and leaves the verdict to reachability until the flip.
`src/test/lint/measure-rules.test.ts`: new case "reads a collapsed glyph button in a list toolbar: the glyph alone below
250, the label above (DS-OVERFLOW-3, UX-P3.fix-12)": today's fact (`pane 170, no glyph`) →
`{ text: 'collapsed 1: no glyph, name "Select All"', pass: false }` (the red-before proof), the fixed fact passes,
an off-centre, an outside, a nameless and a wide-with-glyph fact fail, and the line keeps its reachability verdict.
`npx vitest run --project backend src/test/lint/measure-rules.test.ts` → `Tests  56 passed (56)`.

DO 3, `primitives.css`: the two base rules moved unchanged above the 250 query with the comment "A Button's glyph shows only
in a narrow toolbar. A query rule follows the base rule it narrows (UX-P3.fix-12)."; nothing else in either block.

Gates after the edits:

- `npx tsc --noEmit` → exit 0; `npm run check-types` → exit 0; `npx eslint src` → exit 0; `npm run lint` → exit 0
- `npx vitest run --project backend src/test/lint` → `Tests  481 passed (481)`
- `node scripts/check-css-baseline.mjs --item P3.fix-12` → `check-css-baseline: 0 entries for P3.fix-12`
- `npm test` → `Test Files  181 passed (181)`, `Tests  2576 passed | 9 skipped (2585)`, `[axe-coverage] 74 files, 42 rules
  passed somewhere, 0 missing`
- `npm run bench` → exit 0; `npm run docs:check` → exit 0; `npm run check:matrix` → `282 rows: 277 covered, 2 gap, 3
  manual-credentials; 0 finding(s).`
- After the review fixes: `npx tsc --noEmit`, `npm run check-types`, `npx eslint src` → exit 0;
  `npx vitest run --project backend src/test/lint` → `Tests  482 passed (482)`
- `node esbuild.mjs --production --analyze` → `dist/extension.js 299573 / 326720`, `dist/webview.js 587771 / 613761`,
  `dist/sidebar.js 362256 / 374532` (unchanged: the CSS is not in the JS bundles)
- `npm run package:vsix` → `Packaged: nuiget-v2.0.0.vsix (17 files, 613.05 KB)`; `npm run check:vsix` → `check:vsix: OK`
- `npm run test:ui` (local, macOS, never evidence) → v2 suites `49 passing`; capture suite `91 passing`, `21 failing`, the
  same local-only classes as UX-P3.11c's local run (DS-SCROLL-1 ×15, SPEC `project-selector Δx` ×5, the artboard colour
  profile ×1); the clause reads `collapsed 1: glyph 16×16, centre dx 0 dy 0, name "Select All" (pending P3.fix-12)` on three
  local `main-installed-single` cells and `labelled 1: icon hidden, label shown` on every wider toolbar cell.
- `npm run test:ui:classic` (local) → `7 passing`, `6 failing`, the same local-only classes.

## Visual evidence (UI items)

Proving run 43739104739 (d30ed09), green on every job; `captures/43739104739/`:

```text
[diff] summary: 114 compared, 110 at 0 px, 4 above tolerance, 0 without a golden, 0 refused
[diff] main-installed-details.dark-modern.400: 21 px (0.007 %, tolerance 0 %, 151636 px masked, above)
[diff] main-installed-single.dark-modern.220: 21 px (0.012 %, tolerance 0 %, above)
[diff] main-installed-single.dark-modern.400: 21 px (0.007 %, tolerance 0 %, above)
[diff] main-installed-single.dark-modern.600: 18908 px (3.924 %, tolerance 0 %, 9240 px masked, above)
[measure] DS-OVERFLOW-3@main-installed-single/toolbars: [installed-toolbar] 2/2 reachable; collapsed 1: glyph 16×16, centre dx 0 dy 0, name "Select All" (pending P3.fix-12) (hard)   (×3: the 220, 400 and 600 cells)
```

(each `[diff]` line also prints `fingerprint differs: image ubuntu26 20261111.82.6 → ubuntu26 20261111.196.1`, the runner
image.) Exactly the opening ruling's step 4 cells. Changed-pixel boxes (pixelmatch red of `compare()`, masks applied):
220 `27,251,12,6`, 400 and details 400 `27,185,12,6` (the glyph's ink), 600 `16,177,194,626` (the wrap). Pixels: the box
spans x 16–49 (34 px) with glyph ink at x 26–38; at 600 the Uninstall fill's last row moved 202 → 232. Every wider toolbar
cell reads `labelled 1: icon hidden, label shown`; the centre is within tolerance, so DO 5 was not needed. Hard lines
against run 43734973583 (sorted, the toolbars clause text stripped): identical but the 600 cell's
`MS-8@main-installed-single/first-row: reference 235.2 → 265.2` and `PF-3b … first Dapper: row 271.2 → 301.2` (the wrap);
DS-HEIGHT-6 `26 ×2`, DS-ICON-2 `glyph 16×16 ×3`, DS-OVERFLOW-1 `no sideways scroll`; `[aria] … differs` 0 and 0; classic
hard lines identical. `main-installed-details` prints no `/toolbars` line: the `details` state group has no `toolbars`
(`measure.ts` `elementGroups`), P3.fix-13's duty under the GOLDEN ruling.

sha256: `main-installed-single.dark-modern.220` 55a08299676df36ceed9b25439cea62db4bee342f5d54a8223f35946d11701f9,
`.400` e84ac2da2e5c26dcd38cc2001103cc84dd405ccabde2fc911eb9fd64b4fbfda6, `.600`
d4a34428694b4190d6df1462ef5d4ee1980cd0c039a1b9580750442b8c344b5f, `main-installed-details.dark-modern.400`
0f45bcb4dc3e7884af46a2c9f05db67ca0bef023918404a83278583bb4842d3f.

design-judge wf_f513f231-6d1 (`captures/43739104739/judge-wf_f513f231-6d1.json`), the four cells against their committed
goldens as artboards: `states 4, candidates 31, standing 10, blocking 4, refuted 2, singleJudge 4, incomplete 0`. D37 is
not met (informational); every finding has a disposition and an owner in `docs/plans/judge-log/P3.fix-12.json` (the
GOLDEN ruling's DO 4): the tab badges → P3.fix-13; the wraps → accepted-as-design; the empty-box golden → fixed here;
the cut primary and the sliced version → P3.fix-14; the 49 px details pane and the clipped placeholder → P3.fix-15.

Closing (G-UI): the four cells adopted from run 43739104739 only (`captures/43739104739/adopt-4/`, the four PNGs and their
sidecars): `compare-goldens: 4 goldens adopted from run 43739104739 as approved`; `index.json` holds the four with run
43739104739, status `approved` and the sha256 above. `COLLAPSED_GLYPH_STATUS` is `'hard'`; the pending table row says so.
§8's bulk-toolbar "Today" cell corrected in its own commit 5633c4d (`docs(design)`, citing the rulings). The closing
run must read `114 at 0 px`, the three clause lines without `(pending P3.fix-12)` and `[aria] … differs` 0.

Gates on the staged closing tree (after the flip): `npx tsc --noEmit` → exit 0; `npm run check-types` → exit 0;
`npx eslint src` → exit 0; `npx vitest run --project backend src/test/lint` → `Tests  482 passed (482)` (the measure-rules
case reads the status, so it asserts the hard verdict now: `pass: false` for today's fact); `npx vitest run --project
backend src/test/lint/measure-rules.test.ts` → `Tests  56 passed (56)`; `node scripts/check-css-baseline.mjs --item
P3.fix-12` → `check-css-baseline: 0 entries for P3.fix-12`; `npm run docs:check` → exit 0; `npm run check:matrix` → `282
rows: 277 covered, 2 gap, 3 manual-credentials; 0 finding(s).` `precommit-review` on the closing commit (wf_cd7019b6-31e)
→ 0 blocking, 2 non-blocking (this paragraph and the judge log's `evidence` fields), both fixed before the commit.

## Done (tested)

- DO 1-3 above; the tracker's "Pending measurement rules" row of DS-OVERFLOW-3 names the clause; P3.fix-13 (the tab
  badges, DO 9) placed after this row for the planning session; P3.11d's Commit column (`44431c8, c5102ad`) and its
  note's closing run.

## Pre-commit review

`precommit-review` on the proving commit (`{ "range": "--cached", "item": "P3.fix-12" }`, run wf_616b49c3-929) →
`blocking: []`, `refuted: []`, `incomplete: []`, `reviewersAnswered: 3`; six non-blocking, all handled before the commit:

1. `measure.ts`: the name came from the label whether or not it rendered → the name is read only from a rendered label,
   and "label shown" reads the label's box (the collapse clips it to 1 px; jsdom has no `clip-path`).
2. This commit records UX-P3.11d's closing run in `docs/plans/handoff/P3.11d.md` and its Commit column: the previous item's
   closing record, as UX-P3.11d's first commit did for UX-P3.11c (44431c8).
3. `src/test/lint/measure-collector.test.ts`: new case "reads a glyph button of a list toolbar against its tab container:
   glyph box, centre, label and name (DS-OVERFLOW-3, UX-P3.fix-12)" (narrow, wide, a label hidden outright) →
   `Tests  43 passed (43)`.
4. `node esbuild.mjs --production --analyze` and `npm run package:vsix` run after the local UI suites (they share `dist/`);
   pasted above.
5. The note moved from `docs/plans/handoff/` to this directory (plan §2.5).
6. `.github/copilot-instructions.md`: gotcha row "A container-query rule before the base rule it narrows".

## Done (untested)

None.

## Not started

Nothing. The closing run is the proof.

Also in the closing commit: the DECISIONS row "Collapsed Select All (UX-P3.fix-12)"; P3.fix-13's row gains the details
`toolbars` duty; rows P3.fix-14 and P3.fix-15 (the GOLDEN ruling's rows A and B) placed for the planning session.

## Deviations from contract/ADR/decision (file:line each)

None.

## Advisor decisions (date, item, question, answer verbatim)

### 2026-11-15, UX-P3.fix-12, design-advisor, opening ruling

Question: is the CSS-and-pixel reading sufficient without a probe push; which fix (A source order, B move the query
blocks, C a square collapsed box, D a probe first); how the moved cell is judged and adopted; does a measurement need
adding (trigger 6).

> The brief is wrong on three points, stated first because they change the work:
>
> - **Four goldens show the empty box, not one.** `main-installed-single.dark-modern.220` (pane 170), `.400` (pane 172), `.600` (pane 210) and `main-installed-details.dark-modern.400` (pane 172). I opened all four in `captures/43731497246/`; each has the empty box at about x 16-34 beside or above Uninstall Selected. No classic golden exists at 250 or under, so the row's "both looks" does not apply.
> - **DS-ICON-2 will not change.** Its helper reads `layout.heights.iconButtons` (`.nuiget-icon-button svg`), not a `.nuiget-button`'s glyph. The line stays `×3`, and nothing reads the collapsed glyph today.
> - **The tab badges have the same defect.** The same container block sets `.nuiget-tab-count, .nuiget-tab-badge { display: none }` at `primitives.css:445-448`, and the base rule at `:1405-1409` sets `display: inline-flex` later at equal specificity. All four PNGs still show the count pills and the red-ringed badge with the labels cut to "I..", so §8's "badges hide below 250 (UX-P2.7b)" is false today.
>
> ```text
> DECISION: Option A, no probe push; the tab-badge defect does not ride in this item.
>
> WHY: The cascade reading is confirmed against the file: `.nuiget-button-icon { display: inline-flex }`
> (primitives.css:450, in the 250 query) loses to `.nuiget-button-icon { display: none }` (:877), both (0,1,0), the
> later wins; 8+8+1+1 = 18 px matches the box at 16,241,18,24 of
> captures/43731497246/main-installed-single.dark-modern.220.png. C is out on a hard rule: DS-HEIGHT-6's helper runs
> `offStyles(heights.buttons, CONTROL_STYLES.button)` with `padding: '4px 8px 4px 8px'` (measure.ts:91, :2342), so a
> 4 px collapsed padding turns it red, and it would be a second padding rule for the primitive (ADR-010). B moves the
> row rules' precedence for no gain. A changes no selector, specificity or declaration. Trigger 6 fires: §8's
> "Select All collapses to its glyph below 250" (DS-OVERFLOW-3) has no assertion; `controlsIn` counts an empty 18 px
> box as reachable.
>
> DO:
> 1. Before the CSS, rewrite in place the Button.test.tsx test at :47-49 (it slices from the container block onward,
>    so it passed with the bug). It asserts that the index of the top-level `.nuiget-button-icon {` rule with
>    `display: none` is lower than the index of `@container (max-width: 250px)`, and keeps its two existing matches.
>    Paste its red output on c5102ad.
> 2. Add a clause to DS-OVERFLOW-3's `toolbars` scope in measure.ts, as `pending: P3.fix-12`. For every
>    `.nuiget-button` of the toolbar that holds a `.nuiget-button-icon`:
>    - list pane at most 250: the svg is visible, its rect is 16×16, it lies inside the button's rect, its centre is
>      within TOLERANCES.containment of the button's centre on both axes, and the button's accessible name is still
>      "Select All";
>    - list pane above 250: the icon is not visible and the label is.
>    Print it as its own value part, for example `collapsed 1: glyph 16×16, centre dx 0 dy 0`. Add an evaluator unit
>    test with a today's-tree fact (collapsed, no glyph) that fails the clause; that is the red-before proof without
>    a CI run.
> 3. CSS, primitives.css only: move the two base rules `.nuiget-button-icon { display: none; }` and
>    `.nuiget-button-label { min-inline-size: 0; }` unchanged to above the `@container (max-width: 250px)` block,
>    with a one-line comment: a query rule follows the base rule it narrows. Touch nothing else in either block.
> 4. Proving push. Expected `[diff]` per cell, to paste and check against:
>    - `main-installed-single.dark-modern.220`, `.400` and `main-installed-details.dark-modern.400`: only the box
>      moves, 18 to 34 px wide (x 16-50, y about 241-266), with glyph ink inside; Uninstall Selected is already on
>      line 2, so nothing shifts.
>    - `main-installed-single.dark-modern.600`: Uninstall Selected is 147 px wide (x 47-194 in the capture) and
>      34 + 4 + 147 = 185 exceeds the toolbar's 178 px content, so it wraps to a second line and the list moves down
>      about 30 px. That wrap is accepted (see RECORD).
>    - Every other cell: 0 px. Any other moved cell is a stop.
>    - Also paste the new DS-OVERFLOW-3 clause line at each of the four cells, DS-HEIGHT-6 (still 26 ×2, padding
>      unchanged), DS-OVERFLOW-1/-5 and DS-ICON-2 (still ×3).
> 5. If the glyph's centre is off tolerance: one declaration on the base `.nuiget-button-icon` rule
>    (`vertical-align`), with the numbers before and after in STATUS.md; otherwise come back with the numbers.
> 6. On the green proving run send a `GOLDEN` brief for the four cells (sha256 each, the `[diff]` lines, the clause
>    lines, the judge on `main-installed-single` and `main-installed-details`). This ruling covers design trigger 1
>    for those four cells only when they match step 4's prediction; it does not pre-approve the PNGs.
> 7. Closing commit: adopt the four cells with `--status approved` under the GOLDEN ruling, flip the clause to
>    `hard`, and correct §8's bulk-toolbar "Today" cell.
> 8. RECORD for DECISIONS.md: "Collapsed Select All (UX-P3.fix-12): the glyph-only button keeps the text button's
>    4/8 padding, 34×26; under about 217 px of pane the primary wraps to its own line, the toolbar's declared wrap
>    (UX-P2.7 row: 'the wrap keeps every control reachable')."
> 9. Add a row for the planning session to STATUS-ux.md: the tab badges do not hide below 250 (same source-order
>    cause, primitives.css:445 against :1405). Do not fix it here.
>
> DO NOT:
> - Change the collapsed button's padding, add `:has`, make `.nuiget-button` flex, or raise a selector's specificity.
> - Move the container blocks, or touch the tab or row rules inside them.
> - Fix the tab badges in this item, or add a general source-order lint that would be red on them.
> - Add an allowance, edit DS-ICON-2 or DS-HEIGHT-6, or widen a tolerance.
> - Adopt a cell that step 4 does not predict, or adopt before the GOLDEN ruling.
> - Touch a feature stylesheet, `Button`'s props or the icon list.
>
> CONTRACT CHANGE: none. Files: src/webview/shared/primitives/primitives.css, Button.test.tsx,
> src/test/ui/v2/measure.ts and its test, docs/design/design-system.md §8, docs/design/DECISIONS.md, the four goldens
> with their sidecars and index.json, STATUS files. No `*Props` change.
>
> VERIFY:
> - `npx vitest run src/webview/shared/primitives/Button.test.tsx`: red on c5102ad, green after step 3.
> - The proving run's `[measure] DS-OVERFLOW-3@main-installed-single/toolbars` at panes 210, 172 and 170, and
>   `@main-installed-details/toolbars` at 172, print the collapsed clause with glyph 16×16 and centre within
>   tolerance; at panes above 250 no collapsed button.
> - `[diff] summary` shows exactly four cells above 0 px before adoption; the closing run shows 114 at 0 px, the
>   clause `(hard)`, and `[aria] … differs` 0.
> - `node scripts/check-css-baseline.mjs --item P3.fix-12` prints `0 entries`.
> - design-judge on both states: zero standing blocking findings.
>
> DEFECTS:
> - captures/43731497246/main-installed-single.dark-modern.220.png 16,241,18,24 DS-OVERFLOW-3 minor: collapsed
>   Select All is an empty box; §8 says its glyph. Same at .400 (16,241), .600 (16,177) and
>   main-installed-details.dark-modern.400 (16,177). Fixed by this item.
> - captures/43731497246/main-installed-single.dark-modern.220.png 6,203,160,36 NEW: "below a 250 px list pane no
>   `.nuiget-tab-count` or `.nuiget-tab-badge` is visible and each tab label is wider than it was with them;
>   measured as a DS-OVERFLOW-3 `tabs` clause" major: both count pills and the vulnerable badge still show and the
>   labels read "I.." and "U.."; §8 says the badges hide first. Same in the other three cells. Not this item's: a
>   row for the planning session. That row needs a reading of the tab's accessible name and of losing the
>   vulnerable mark at narrow widths before the CSS.
> ```
>
> **Reasoning the ruling rests on but I did not measure**
> - The glyph's vertical centre is inferred from the line-box arithmetic, not read. Step 2's clause is what decides it, and step 5 says what to do if it is off.
> - The 600 wrap rests on a 147 px width read from the PNG by eye, at about 1 px accuracy against a 7 px margin. If the proving run shows one line instead, report it; that is not a failure.
> - With A, the collapse saves a toolbar line only for panes of roughly 217 to 250 px; narrower panes wrap either way. That is a note for the planning session, not a defect.
>
> **Not opened**
> - The four committed goldens. I relied on the run's `[diff] … 0 px` lines against the captures I opened; the 220 golden's sha256 (e324ac3b…) differs from the capture's (8145c6c6…) although the diff reads 0 px.
> - ADR-010's text and `docs/design/judge-rubric.md`; I worked from their summaries in the agent file and the gotcha table.
> - `docs/plans/handoff/P2.7.md`; I read only the title of the UX-P2.7 row in DECISIONS.md.
>
> **Hashes of the captures read** (`captures/43731497246/`)
>
> | File | sha256 |
> |---|---|
> | `main-installed-single.dark-modern.220.png` | 8145c6c6d98aa380a40996e2f07b433e672de32cfd2e503e7c382c79d7df4974 |
> | `main-installed-single.dark-modern.400.png` | da3ba0789212bdb2f845b2f86e0c949808cfc88548baf9b98d41285ce3f55af0 |
> | `main-installed-single.dark-modern.600.png` | 25501d63f078d8b676bfffd5a9d4b719cc8db3406fde664825a8a37134f4fa20 |
> | `main-installed-details.dark-modern.400.png` | 1507254b09e4d6493965300e6b671d9804e69ca315c81b00d680a9e2c6e122e8 |

### 2026-11-15, UX-P3.fix-12, design-advisor, GOLDEN ruling

Question: are the four moved cells in the pre-ruled class (adopt and flip); the `main-installed-details` toolbars gap;
dispositions and owners for the judge's 10 standing findings.

> GOLDEN ruling for UX-P3.fix-12, proving run 43739104739 (d30ed09). The brief checks out: the four sha256 values match the files, the `[diff]` lines and the clause counts (3 collapsed, 35 labelled) match `ui-output.txt` and `ui-diff.txt`, and the CSS diff of d30ed09 is exactly the two base rules moved above the 250 query. I opened all four captures; each shows the check-all glyph centred in a 34 px box, and the 600 cell shows Uninstall Selected (0) on a second line.
>
> ```text
> DECISION: APPROVE the four cells; accept the clause as read on the three main-installed-single cells; dispositions
> below.
>
> WHY: The four moved cells are exactly the opening ruling's step 4 prediction: 21 px in the glyph box at 220, 400
> and details 400, and the 30 px wrap at 600 (MS-8 235.2 → 265.2, PF-3b 271.2 → 301.2), with 110 cells at 0 px.
> The clause reads `collapsed 1: glyph 16×16, centre dx 0 dy 0, name "Select All"` at panes 210, 172 and 170, so
> step 5 is not needed; DS-HEIGHT-6 stays `26 ×2` and DS-ICON-2 `×3`. The details-400 cell has the same toolbar at
> the same 172 px pane and the same changed box (27,185,12,6) as single-400, so the missing `/toolbars` line there
> is a coverage gap of the state group, not doubt about the cell. Every standing finding outside the glyph box is
> unchanged from the committed goldens, and the hardness rule (D37) is not met, so none blocks adoption; each gets
> a disposition.
>
> DO:
> 1. Adopt the four cells with `--status approved` from run 43739104739:
>    main-installed-single.dark-modern.220 sha256 55a08299676df36ceed9b25439cea62db4bee342f5d54a8223f35946d11701f9
>    main-installed-single.dark-modern.400 sha256 e84ac2da2e5c26dcd38cc2001103cc84dd405ccabde2fc911eb9fd64b4fbfda6
>    main-installed-single.dark-modern.600 sha256 d4a34428694b4190d6df1462ef5d4ee1980cd0c039a1b9580750442b8c344b5f
>    main-installed-details.dark-modern.400 sha256 0f45bcb4dc3e7884af46a2c9f05db67ca0bef023918404a83278583bb4842d3f
>    Adopt nothing else.
> 2. Flip COLLAPSED_GLYPH_STATUS to 'hard' in the closing commit, with §8's bulk-toolbar "Today" cell and the
>    DECISIONS.md row of the opening ruling's step 8.
> 3. Do not add 'toolbars' to the details group in this item. Add it to P3.fix-13's row as a duty: a reading push
>    with the group added, every toolbars-scoped line of the details states pasted, any red a stop-and-ask. That
>    item moves the same cells.
> 4. Write docs/plans/judge-log/P3.fix-12.json with these dispositions:
>    - main-installed-single#D1, main-installed-single-400#D1, main-installed-single-600#D2,
>      main-installed-details#D1 (tab badges shown below 250): fixed, owner P3.fix-13.
>    - main-installed-single-600#D1 (wrap at 600) and main-installed-details#D2 (wrap at 400, single judge):
>      accepted-as-design, owner P3.fix-12; ruling: the DECISIONS.md row "Collapsed Select All (UX-P3.fix-12)"
>      and the UX-P2.7 row ("the wrap keeps every control reachable").
>    - main-installed-single#D6 (golden drew the empty box, single judge): fixed, owner P3.fix-12; the golden is
>      replaced by step 1.
>    - main-installed-single#D4 and main-installed-single-400#D2 (Uninstall Selected cut to "Uninstall
>      Selecte...", the count lost): fixed, owner new row A.
>    - main-installed-single#D2 and main-installed-single-400#D3 (facts-line version cut with no ellipsis): fixed,
>      owner new row A. Not refuted: `versionCut` (measure.ts:1461) reads the version's own scrollWidth and cannot
>      see the parent line clipping it. P2.8a's #D7 ruling covered the authors' ellipsis, not this.
>    - main-installed-single#D3 (details pane about 49 px at 220): fixed, owner new row B.
>    - main-installed-single#D5 and main-installed-single-400#D4 (main search placeholder clipped, no ellipsis):
>      fixed, owner new row B.
> 5. Add two rows to STATUS-ux.md for the planning session to place, both ⚑-design, pre-existing, blocking
>    nothing in this item:
>    - Row A, "Clips at the 170 px list-pane floor". The primary's label needs 147 px and has 138 (170 minus 32).
>      A version wider than the facts line is sliced by the line. The same version clip shows at 600 (pane 210),
>      where the panel's refuter leaned on the blind helper; that cell joins the row.
>    - Row B, "The main panel at the editor minimum". At 220 the 170 px list floor leaves the details pane about
>      49 px, and no rule says what the split does below 170 + 220. The main placeholder does not fit its field
>      at 220 or 400.
>    Each row carries its NEW rule from DEFECTS, to fail on today's captures before the CSS.
> 6. Push the closing commit and paste its `[diff] summary`.
>
> DO NOT:
> - Fix the tab badges, the Uninstall label, the version clip, the placeholder or the split in this item.
> - Add 'toolbars' to the details group here, or mark any finding refuted-by-measurement on `version whole`.
> - Adopt from any run other than 43739104739, or any fifth cell.
> - Leave a finding without a disposition because it is single-judge or pre-existing.
>
> CONTRACT CHANGE: none.
>
> VERIFY:
> - `git diff --stat` of the closing commit under src/test/ui/v2/golden/ shows the four PNGs, their four sidecars
>   and index.json only; index.json records run 43739104739 and the four sha256 above with status approved.
> - The closing run prints `[diff] summary: 114 compared, 114 at 0 px, 0 above tolerance`, the three collapsed
>   clause lines without `(pending P3.fix-12)`, and `[aria] … differs` 0.
> - `node scripts/check-css-baseline.mjs --item P3.fix-12` prints `0 entries`.
> - docs/plans/judge-log/P3.fix-12.json holds 14 entries (10 standing, 4 single judge), each with a disposition
>   and an owner.
>
> DEFECTS (none blocks approval; all predate this item):
> - captures/43739104739/main-installed-single.dark-modern.220.png 6,201,154,35 DS-OVERFLOW-3 major: tab badges
>   shown below 250, labels "I..", "U.."; P3.fix-13. Same in the other three cells.
> - captures/43739104739/main-installed-single.dark-modern.220.png 16,271,138,26 NEW: "at the list-pane minimum no
>   toolbar button's label is cut (label scrollWidth ≤ clientWidth); a DS-OVERFLOW-3 toolbars clause" blocking:
>   "Uninstall Selecte..." loses its count; §8 declares no truncation of the primary. Same at 400 and details 400.
>   Row A.
> - captures/43739104739/main-installed-single.dark-modern.220.png 46,584,84,14 DS-ROW-5 blocking: "9.5.0-preview.1"
>   sliced by the facts line with no ellipsis; the helper needs the version's right edge against its line's
>   (NEW clause: version rect right ≤ line content right + 0.5, or the version itself ellipsizes). Same at 400
>   (46,519,84,13) and 600. Row A.
> - captures/43739104739/main-installed-single.dark-modern.220.png 171,201,49,189 NEW: "below list minimum plus
>   details minimum the split's behaviour is declared in §8 and measured (the details pane is either at least its
>   minimum or not shown)" major: the empty sentence breaks mid-word in 49 px. Row B.
> - captures/43739104739/main-installed-single.dark-modern.220.png 16,166,188,26 NEW: "the main search placeholder
>   fits its field's text box at every named width (as the sidebar's does by its copy)" major: cut at "filt" with
>   no ellipsis; at 400 cut after "@updates, @". Row B.
> ```
>
> **Not checked**
> - I did not open the four committed goldens or the `diff/` images; the "byte-identical outside the glyph box" claim rests on the run's 21 px `[diff]` lines and the changed-pixel boxes in the brief.
> - I read the judge JSON's finding texts only to their first 330 characters, and did not read its `perState` block.
> - The classic output and the "hard lines identical to run 43734973583" comparison are taken from the brief; I confirmed only the DS-HEIGHT-6, DS-OVERFLOW-3 and DS-OVERFLOW-5 lines of `main-installed-details` and the clause counts.
> - `src/webview/shared/primitives/STATUS.md` and the measure.ts diff of d30ed09 were not read beyond `COLLAPSED_GLYPH_STATUS` and the details group list (measure.ts:567-569, confirmed without 'toolbars').

## Exact next step (one item ID)

UX-P3.fix-12 is `done` once the closing run reads `[diff] summary: 114 compared, 114 at 0 px, 0 above tolerance`, the three
collapsed clause lines without `(pending P3.fix-12)` and `[aria] … differs` 0. Next open row: P3.fix-13.

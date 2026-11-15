# STATUS — src/webview/shared/primitives (UX-P3.fix-12)   commit c5102ad (base; the proving push)   2026-11-15

git status --short: `primitives.css`, `Button.test.tsx`, `measure.ts`, `measure-rules.test.ts`, the tracker, P3.11d's note
and this note

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

Not yet: the proving push.

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

- The CSS move's effect on the four cells (the proving run reads it).

## Not started

The proving run (DO 4-5), the GOLDEN brief and the judge (DO 6), the closing commit (DO 7-8: adoption, the flip, §8's
"Today" cell, the DECISIONS row).

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

## Exact next step (one item ID)

UX-P3.fix-12: push the proving commit, then DO 4-6.

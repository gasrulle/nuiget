# STATUS — src/webview/main   commit 80940aa (P9 gate record; parent of the P9.fix-2 commit)   2026-10-17T10:00:00Z

git status --porcelain --untracked-files=all (before the P9.fix-2 commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`,
`docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`,
`src/webview/main/{main.css,STATUS.md}`, `src/webview/main/features/installed/{InstalledTab.tsx,InstalledTab.test.tsx,AllProjectsView.test.tsx}`,
`src/webview/main/features/updates/{AllProjectsUpdates.tsx,UpdatesTab.test.tsx}`,
`src/webview/shared/primitives/{Listbox.tsx,Listbox.test.tsx}`, `src/webview/shared/STATUS.md`,
`src/test/ui/v2/{main-installed.ui.test.ts,STATUS.md}`

Items: **P9.fix-2 to P9.fix-6**, the owner's layout fixes after the P9 screenshot review (2026-10-17), by the ruling and
its follow-up below, one commit each. This note is extended per fix; it replaces the P9.12 note (history at `eb68dbb`).

## Verified by running

```text
P9.fix-2
baseline (80940aa)   → tsc 0 · check-types 0 · eslint 0 · npm test 2016 passed, 9 skipped (cf9d794 gates; 80940aa is docs)
npx tsc --noEmit     → exit 0
npm run check-types  → exit 0
npx eslint src       → exit 0
npm run lint         → exit 0
npx vitest run --project frontend src/webview/shared/primitives/Listbox.test.tsx src/webview/main/features → 172 passed
npm test             → exit 0; Test Files 135 passed (135); Tests 2017 passed | 9 skipped (2026)
npm run bench        → exit 0
npm run docs:check   → exit 0
node esbuild.mjs --production --analyze → 297018 / 322502, 548825 / 577766, 333170 / 351245 (+0, +34, +42 bytes)
npm run test:ui -- --storage /tmp/nuiget-ui (local, macOS) → exit 0; 42 passing (1m);
                       [P9.fix-2] transitive header: {"headerTop":284,"lastRowBottom":284}
negative control     → the `scrollIntoView` line removed: `ArrowDown scrolls the active option into view …` fails; restored
grep -rn "nuiget-installed--all" src → empty; grep -c "max-height: 50%" src/webview/main/main.css → 1 (another rule)
CI run 39022785828 (push of 1784642) → success on all 10 jobs; UI log [P9.fix-2] transitive header:
                       {"headerTop":284,"lastRowBottom":284}

P9.fix-3
npx tsc --noEmit · npm run check-types · npx eslint src · npm run lint → 0 · 0 · 0 · 0
npx vitest run --project frontend src/webview/shared/primitives/Row.test.tsx → 21 passed
npx vitest run --project backend src/test/lint/webview-tokens.test.ts → 8 passed
npm test             → exit 0; Test Files 135 passed (135); Tests 2018 passed | 9 skipped (2027)
npm run bench        → exit 0
npm run docs:check   → exit 0
node esbuild.mjs --production --analyze → 297018 / 322502, 548907 / 577766, 333252 / 351245 (+0, +82, +82 bytes)
npm run test:ui -- --storage /tmp/nuiget-ui (local) → exit 0; 42 passing (1m); [P9.12] comfortable rows height 79
                       (token 78); [P9.fix-3] Newtonsoft.Json authors {"clientWidth":123,"scrollWidth":123};
                       check box centres 0.5 px above the card centre on every row (Installed and Updates)
grep -rniE "two-line|two lines|66 ?px" CHANGELOG.md ARCHITECTURE.md docs/ux/interaction-model.md src/webview → only
                       this note's pasted ruling and released CHANGELOG history
```

viewed (P9.fix-2, CI run 39022785828): main-transitive-expanded.png: TRANSITIVE PACKAGES (1) with net8.0 right under the Serilog.Sinks.Console card, no gap, nothing pinned to the bottom
viewed (P9.fix-2): main-installed-single.png: DIRECT PACKAGES (2), then the collapsed TRANSITIVE PACKAGES header right under the Serilog card
viewed (P9.fix-2): main-installed-all.png: TestProject and Utility sections, then the collapsed TRANSITIVE PACKAGES header right under the last card

CI run 39023352495 (push of 8c1f643, P9.fix-3) → success on all 10 jobs; [P9.fix-3] Newtonsoft.Json authors
{"clientWidth":125,"scrollWidth":125}; check box centres 0.5 px above the card centre (Installed and Updates)
viewed (P9.fix-3): main-installed-single.png: three-line cards (name / 13.0.2 / ✓ James Newton-King), check box and icon centred
viewed (P9.fix-3): main-updates.png: three-line update cards (name / 13.0.2 → 13.0.4 marked / ✓ authors), check boxes centred
viewed (P9.fix-3): main-browse-results.png: Browse cards keep name / version · downloads · ✓ authors / description

```text
P9.fix-4
npx tsc --noEmit · npm run check-types · npx eslint src · npm run lint → 0 · 0 · 0 · 0
npm test             → exit 0; Test Files 135 passed (135); Tests 2018 passed | 9 skipped (2027)
npm run bench        → exit 0
npm run docs:check   → exit 0
node esbuild.mjs --production --analyze → 297018 / 322502, 548964 / 577766, 333252 / 351245 (+0, +57, +0 bytes)
npm run test:ui -- --storage /tmp/nuiget-ui (local) → exit 0; 44 passing (1m); [P9.fix-4] uninstall-selected-button
                       {"button":925,"list":931}; update-all-button {"button":925,"list":931} (the fix-5 edits made
                       while this run built may be in its VSIX; neither measurement depends on them)
grep -rn "nuiget-toolbar-end" src/webview → primitives.css, Toolbar.tsx JSDoc and the three primary buttons
```

## Done (tested)

- P9.fix-2: `InstalledTab.tsx`: root `nuiget-installed nuiget-installed--sections` in both modes; the transitive section
  (single or All Projects) inside `.nuiget-installed-lists` after the direct sections. `AllProjectsUpdates.tsx:307`:
  `--all` → `--sections` (follow-up ruling). `main.css`: the single-scroller rules keyed on `--sections`; `.nuiget-transitive`
  without `max-height: 50%`, `min-height`, the top border and its own scroller. `Listbox.moveTo` scrolls the active option
  into view (N88). Tests: `InstalledTab.test.tsx` and `AllProjectsView.test.tsx` assert the transitive section is inside
  `.nuiget-installed-lists`; `UpdatesTab.test.tsx` (All Projects) asserts the `--sections` root; `Listbox.test.tsx` new test;
  `main-installed.ui.test.ts` named rewrite with the edge measurement. The All Projects Updates layout is covered by the
  class rename and the jsdom assertion, not by a screenshot (no named state shows that tab).

- P9.fix-3 (D15 as amended by the owner 2026-10-17): `Row` comfortable rows put the authors on a third line when
  there is no description (Browse keeps them beside the version, the description as third line); the check mark and
  the icon are centred (`align-items: flex-start` and the icon's top margin gone); `--nuiget-row-height-comfortable`
  and `Listbox` `ROW_HEIGHT` 78. Tests: `Row.test.tsx` named rewrite `a comfortable row keeps its padding inside the
  78 px minimum` and new `a comfortable row without a description puts the authors on a third line`; UI named
  rewrites in `main-installed.ui.test.ts` (authors fit, check box centred) and `main-updates.ui.test.ts` (check box
  centred). Docs: interaction model §1, ARCHITECTURE row anatomy, CHANGELOG headline, plan Appendix D row.

- P9.fix-4: `primitives.css` `.nuiget-toolbar-end { margin-inline-start: auto }`, documented in `Toolbar.tsx`; the
  primary buttons of `InstalledTab.tsx`, `UpdatesTab.tsx` and `AllProjectsUpdates.tsx` carry it (Select all stays
  first, the arrow order is unchanged); `main.css` toolbar end padding `--nuiget-space-3`. Two new UI tests measure the
  primary button against the list's right edge (≤ 8 px).

## Done (untested)

- Nothing.

## Not started

- P9.fix-5 and P9.fix-6.

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-17, P9.fix-2 to P9.fix-6, stop-and-ask brief to the `architecture-advisor` (scope, files, order, test rewrites,
D15 wording, options A-F). Answer, verbatim:

`````text
DECISION: Run the five fixes in tracker order (P9.fix-2 → P9.fix-6), one commit, one CI run and one screenshot check each; nothing needs the owner. Per option group: (A) the owner's order, which is the tracker's order and therefore RUN.md §3's, and the five are independent as scoped below (fix-3 leaves the row's inline padding at `--nuiget-space-6`; fix-6 aligns the other five elements to it). (B) one token, `--nuiget-row-height-comfortable: 78px`, for every comfortable row; no second token. Interpretation recorded for the owner: the amendment names Installed and Updates rows; Browse rows stay three lines at 78 px because a row with a description (Browse, D14) keeps its authors beside the version and the description as its third line, as "the 78 px height Browse already uses" says; every other comfortable row (Installed, Updates, transitive, All Projects) puts the authors on the third line. (C) C-1: the All Projects single-scroller rule (`main.css:192-205`) generalised to the whole Installed tab under a class `nuiget-installed--sections`, both transitive sections moved inside `.nuiget-installed-lists`, no virtualizer rewrite; plus one guarded line in `Listbox.moveTo` that scrolls the active option into view (finding N88, below). (D) D-2 as a primitive modifier: `.nuiget-toolbar-end { margin-inline-start: auto; }` in `primitives.css`, set on the primary button of the three toolbars; the toolbar's end padding becomes `--nuiget-space-3` (6 px) so the 8 px gate has slack. (E) no allow-list (the owner's gate is "= 0"): two new tokens in `tokens.css`, `--nuiget-space-hairline: 1px` and `--nuiget-inset: var(--nuiget-space-6)`, and a new `pxSpacing` defect kind in `src/test/lint/webview-stylesheets.test.ts` (the project's form of the owner's grep; the grep itself is pasted in the STATUS note). (F) one item per commit per RUN.md §5; after fix-6 the P9 gate re-run with a `PHASE REVIEW P9 (fix-2..6)` brief over `cf9d794..HEAD`, then the RUN.md §7 stop for the owner's screenshot review.

WHY: The brief is accurate on the tree with one correction: `src/test/lint/webview-tokens.test.ts:72-80` holds no literal 66; it pairs `ROW_HEIGHT` of `Listbox.tsx:8` with the token, so fix-3 changes `tokens.css:28` and `Listbox.tsx:8` and that lint stays as it is; `tokenPx` in the UI tests (`sidebarWebview.ts:15`) reads the token at run time, so `main-installed.ui.test.ts:56-62` and `main-updates.ui.test.ts:55-61` need no change for the height, only the named additions of the owner's gate. C-1 is the proven path: `main.css:196-205` and `main.css:222-225` already run the virtualizer on a non-scrolling listbox (every row rendered), as 1.x did; C-2 would change the Listbox contract (ADR-008) in a fix item. The one primitive touch is forced by the restructure: `virtualizer.scrollToIndex` (`Listbox.tsx:129`) assigns `scrollTop` on a listbox that cannot scroll, and the focus at `Listbox.tsx:116` is `{ preventScroll: true }`, so ArrowDown past the fold leaves the active row out of view in an outer scroller; that is latent in All Projects since P5 and fix-2 would spread it to the primary list (ADR-008: accessibility is a property of primitives). The 1.x references confirm the targets: `installed-single-transitive-headers.jpg` and `transitive-details.jpg` show the transitive headers directly under the last direct row, their icons aligned with the direct rows' check boxes, three-line transitive cards; `updates-prerelease-two-line.jpg` shows three-line update cards with the check box centred and "Update All (5)" at the list's right edge; `browse-results.jpg` shows three-line Browse cards. D6 is not in play: no frozen file changes; D15 is the owner's own amendment and the plan's §5 rows are not edited (Appendix D practice), so it is recorded as an Appendix D row and in interaction model §1.

DO:
General, every fix: baseline gates (plan §2.2 step 3); only the files named below plus their tests, the directory `STATUS.md`, `CHANGELOG.md` `[Unreleased]` `### Fixed` (one headline per fix), ARCHITECTURE 2.0 section where it describes what changed, `docs/plans/STATUS.md`; gates of §2.2 step 5 including `npm run lint`, `npm run docs:check`, `node esbuild.mjs --production --analyze` with the three sizes pasted (N63); commit citing the item, D15/D18, ADR-008 and N88 where relevant; push; wait for green CI; download `ui-screenshots` and view the PNGs named per fix (RUN.md §4), `viewed:` lines in the STATUS note. Paste this ruling verbatim in `src/webview/main/STATUS.md`; `src/webview/shared/STATUS.md` carries the Row, Listbox, Toolbar and tokens parts; `src/test/ui/v2/STATUS.md` and `src/test/lint/STATUS.md` their parts.

P9.fix-2 (files: `src/webview/main/features/installed/InstalledTab.tsx` + test, `src/webview/main/main.css`, `src/webview/shared/primitives/Listbox.tsx` + `Listbox.test.tsx`, `src/test/ui/v2/main-installed.ui.test.ts`, `docs/plans/findings-ledger.md`, `docs/ux/interaction-model.md` §7 if it says the section sits under the list):
1. `InstalledTab.tsx:213`: the root class is `nuiget-installed nuiget-installed--sections` in both modes (`--all` dropped: `grep -rn "nuiget-installed--all" src` shows it is used in `main.css` only). `InstalledTab.tsx:222-223`: render the transitive section (`TransitiveSection` or `AllProjectsTransitiveSection`) inside `<div className="nuiget-installed-lists">` after `{body}`.
2. `main.css:192-225`: rename the `.nuiget-installed--all` selectors to `.nuiget-installed--sections` (one scroller `.nuiget-installed-lists { overflow: auto }`; project, content and listbox `flex: none; overflow: visible`); `.nuiget-transitive` keeps `display: flex; flex: none; flex-direction: column` and loses `max-height: 50%`, `min-height: 0` and `border-block-start` (the last direct row's own bottom border, `primitives.css:239`, is the line); `.nuiget-transitive-content` loses `overflow: auto`; the comment at `main.css:207` rewritten. Scope every rule to `.nuiget-installed--sections`: `UpdatesTab` shares `.nuiget-installed` and `.nuiget-installed-lists` and stays virtualized.
3. `Listbox.tsx:127-130` `moveTo`: after `scrollToIndex`, `optionAt(index)?.scrollIntoView?.({ block: 'nearest' })` (optional call: jsdom has no `scrollIntoView`, and an unguarded call turns every ArrowDown test red). `Listbox.test.tsx`: new test `ArrowDown scrolls the active option into view (a list in an outer scroller cannot scroll itself)` that defines `scrollIntoView` as a `vi.fn()` on the option and asserts the call with `{ block: 'nearest' }`.
4. Ledger row N88: keyboard navigation in a list that does not scroll itself (All Projects since P5, `.nuiget-installed--all .nuiget-listbox { overflow: visible }`) leaves the active row out of view: `scrollToIndex` is a no-op and the focus is `preventScroll`; fixed in fix-2 because the restructure would reach the single-project list.
5. Gate, named rewrite of `main-installed.ui.test.ts:74` `the transitive section opens with what the project gets through its references (P9.0)`: after the section is open, `executeScript` the max `bottom` over `[data-testid="installed-list"] [role="option"]` rects and the `top` of `[data-testid="section-header-transitive"]`'s closest `.nuiget-section-header`; assert `top - bottom` is at least 0 and at most `tokenPx('--nuiget-row-height-comfortable')`.
6. `InstalledTab.test.tsx`: add one assertion that `transitive-section` is inside the element with class `nuiget-installed-lists` (both modes).
7. View `main-transitive-expanded`, `main-installed-single`, `main-installed-all`.

P9.fix-3 (files: `src/webview/shared/primitives/Row.tsx` + `Row.test.tsx`, `primitives.css`, `tokens.css`, `Listbox.tsx:8`, `src/test/ui/v2/main-installed.ui.test.ts`, `main-updates.ui.test.ts`, `docs/ux/interaction-model.md` §1, plan Appendix D, `ARCHITECTURE.md:307-308`, `CHANGELOG.md:18`):
8. `tokens.css:27-28`: 78px, comment rewritten (three lines at 12 px padding, D15 as amended 2026-10-17); `Listbox.tsx:8` 78.
9. `Row.tsx:134-151`: line 2 holds version (with `nextVersion`), `meta` and `status`; the authors span moves to a third `.nuiget-row-line` when `description` is absent, and stays on line 2 when `description` is set (Browse keeps three lines: name / version · downloads · authors / description). `aria-describedby` order and ids unchanged. JSDoc at `Row.tsx:71-72` and the comment at `primitives.css:236` say three lines.
10. `primitives.css:243-248`: delete `align-items: flex-start` (the base rule at :93 centres); `primitives.css:255`: delete `margin-block-start` of `.nuiget-row-icon`.
11. `Row.test.tsx`: named rewrite of :236 → `a comfortable row keeps its padding inside the 78 px minimum`; :212 stays byte for byte (it has a description, so authors stay on line 2); new test `a comfortable row without a description puts the authors on a third line` (three `:scope > .nuiget-row-line`, authors in the third, version in the second).
12. Gate: the card is the `.nuiget-row` wrapper (what `measureLoadedRows` measures; it is 1 px taller than the option because the bottom border sits inside `border-box`, so the check mark's centre is about 0.5 px above the wrapper's centre by construction). Named rewrites: `main-installed.ui.test.ts:52` title gains `, the authors fit and the check box is centred (P9.fix-3)` and asserts for Newtonsoft.Json `.nuiget-row-authors` `scrollWidth <= clientWidth` after the authors poll, and for every row `|centre(.nuiget-row-check) - centre(.nuiget-row)| <= 2`; `main-updates.ui.test.ts:52` title gains `, check box centred` with the same centre assertion. The existing `within(token, token + 2)` height assertions stay.
13. Docs: interaction model §1 "a three-line card at least 78 px high ... the icon and the check box centred on the card; Browse rows show the downloads and the authors after the version and the description as the third line"; `ARCHITECTURE.md:307-308` (three lines, 78 px); `CHANGELOG.md:18` headline reworded to three-line cards (it is `[Unreleased]`); plan Appendix D row `§5 P9, D15`: "Amended by the owner 2026-10-17 (P9.fix-3): Installed and Updates rows are three-line cards (name + badges / version `old → new` / Verified mark + authors) at 78 px, check box and icon centred; Browse rows keep the description as their third line at the same height." `grep -rniE "two-line|two lines|66 ?px" CHANGELOG.md ARCHITECTURE.md docs/ux/interaction-model.md src/webview` → only history below `## [2.0.0]`.
14. View `main-installed-single`, `main-updates`, `main-browse-results`.

P9.fix-4 (files: `primitives.css`, `Toolbar.tsx` JSDoc, `InstalledTab.tsx:218`, `UpdatesTab.tsx:224`, `AllProjectsUpdates.tsx:312`, `main.css:178-181`, `main-installed.ui.test.ts`, `main-updates.ui.test.ts`):
15. `primitives.css` under Toolbar: `.nuiget-toolbar-end { margin-inline-start: auto; }`; `Toolbar.tsx` JSDoc: a control with `nuiget-toolbar-end` is pushed to the end of the row, arrow order unchanged. The three primary buttons get the class; Select all stays first.
16. `main.css:178-181`: add `padding-inline-end: var(--nuiget-space-3);` on its own line after the shorthand (fix-6 then changes only the start).
17. Gate, two new tests: `main-installed.ui.test.ts` `the Uninstall selected button sits at the list's right edge (P9.fix-4)` and `main-updates.ui.test.ts` `the Update all button sits at the list's right edge (P9.fix-4)`: `|rect(button).right - rect(list).right| <= 8` for `uninstall-selected-button`/`installed-list` and `update-all-button`/`updates-list`, with rows present.
18. View `main-installed-single`, `main-updates`.

P9.fix-5 (files: `src/webview/main/features/details/DetailsPane.tsx` + test, `main.css:274-284`, `src/test/ui/v2/main-details.ui.test.ts`):
19. `DetailsPane.tsx:163-214`: one `<div className="nuiget-details-actions">` holds the cells of both rows directly (no `display: contents`): Installed label, value, Uninstall; Version label, select, Update, optional Install in projects…; the `stale` Banner (:162) and the notes (:215-219) stay outside it. `main.css`: `.nuiget-details-actions { display: grid; grid-template-columns: max-content minmax(0, 1fr) max-content max-content; gap: var(--nuiget-space-3) var(--nuiget-space-4); align-items: center; }`, `.nuiget-details-label { grid-column: 1; color: ... }` (the `min-width: 5em` dropped; the pinned column makes the Version row wrap when the Installed row has no fourth cell); `.nuiget-details-row` deleted. `align-items: center` is what keeps the buttons from stretching to the select's height.
20. `DetailsPane.test.tsx`: one assertion that `uninstall-button` and `install-update-button` share the parent `.nuiget-details-actions`.
21. Gate, named rewrite of `main-details.ui.test.ts:23` `shows the versions, the details and the README of the current row`: after both buttons are displayed, assert `|left(uninstall-button) - left(install-update-button)| <= 1` and equal `height`.
22. View `main-details-readme`, `main-browse-details`.

P9.fix-6 (files: `tokens.css`, `primitives.css:12, 247`, `main.css`, `src/test/lint/webview-stylesheets.test.ts`, `webview-tokens.test.ts:26-41`, `src/test/ui/v2/main-shell.ui.test.ts`):
23. `tokens.css` Spacing: `--nuiget-space-hairline: 1px;` (the smallest step: a hairline offset) and `--nuiget-inset: var(--nuiget-space-6);` (the common left inset of the main panel). `webview-tokens.test.ts:27` REQUIRED gains both (named rewrite: the primitives rely on them).
24. Literals: `primitives.css:12` `margin: calc(var(--nuiget-space-hairline) * -1)`; `main.css:76` `margin-block-start: calc(var(--nuiget-space-1) * -1)`; `main.css:421` `padding: var(--nuiget-space-hairline) var(--nuiget-space-2)`; `main.css:413` `padding-inline-start: calc(var(--nuiget-space-6) + var(--nuiget-space-3))` (the one em). Borders, outlines and shadows are not in the gate and stay (`webview-stylesheets.test.ts:153-158` pins their strings).
25. Insets: `primitives.css:247` `padding: var(--nuiget-space-5) var(--nuiget-inset)`; `main.css:28, 111, 117, 265, 293` `--nuiget-space-6` → `--nuiget-inset` where it is the inline inset; `main.css:178-181` start padding `var(--nuiget-inset)` (end stays `--nuiget-space-3`); new `.nuiget-main-list .nuiget-tablist { padding-inline-start: calc(var(--nuiget-inset) - var(--nuiget-space-4) - var(--nuiget-space-hairline)); }` (the tab's own padding `primitives.css:805` and its 1 px border `:807`); new `.nuiget-main-list .nuiget-section-toggle { padding-inline-start: var(--nuiget-inset); }` (scoped: the details pane's dependency groups and the sidebar keep theirs); `main.css:666` folder title margin start `var(--nuiget-inset)`.
26. Lint: `findStylesheetDefects` gains `pxSpacing`: a declaration whose property matches `/^(padding|margin|gap|row-gap|column-gap)(-[a-z-]+)?$/` and whose value holds a length literal (`/(?<![\w.-])-?\d*\.?\d+(?:px|em|rem)\b/`); new `it('every padding, margin and gap is a spacing token')`; the two scanner self-tests (`the scanner finds planted defects`, `the scanner accepts what the primitives are allowed to write`, `toEqual` on the whole record) are named rewrites with a planted `padding: 1px 4px` and an accepted `calc(var(--nuiget-space-1) * -1)`.
27. Gate, new test in `main-shell.ui.test.ts` `the title, search box, tabs, toolbar, section header and row content share one left inset (P9.fix-6)`: wait for `installed-list` rows, then `executeScript` the `left` of `.nuiget-main-title`, `.nuiget-main-search-input`, the `.nuiget-tab-label` inside `[data-testid="installed-tab"]`, `[data-testid="select-all-button"]`, the `.nuiget-section-chevron` inside `[data-testid="section-header-direct"]`, and the first child of the first `[data-testid="installed-list"] [role="option"]`; assert each within 1 px of the title's. Never through `tokenPx` (its regex needs a px literal; `--nuiget-inset` is an alias).
28. View `main-installed-single`, `main-installed-single-light`, `main-installed-single-hc`.
29. After fix-6 is green: tracker check (`grep -nE '^\| P9\.[^|]*\|[^|]*\| (open|in-progress|blocked) \|' docs/plans/STATUS.md` → empty), local gates pasted under `## Phase gates`, `PHASE REVIEW P9 (fix-2..6)` brief over `cf9d794..HEAD` to the architecture-advisor, then stop per RUN.md §7 with the run id and artifact name; `labs/2.0-P9-done` waits for `P9 approved`.

DO NOT:
- Do not reorder the tracker rows or merge fixes into one commit; one item, one green commit, one viewed artifact each.
- Do not add a second row-height token or a per-feature height; the Browse row keeps its third line by keeping authors beside the version, not by a Browse-only token.
- Do not turn the virtualizer's scroll element into the outer scroller or add a Listbox prop; C-1 is the shipped All Projects shape.
- Do not call `scrollIntoView` unguarded, and do not drop `preventScroll` at `Listbox.tsx:116`.
- Do not put the notes or the stale Banner inside the details grid, and do not use `display: contents` for the rows.
- Do not add an allow-list, a `--nuiget-space-0` meaning 0, or convert borders, outlines and shadows; the gate is padding, margin and gap.
- Do not read `--nuiget-inset` through `tokenPx`, and do not measure the six edges against a token: the gate is the six against each other.
- Do not touch `src/protocol/**`, `src/core/contracts.ts` or `docs/adr/**`; do not edit the plan's §5 P9 paragraph (Appendix D carries the amendment).
- Do not weaken `main-installed.ui.test.ts:60-62` or `main-updates.ui.test.ts:59-61` (the height band stays `token..token+2`), and do not delete or retitle any test not named above.

CONTRACT CHANGE: none.

VERIFY:
- fix-2: `grep -n "nuiget-installed--sections" src/webview/main/features/installed/InstalledTab.tsx src/webview/main/main.css` → the root class and every scroller rule; `grep -c "max-height: 50%" src/webview/main/main.css` → 1 (the sources dialog's `50vh` rules are `vh`; the transitive rule is gone); `grep -n "scrollIntoView" src/webview/shared/primitives/Listbox.tsx` → one guarded call; `grep -n "^| N88" docs/plans/findings-ledger.md` → one row; CI UI job green and the `[P9.fix-2]` measurement in its log.
- fix-3: `grep -n "comfortable" src/webview/shared/tokens.css src/webview/shared/primitives/Listbox.tsx` → `78px` and `comfortable: 78`; `npx vitest run --project frontend src/webview/shared/primitives/Row.test.tsx src/test/lint/webview-tokens.test.ts` → 0 failed with the new title present; `grep -rniE "two-line|two lines|66 ?px" CHANGELOG.md ARCHITECTURE.md docs/ux/interaction-model.md src/webview | grep -v "## \[2.0.0\]"` → nothing above the 2.0.0 heading; CI UI job log shows the `[P9.12] comfortable rows` heights at 78-80.
- fix-4: `grep -rn "nuiget-toolbar-end" src/webview` → `primitives.css` plus the three primary buttons; the two new UI tests green in CI.
- fix-5: `grep -n "nuiget-details-row\b" src/webview` → empty; `grep -n "nuiget-details-actions" src/webview/main/main.css src/webview/main/features/details/DetailsPane.tsx` → the grid rule and one container; the rewritten details UI test green in CI.
- fix-6: `grep -rnE '^\s*(padding|margin|gap|row-gap|column-gap)[a-z-]*\s*:[^;]*[0-9](px|em|rem)' src/webview --include='*.css' | grep -v tokens.css | wc -l` → 0; `npx vitest run --project backend src/test/lint/webview-stylesheets.test.ts src/test/lint/webview-tokens.test.ts` → 0 failed with `every padding, margin and gap is a spacing token` present; the inset UI test green in CI; `npm run lint`, `npm run docs:check` → 0.
- Boundary: `grep -nE '^\| P9\.[^|]*\|[^|]*\| (open|in-progress|blocked) \|' docs/plans/STATUS.md` → empty; the phase review under `## Phase gates`; `git tag -l 'labs/2.0-P9-done'` → empty until the owner writes `P9 approved`.
`````

2026-10-17, P9.fix-2, follow-up: `nuiget-installed--all` is also used by `AllProjectsUpdates.tsx:307`. Answer, verbatim:

`````text
RULING (P9.fix-2 DO 1 correction): Option 1. Change `AllProjectsUpdates.tsx:307` to `nuiget-installed nuiget-installed--sections nuiget-updates` in P9.fix-2 (the verified sole other user of `--all`; `main.css:196-202` are the only rules keyed on it), so one class names the single-scroller layout on both tabs and `--all` disappears from the tree; `grep -rn "nuiget-installed--all" src` → empty is fix-2's VERIFY. Add one assertion in `AllProjectsUpdates.test.tsx` that the root carries `nuiget-installed--sections`. Screenshots: no named state captures the All Projects Updates tab (`main-updates` is the single-project Updates tab of `main-updates.ui.test.ts`; `main-installed-all` is the Installed tab, `main-all-projects.ui.test.ts:97`), so viewing `main-updates` is harmless but proves nothing for that tab; keep the fix-2 view list as ruled (`main-transitive-expanded`, `main-installed-single`, `main-installed-all`) and record in the STATUS note that the All Projects Updates layout is covered by the class rename plus the jsdom assertion, not by a screenshot. No new UI test for fix-2 on that tab.
`````

## Exact next step (one item ID)

P9.fix-5.

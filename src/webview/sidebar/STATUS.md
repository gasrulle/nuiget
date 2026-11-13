# STATUS — src/webview/sidebar (UX-P3.8)   commit b532959 (before the edit)   2026-11-13

git status --short src/webview/sidebar: clean before the edit.

Item: **UX-P3.8 Sidebar Browse and states** (X22, X67; SB9, SB14; DS-STATE-1..4). This note replaces the P9.fix-1 note (history at `3f2a2e0`).

## Verified by running

Baseline on 7e8f3d9 (this session, before UX-P3.fix-3; no source changed since): `npx tsc --noEmit` 0, `npm run check-types` 0, `npx eslint src` 0, `npx vitest run` `Test Files  178 passed (178)`, `Tests  2482 passed | 9 skipped (2491)`.

H27 counts owed by this item (design-advisor DO 1). Coloured-fringe pixels = channel spread > 8, per 11 px band of rows, columns 0-285 (scratch script, not evidence beyond these numbers); bands 55 and 66 are the Installed pane header:

| PNG | sha256 (12) | box | total | 55 | 66 |
|---|---|---|---|---|---|
| `captures/43292655563/sidebar-filter.dark-modern.300.png` | 30357b2c3d74 | text selected | 4090 | 123 | 373 |
| golden `sidebar-filter.dark-modern.300.png` | a92f184f931b | caret | 1460 | 0 | 0 |
| golden `sidebar-all-projects.dark-modern.300.png` | 157c6299264d | text selected | 27642 | 109 | 340 |
| `captures/43314017322/sidebar-all-projects.dark-modern.300.png` | 076db9717809 | caret | 26594 | 0 | 0 |

Reading (the design-advisor's caret reading holds): a caret in the focused box goes with a greyscale Installed pane header (and, in filter mode, its rows); a selection, which has no caret, keeps it LCD. The `sidebar-all-projects` golden holds a selected box, which `typeHeld` (4ca9b68) no longer produces: the 124 px of every run since UX-P3.7d. `sidebar-filter` read 0 px on runs 43314017322 and 43337212840 (both caret, both greyscale).

## Visual evidence (UI items)

**Push 1, form (1), run 43342362387 on 82cb616: green on every job; the criterion does not hold** (design-advisor DO 2). `ui-diff.txt`:
`[diff] sidebar-all-projects.dark-modern.300: 124 px (0.052 %, tolerance 0 %, 7384 px masked, above)`,
`[diff] summary: 88 compared, 87 at 0 px, 1 above tolerance, 0 without a golden, 0 refused`; `differs` 0 in both looks. Fringe bands
(script above) of the run's crops:

| Crop | sha256 (12) | total | 55 | 66 | 88 | 110 |
|---|---|---|---|---|---|---|
| `sidebar-filter.dark-modern.300` | bc89a8e8e26c (byte-equal to 43314017322's) | 1460 | 0 | 0 | 0 | 0 |
| `sidebar-all-projects.dark-modern.300` | 0290fdcaa8e6 | 26594 | 0 | 0 | 152 | 611 |
| `sidebar-sections.dark-modern.300` | 56224588abee | 29222 | 108 | 319 | 411 | 751 |
| `sidebar-hover.dark-modern.300` | a1338611064e | 29219 | 108 | 319 | 411 | 751 |
| `sidebar-narrow-200px.dark-modern.200` | 8b788b2d3d2c | 19772 | 108 | 319 | 411 | 690 |

The opaque section changed no pixel. Form (2) next (DO 4): the surface moved to the search row `.nuiget-sidebar-search`, the
section's background removed; one proving run, same criterion; if it fails too, stop and return with the band counts.

## Done (tested)

- Nothing yet.

## Done (untested)

- Nothing yet.

## Not started

- Push 1 (H27 form 1), push 2 (SB9, the Browse and Installed state cells), push 3 (SB14), per the design-advisor ruling below.

## Deviations from contract/ADR/decision

- None yet.

## Advisor decisions

### 2026-11-13, ambient advisor, scoping

> **P3.8 scoping (ambient advisor, 2026-11-13, in the session):** P3.8 owns the Browse rows (SB9), SB14, the sidebar Browse cells and the Installed loading cell (SB13), the H27 forms with the owed fringe counts and the DS-INSET-1 reading; sidebar Updates cells and both `-unavailable` states are P3.10's. Sequence the H27 form and SB14 in separate pushes (both move the same pixels); reuse `usePackageRows().uninstall` and `whyNotRemovable`; Enter unchanged; never press Delete or Enter on a sidebar row from the capture suite; stay in `src/webview/sidebar`; the note is this file.

### 2026-11-13, design-advisor, the forks A-G and the H27 form order (verbatim)

> DECISION: A = a2 (trash where installed everywhere, + otherwise, both open the actions menu; no Delete write under All Projects). B = b1. C = c1. D = d2 (the bar in the Installed pane; its revalidating capture goes to P3.10). E = eight cells, named in DO 9. F = yes: SB14 is the last push, gated on the H27 result, webview half only. G = no new helper and trigger 6 is not live; three helper edits are pre-ruled (DO 10). H27 form order is kept, with its criterion and its end condition replaced (DO 1 to 4).
>
> First, where the brief or the tracker is off:
> - Hashes match for all six PNGs named, and for `captures/43292655563/sidebar-filter.dark-modern.300.png` (30357b2c…). I opened the three 43314017322 captures, the `sidebar-filter` and `sidebar-all-projects` goldens and the 43292655563 capture.
> - The fringe counts are the brief's. The script is in a scratchpad I cannot read, so I did not verify them.
> - The counts the tracker owes are for 30357b2c… against a92f184f…. The brief counted bc89a8e8… instead. They are still owed (DO 1).
> - The tracker's "expected `sidebar-filter` ≳ 20 000" cannot be right: a header and two rows cannot reach it when the 29-row cells read about 29 000. It is superseded by the per-band criterion of DO 2.
> - PNG reading, class not verified: in golden `sidebar-all-projects.dark-modern.300` (157c6299…) the box text is selected (about 14,29,75,18) and its pane header is the LCD one by the brief's bands. In capture 076db971… the box shows a caret (about 88,29,2,18) and the header is greyscale. In capture 30357b2c… the box text is selected (about 14,29,100,18) and the Installed section differs from the caret golden. All three fit "a blinking caret in the box makes the section greyscale; a selection, which has no caret, does not". That golden holds box content the `typeHeld` reach no longer produces, which is why the cell reads 124 px on every run.
> - P3.8 owns no pending entry in `measure.ts`, `a11y.ts`, `states.ts`, the CSS baseline or `check-design-tokens.mjs` (grep empty).
> - DS-STATE-2/3/4 and DS-HEIGHT-11 are `pending: 'P3.10'` in the sidebar scope (`measure.ts:271, 361-363`). P3.10 flips them, not this item (plan §2.7).
>
> WHY:
> - A: the menu of an installed-everywhere Browse row is Change Version, Uninstall, Copy, View Details (`package.json` `webview/context`, `browseRow && nuiget.installed`). The trash therefore leads to an Uninstall command, and its name ends in `...` because it opens UI (D22). Delete opening a menu would give the key a second meaning that ADR-013 Decision 2 does not have, and Shift+F10 already opens the menu.
> - B: the plan row names "Uninstall and Delete on installed rows", and a row action without a key is forbidden (gotcha "Buttons inside `role="option"`"). The sidebar Installed rows already uninstall at once; the confirmation is P4.2b's for all three sidebar lists.
> - C: DS-STATE-2's measurement says "in Browse … no skeleton shows", §9's sidebar Browse cell is "the bar, then rows first under it (D56)", and the main mirror is the bar alone (`BrowseList.tsx`, UX-P3.2).
> - D: the tracker hands SB13's loading cell to P3.8, and P3.10's scope names sidebar Updates only, with "§8.1 has no row left for P3" as its gate. DS-STATE-2 puts the bar "at the top of the list or pane that loads" (exemplar: view progress at the pane header's bottom, `paneviewlet.css:78-87`). The bar in the sidebar header (`SidebarView.tsx:153`) is in the wrong place. A wrapper span for a test id around `Skeleton` (d1) is a hook §8.1 does not list.
> - F: with the caret reading above, SB14 before a proven form would turn every two-section golden greyscale. `sidebar-sections` today shows an unfocused box (capture 56224588…, box 8,25,284,26: placeholder, no ring).
> - G: DS-INSET-1's sidebar helper already reads every `.nuiget-row-name` (`measure.ts:1115-1121`), so Browse rows are read as soon as a state shows them. The DS-STATE helpers exist, so trigger 6 is not live.
>
> DO:
> H27 (push 1, CSS only)
> 1. Before any form, count the coloured-fringe bands of capture 30357b2c… against golden a92f184f…, and of golden 157c6299… against capture 076db971…, restricted to rows 55-77 (the pane header). Paste them. Expected if the caret reading holds: selection PNGs non-zero in those bands, caret PNGs 0.
> 2. Form (1): add `background-color: var(--nuiget-color-bg-sidebar)` to the single-selector `.nuiget-sidebar-section` rule at `sidebar.css:81`, not the shared rule at :46. Add `--nuiget-listbox-bg: var(--nuiget-color-bg-sidebar)` to the existing `.nuiget-sidebar-browse` rule at :64, because the browse list sits outside `.nuiget-sidebar-section-content` and has no opaque carrier. One proving run. Criterion: `sidebar-filter.dark-modern.300` bands from 55 down are non-zero and the header bands are within the range of `sidebar-sections`' header bands. `sidebar-all-projects.dark-modern.300` reads 0 px. Every two-section cell stays 0 px.
> 3. If the criterion holds, adopt `sidebar-filter.dark-modern.300` alone as `approved` under this ruling. `sidebar-all-projects` is not re-adopted; any pixel outside its mask comes back to me.
> 4. If the header stays greyscale, try form (2) once: the opaque surface moves to the layer's start, which the caret reading says is the search box. One proving run, same criterion. If both forms fail, stop and return with the band counts. No browse golden is adopted greyscale and SB14 is not pushed.
>
> SB9, Browse states, Installed loading (push 2)
> 5. `BrowseResults.tsx`, single project. An installed row whose entry has no `whyNotRemovable` obstacle gets `IconButton` "Uninstall <id>", `row-action-uninstall`, `TrashIcon`, `tabIndex={-1}`. The button and `onDelete` both go through `usePackageRows(announce).uninstall` with the entry found in `installed.result`, never a second `run('ops/remove')`. With an obstacle there is no button and Delete announces it. Enter on an installed row keeps its announcement. Delete on a row that is not installed does nothing.
> 6. All Projects. `where.length === listedCount && listedCount > 0` gets `TrashIcon`, label "Uninstall <id>...", `row-action-uninstall`, opening `openMenuOf`. Otherwise `PlusIcon`, label "Install <id> <version>...", as today. `onDelete` on a row installed somewhere announces one sentence that the uninstall is in the actions menu (Shift+F10) and writes nothing. Rewrite both `hint` sentences to name Delete and the menu.
> 7. States in `BrowseResults.tsx`:
>    - loading: an overlay wrapper at the area's top holding `<ProgressBar data-testid="sidebar-browse-progress" label="Searching" />`; `Skeleton` removed.
>    - revalidating: the same bar and test id over the kept rows; the list stays `aria-busy`.
>    - error: both banners carry `sidebar-browse-error` and end with a period, built with the sentence helper `BrowseList.tsx` uses if it is importable from shared code; if it is not, stop and ask.
>    - empty: `EmptyState` with `sidebar-browse-empty`.
>    - The wrapper is one new `nuiget-` class in `sidebar.css`, tokens only, positioned as `main.css:88-93`, so the list does not move when the bar comes and goes.
> 8. `InstalledSection.tsx`: the same overlay at the top of the section content with `sidebar-installed-progress`, shown on a first load above the existing `Skeleton` (single project and All Projects) and while revalidating. Remove the bar from `SidebarView.tsx:153`.
> 9. Capture states. All are dark-modern 300 modern only, except the hover cell which also gets classic. No reach presses Delete, Enter, Ctrl+Enter or a row action.
>    - `sidebar-browse-results`: Gateway, "Serilog" searched with Enter. Ready when `sidebar-browse-list` holds `package-row-serilog` with the Installed badge and at least one row with `row-action-install`.
>    - `sidebar-browse-hover` (modern and classic): the same, the pointer on `package-row-serilog`. The band and its trash action show. Add it to `HOVER_STATES`.
>    - `sidebar-browse-loading`: the answer held through the content frame's `postMessage` wrapper. The bar alone.
>    - `sidebar-browse-revalidating`: rows kept under the bar, list `aria-busy`.
>    - `sidebar-browse-empty`: "zz-no-such-package-nuiget".
>    - `sidebar-browse-error`: the held answer released as a failure, one fixed sentence.
>    - `sidebar-installed-loading`: the Installed answers held and another project chosen. The readiness predicate includes: the Installed header is busy, it has no count badge, and no `.nuiget-row-option` is visible in the sidebar. If the Updates pane keeps rows during the hold, reach the cell under `@installed` instead.
>    - Masks: a new `LIVE_SIDEBAR_RESULTS` on `[data-testid="sidebar-browse-list"]` (`LIVE_RESULTS` targets the main list), `LIVE_SIDEBAR_CARET` on every browse cell, `LIVE_MOTION` on the three cells with a bar or skeleton.
>    - "Installed everywhere" has no capture: the dense workspace's Empty project makes it unreachable. jsdom covers it.
>    - New goldens are adopted as `baseline`. Their ARIA snapshots are adopted from the green run under this ruling.
> 10. `measure.ts`, entries for these states only:
>     - `STATE_MARKERS`: both browse bar cells map to `sidebar-browse-progress`, empty and error to their ids, `sidebar-installed-loading` to `sidebar-installed-progress`.
>     - `statePrefix` (the collector's `cellList`) returns `sidebar-browse` and `sidebar-installed` for these states; today it returns `installed` and reads the wrong ids.
>     - `barAlone` also holds for `sidebar-browse-` states; otherwise the hard DS-STATE-1 reads "skeleton 0" as red.
>     - DS-INSET-1 in the sidebar scope: when no title and no row name is rendered but the search box is, judge the search inset alone and print `content none; search <x>`; today it is not measurable, hence red.
>     - No scope status changes. The sidebar DS-STATE-2/3/4 and DS-HEIGHT-11 lines print `(pending P3.10)`; paste them. A value off target on a cell this item builds is fixed here in `sidebar.css`; the flip stays P3.10's.
> 11. Run the local capture tier before push 2. I read only DS-INSET-1 and the three DS-STATE-1 clauses; browse mode has no section header in any of the five browse cells, so other hard sidebar rules may go red. Send every red line in one follow-up brief; do not add a state to an exception list on your own.
> 12. Docs:
>     - Interaction model §8: add `sidebar-browse-progress`, `sidebar-browse-empty`, `sidebar-browse-error`, `sidebar-installed-progress`. §8.1 keeps `sidebar-updates-progress` and `sidebar-updates-error` for P3.10.
>     - Interaction model §5, Delete row: the sidebar cell gains "and an installed Browse row of one project".
>     - A separate docs commit citing this ruling corrects `design-system.md` §9: the sidebar Installed and Browse loading cells name the marker `sidebar-installed-progress` / `sidebar-browse-progress`, the capture being `…-loading`. The Updates row is P3.10's.
>     - DECISIONS row: "Sidebar state markers: one `-progress` hook per list for loading and revalidating, as the main panel; the bar sits in the pane that loads; Browse rows: trash where installed (one project: uninstalls; All Projects, installed everywhere: opens the actions menu), Delete on an installed Browse row of one project (UX-P3.8)."
>     - Tracker hand-offs: to P4.2b, "the Delete confirmation covers the sidebar Browse row; ADR-013 Decision 2 names Installed and Updates only"; to P3.10, "capture `sidebar-installed-revalidating`; flip the sidebar DS-STATE-2/3/4 and DS-HEIGHT-11 with these cells' pasted values".
>
> SB14 (push 3, only after DO 2 or DO 4 held)
> 13. `SidebarView.tsx`: focus the search box once at mount, with a jsdom test that it is `document.activeElement`. `SidebarHost.ts` is not this item's file; the host already sends `ui/focusSearch` on visibility.
> 14. Before the push, read locally in the two-section states: `document.hasFocus()`, `document.activeElement`'s test id, and the `[keys] sidebar` lines (the walk's first expected stop is the search box).
> 15. If the two-section cells move on CI, adopt them as `approved` under this ruling and add `LIVE_SIDEBAR_CARET` to `sidebar-sections`, `sidebar-hover`, `sidebar-narrow-200px` and `sidebar-update-all-dialog`, but only when both hold: every differing pixel is inside the box (8,25,284,26 at 300 px), and the band counts below row 55 equal the goldens'. Otherwise stop and return.
> 16. If a `[keys]` line or a hard DS-FOCUS line changes, return with the lines.
>
> DO NOT:
> - Do not adopt `sidebar-all-projects.dark-modern.300`, widen a tolerance, or mask text to end the 124 px.
> - Do not use `will-change` (form 3) without a new ruling.
> - Do not push SB14 before the form's band counts are pasted.
> - Do not flip a sidebar `pending: P3.10` rule or add an `AXE_PENDING`, `KEYS_PENDING` or exception-list entry to go green.
> - Do not add a `data-testid` prop to `Skeleton` (trigger 5) or a wrapper whose only purpose is a test id.
> - Do not make Enter uninstall, and do not add a Delete write under All Projects.
> - Do not edit `SidebarHost.ts`, `package.json` menus or `design-system.md` inside the item commits.
> - Do not keep the bar in the sidebar header beside the pane's bar.
>
> CONTRACT CHANGE: none. No `*Props` type changes. If the UI test of DO 17 below shows the box unfocused at first reveal, the host half of SB14 (`src/host/SidebarHost.ts`) is a stop-and-ask for the architecture-advisor. ADR-013 Decision 2's wording (Delete names Installed and Updates only) is the architecture-advisor's at P4.2b.
>
> VERIFY:
> - Push 1: the pasted band counts meet DO 2; `[diff] sidebar-all-projects.dark-modern.300: 0 px`; every other sidebar cell 0 px except the re-adopted `sidebar-filter`.
> - Push 2: `[measure] DS-STATE-1@sidebar-browse-loading|-revalidating|-empty|-error` and `@sidebar-installed-loading` read `missing: none (hard)`; `DS-INSET-1@sidebar-browse-results` and both `-hover` cells read `content 28` (modern) / `content 20` (classic); `grep -n 'sidebar-browse-progress\|sidebar-installed-progress' docs/ux/interaction-model.md` shows them in §8 only; `node scripts/check-css-baseline.mjs --item P3.8` → `0 entries`; `[axe]` 0 on the eight cells; `node scripts/check-rule-coverage.mjs --states <the eight>` pasted.
> - Push 3 (DO 17): a `sidebar.ui.test.ts` case polls that `sidebar-search-input` is the active element after the view is first opened; and one local check that, with an editor focused and the side bar restored at window start, the editor keeps the focus (jsdom cannot see this). The DO 15 conditions pasted with numbers.
> - `design-judge` on the eight cells, rows `pending artboard`; every standing finding fixed or sent back.
>
> DEFECTS:
> - captures/43314017322/sidebar-all-projects.dark-modern.300.png 0,55,300,24 NEW: with the sidebar search box focused, the pane header and rows keep subpixel text; measured as coloured-fringe count per 11 px band > 0 in every text band of a sidebar cell (the brief's bands 55/66 = 0 against the golden's 109/340, unverified by me) major: pane header greyscale against the golden's LCD header.
> - src/test/ui/v2/golden/sidebar-filter.dark-modern.300.png 0,55,300,70 same NEW rule major: the golden itself is the greyscale form (brief: nothing from band 55 down); it is replaced by DO 3, not kept.
> - src/webview/sidebar/SidebarView.tsx:153 (no capture exists) DS-STATE-2 major: the Installed revalidation bar sits in the sidebar header, not at the top of the pane that revalidates; fixed by DO 8.
> - src/webview/sidebar/BrowseResults.tsx:117 (no capture exists) DS-STATE-2 major: a skeleton on a first Browse search where the rule allows the bar alone; fixed by DO 7.
> - src/webview/sidebar/BrowseResults.tsx:120,128 (no capture exists) DS-COPY-3 / DS-STATE-1 minor: the error sentence has no closing period and no marker; fixed by DO 7.
>
> Not checked: fringe counts (not runnable by me); the classic goldens and `sidebar-sections` golden were not opened; RUN-ux.md §4 was not read beyond its headings; `KEYS` walk start and the remaining hard sidebar rules on headerless cells were not traced, which is why DO 11, 14 and 16 return to me with lines.
## Exact next step

UX-P3.8 push 1: form (1) in `sidebar.css` (design-advisor DO 2), one proving run read by the band criterion.

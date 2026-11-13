# STATUS — src/webview/sidebar (UX-P3.8, `in-progress`: push 3, SB14)   commit 1ce4625 (push 3 follows it)   2026-11-13

git status --short src/webview/sidebar: clean before the edit.

Item: **UX-P3.8 Sidebar Browse and states** (X22, X67; SB9, SB14; DS-STATE-1..4). This note replaces the P9.fix-1 note (history at `3f2a2e0`).

## Verified by running

Baseline on 7e8f3d9 (this session, before UX-P3.fix-3; no source changed since): `npx tsc --noEmit` 0, `npm run check-types` 0, `npx eslint src` 0, `npx vitest run` `Test Files  178 passed (178)`, `Tests  2482 passed | 9 skipped (2491)`.

After push 2's edits (on fe63e13, the review's fixes included):

- `npx tsc --noEmit` → exit 0; `npm run check-types` → exit 0; `npx eslint src` → exit 0; `npm run lint` → exit 0
- `npx vitest run --project frontend src/webview/sidebar` → `Tests  78 passed (78)`
- `npx vitest run --project backend src/test/lint` → `Test Files  39 passed (39)`, `Tests  425 passed (425)`
- `npm test` → `Test Files  178 passed (178)`, `Tests  2489 passed | 9 skipped (2498)`, `[axe-coverage] 73 files, 42 rules passed somewhere, 0 missing`, exit 0
- `npm run bench` → exit 0
- `node esbuild.mjs --production --analyze` → `dist/extension.js 299452 / 326720`, `dist/webview.js 587014 / 613761`, `dist/sidebar.js 360417 / 374532`
- `npm run package:vsix` → exit 0, `DONE  Packaged: nuiget-v2.0.0.vsix (17 files, 611.08 KB)`; `npm run check:vsix` → `check:vsix: OK`
- `npm run docs:check` → `docs:check — the documents agree with the tree.`, `docs:protocol:check — docs/protocol.md is up to date.`
- `npm run check:matrix` → `check:matrix — 262 rows: 255 covered, 4 gap, 3 manual-credentials; 0 finding(s).`
- `node scripts/check-css-baseline.mjs --item P3.8` → `check-css-baseline: 0 entries for P3.8`
- `grep -n background src/webview/sidebar/sidebar.css` → `17:    background: var(--nuiget-color-bg-sidebar);` only (the view's own rule; nothing of 853edd4)
- `precommit-review` (wf_1d0c1321-a20, `--cached`, the re-run): blocking 1, non-blocking 4, refuted 0, incomplete 0. The blocking finding (Delete on a
  Browse row against ADR-013 Decision 2, a universal trigger) is closed by the architecture-advisor's ruling of 2026-11-13 (RUN-ux §4.4). Applied:
  DS-INSET-1's search-alone branch only for `sidebar-browse-` states (a `sidebar-sections` case asserts not measurable); the Installed bar test
  reads the revalidating bar inside the pane; README's Delete row "of the selected project"; R262 narrowed and R263 for All Projects.
- `precommit-review` (wf_a177c213-464, `--cached`): blocking 2, non-blocking 7, refuted 0, incomplete 0. Fixed: the keys table's Delete row of
  interaction model §5 (the ruled sidebar cell); this section's post-edit output and header. Applied: the Browse row's busy status from the
  ops slice (`busyStatus` returned by `usePackageRows`; "Uninstalling" asserted after Delete, "Installing" in the install test);
  `measure-rules.test.ts` covers `cellList`'s two sidebar prefixes and DS-INSET-1's search-alone reading; a CHANGELOG `### Added` entry;
  the ARCHITECTURE sidebar paragraph; README's Delete row; matrix R262 and R61 narrowed; ADR-013 Decision 2 under Deviations.

On 57b28d9 (after d136c89 and e3f3574, the gates of the tree as committed; precommit-review of the range below):

- `npx tsc --noEmit` → exit 0; `npm run check-types` → exit 0; `npx eslint src` → exit 0
- `npm test` → `Test Files  178 passed (178)`, `Tests  2489 passed | 9 skipped (2498)`, `[axe-coverage] 73 files, 42 rules passed somewhere, 0 missing`, exit 0
- `npm run bench` → exit 0; `npx vitest run --project backend src/test/lint` → `Tests  425 passed (425)` (with the follow-up pins); `npm run docs:check` → agree
- `precommit-review` (wf_9681c613-343, range `0343ba5..HEAD`): blocking 0, non-blocking 8, refuted 0, incomplete 0. Applied in the follow-up commit:
  the remaining ruled exception lists pinned in `measure-rules.test.ts`; two DECISIONS rows (badge centring, DS-DIVIDER-1's browse reading);
  the tracker row names the badge box, cause and rule; these gate lines; the placeholders below; a CHANGELOG `### Changed` bullet; a gotcha
  row for a titled `Badge` read by `textContent`. Not applied: dropping `SIDEBAR_NO_ROW_STATES` from DS-HEIGHT-3, DS-ROW-1, DS-ROW-6 and
  DS-ICON-3 (a no-op on rules without a sidebar scope, kept so the existing pin "these six share DS-ROW-4's exceptions" stays unchanged;
  recorded under Deviations).

H27 counts owed by this item (design-advisor DO 1). Coloured-fringe pixels = channel spread > 8, per 11 px band of rows, columns 0-285 (scratch script, not evidence beyond these numbers); bands 55 and 66 are the Installed pane header:

| PNG | sha256 (12) | box | total | 55 | 66 |
|---|---|---|---|---|---|
| `captures/43292655563/sidebar-filter.dark-modern.300.png` | 30357b2c3d74 | text selected | 4090 | 123 | 373 |
| golden `sidebar-filter.dark-modern.300.png` | a92f184f931b | caret | 1460 | 0 | 0 |
| golden `sidebar-all-projects.dark-modern.300.png` | 157c6299264d | text selected | 27642 | 109 | 340 |
| `captures/43314017322/sidebar-all-projects.dark-modern.300.png` | 076db9717809 | caret | 26594 | 0 | 0 |

Reading (the design-advisor's caret reading holds): a caret in the focused box goes with a greyscale Installed pane header (and, in filter mode, its rows); a selection, which has no caret, keeps it LCD. The `sidebar-all-projects` golden holds a selected box, which `typeHeld` (4ca9b68) no longer produces: the 124 px of every run since UX-P3.7d. `sidebar-filter` read 0 px on runs 43314017322 and 43337212840 (both caret, both greyscale).

## Push 3 (SB14), 2026-11-13

SB14 as delivered, to the exemplar's condition (design-advisor rulings of 2026-11-13 below, "SB14 forms 1-3"): the box claims the
focus once, when the side bar's own document has the focus and nothing in it holds it: at mount, else at the document's first
focus gain (`SidebarView.tsx`, one effect, a window `focus` listener removed after the first claim and on unmount). The
Extensions view puts the focus in its box whenever the view takes the focus (research X35, line 992). **Gap, named:** after the
view is opened from the activity bar the workbench gives the view no focus, so the box is not focused then; a host row is
proposed (below). An unconditional `focus()` at mount (form 1) was refused on the local readings: it took the focus from an
editor when the webviews were reloaded.

Verified by running (local, macOS, VS Code 1.140.0; never pixel evidence):

- `npx vitest run --project frontend src/webview/sidebar` → `Test Files  7 passed (7)`, `Tests  82 passed (82)`; the four SB14
  cases (new): "SB14: the box takes the focus at mount when the sidebar document has the focus and nothing in it does", "SB14: a
  document without the focus at mount leaves the body active, and its first focus gain moves the focus to the box", "SB14: a focus
  gain while another element holds the focus leaves it there", "SB14: after the first claim a later focus gain leaves the focus
  where it is" (the form-1 case "the search box has the focus when the view first renders, before any list has arrived (SB14,
  UX-P3.8)" was never committed and is replaced by them).
- `sidebar.ui.test.ts` "the sidebar search box takes the focus when the view takes it (SB14, UX-P3.8)" (the view opened, the
  command `nuiget.sidebarView.focus` held inside the wait): on a VSIX built from this working tree `✔` 3 of 3 runs; on a VSIX
  built with `SidebarView.tsx` and its test stashed `Error: Timed out after 30000 ms waiting for the sidebar search box as the
  active element of the focused view`. One run of an earlier draft (the command run once, a 10 s wait) failed with the effect,
  hence the command held inside the wait. A reading after the command: `top iframe.webview`, the sidebar `hasFocus false, active
  body` at once, then the box active within the wait.
- Reload Webviews check (the editor focused, `Developer: Reload Webviews`), with this form: `[sb14] before: top
  div.native-edit-context, in editor true …; sidebar hasFocus false, active body`; `webviews reloaded, sidebar up: top
  div.native-edit-context, in editor true …; sidebar hasFocus false, active body`; `+5 s:` the same. Form 1 on the same check:
  `webviews reloaded, sidebar up: top iframe.webview.ready, in editor false …; sidebar hasFocus true, active
  sidebar-search-input` (and +5 s the same); without SB14: `in editor true` at both readings.
- Activity-bar open (scratch `[sb14-open]`): `+0/1000/3000/6000 ms: top body., in side bar false; sidebar hasFocus false,
  active body` (the gap); after the command `nuiget.sidebarView.focus`: `top iframe.webview …; sidebar hasFocus true, active
  sidebar-search-input` at +0, 1000 and 3000 ms.
- Cmd+B proxy (the host observation): the editor focused, the side bar hidden and shown: `side bar shown, webview up: sidebar
  hasFocus true, active sidebar-search-input; top iframe.webview.ready, in editor false`, identical with and without SB14 (the
  host's `ui/focusSearch` on every change to visible, `src/host/SidebarHost.ts:57-61`).
- Tier A (`node scripts/ui-harness.mjs --installed --tier A` on this form, a temporary `[debug-sb14]` print removed since): the
  two-section states `sidebar-sections: hasFocus false, active body` (×5), `sidebar-hover: hasFocus false, active body`,
  `sidebar-narrow-200px: hasFocus false, active body`; `[keys] sidebar` lines identical to CI run 43436877716 (`diff` empty);
  `88 passing`, `6 failing`, this Mac's known reds (SPEC `project-selector Δx 11` on five states, the artboard colour profile).
- The scratch checks live in the session scratchpad and are never committed.
- `precommit-review` wf_f3f154cd-a2d (`--cached`, P3.8): blocking 0, non-blocking 7, all applied: a ref keeps the claim to one
  under StrictMode (development builds run the effect twice; the second run would have kept the listener), with the case "SB14:
  under StrictMode the box claims once, and a later focus gain leaves the focus where it is" (fails without the ref, passes with
  it; sidebar frontend `83 passed`); the CHANGELOG headline narrowed to "The sidebar's search box has the focus when you first
  move to the sidebar view"; regression-matrix row R265; a DECISIONS row; the gotcha row "A webview focusing an element at
  mount". The local readings above ran on the VSIX before the ref, whose production behaviour (one effect run) is the same.
- Gates on the working tree: `npx tsc --noEmit` 0, `npm run check-types` 0, `npx eslint src` 0, `npm run lint` 0; `npm test` →
  `Test Files  179 passed (179)`, `Tests  2506 passed | 9 skipped (2515)`, `[axe-coverage] 73 files, 42 rules passed somewhere, 0
  missing`; `npm run bench` → `Tests  75 passed (75)`; `npm run docs:check` → agree; `npm run check:matrix` → 0 findings;
  `node scripts/check-css-baseline.mjs --item P3.8` → `0 entries`; `node esbuild.mjs --production --analyze` → `dist/extension.js
  299460 / 326720`, `dist/webview.js 587014 / 613761`, `dist/sidebar.js 360726 / 374532` (+309 bytes); `npm run package:vsix` →
  exit 0 (the VSIX the local readings ran on).

**Red run 1 of push 3: 43454600679 on affe1b8** (`UI` red, `48 passing`, `1 failing`: `the sidebar search box takes the focus
when the view takes it (SB14, UX-P3.8)`, `Error: Timed out after 30000 ms waiting for the sidebar search box as the active element
of the focused view`; every other job green). Cause, reproduced locally by running `sidebar-parity.ui.test.ts` and
`sidebar.ui.test.ts` in CI order (`2) … takes the focus …` timed out): the box claims the focus once per document (the ruled
form), and the parity suite, which runs first, had already spent the claim; run alone the case passed. Fix forward: the case
reloads the webviews (`Developer: Reload Webviews`) after opening the view, so the sidebar mounts afresh, then gives the view the
focus with the same command as before; the same two suites in CI order: `✔ the sidebar search box takes the focus when the view
takes it (SB14, UX-P3.8)`, `13 passing`, `1 failing` the local-only parity case `Open Full Manager opens the main panel beside the
sidebar` (`Timed out after 60000 ms waiting for two webviews`; `✔` on CI run 43454600679). Deviation: the remount precondition is
added to the ruled steps (open, focus command, poll); the focus path itself is unchanged.

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

**Push 1b, form (2), run 43344632890 on 853edd4: green on every job; the criterion does not hold.** The same `[diff]` lines as
43342362387 (`sidebar-all-projects.dark-modern.300: 124 px … above`, `summary: 88 compared, 87 at 0 px, 1 above tolerance`),
`differs` 0 in both looks. `sidebar-filter.dark-modern.300` bc89a8e8e26c again (1460; bands 55, 66 = 0),
`sidebar-all-projects.dark-modern.300` 076db9717809 (byte-equal to 43314017322's; 26594; bands 55, 66 = 0),
`sidebar-sections.dark-modern.300` 56224588abee (29222; 55:108 66:319). Neither form moved a pixel: returned to the
design-advisor (DO 4); no browse golden adopted, SB14 not pushed.

**Push 2, run 43353120809 on e3f3574 (fe63e13, 0343ba5, d136c89, e3f3574): green on every job.** `ui-log` (artifact 14006006730) and
`ui-screenshots` (14005503441) in `captures/43353120809/`.

- `[diff] sidebar-all-projects.dark-modern.300: 124 px (0.052 %, tolerance 0 %, 7384 px masked, above)` (the H27 witness); the eight new cells
  `no golden`; `[diff] summary: 88 compared, 87 at 0 px, 1 above tolerance, 8 without a golden, 0 refused`; `differs` 0 in both looks;
  `grep -c 'pending P3.8)'` 0.
- Hard `not measurable` lines on the seven cells: 0. `DS-DIVIDER-1@sidebar-browse-results|-hover|-revalidating: no pane header (browse); rows
  20 unlined (hard)`; `DS-INSET-3@sidebar-browse-hover: row actions 6 (target 6) (hard)`; `DS-DIVIDER-1@sidebar-installed-loading: panes 1:
  first unlined, 0 lined; rows 0 unlined (hard)`; `DS-GRID-2b@sidebar-installed-loading: installed 0/0 (hard)`; DS-STATE-1 `missing: none`
  on `-loading`, `-revalidating`, `-empty`, `-error` and `sidebar-installed-loading`; DS-INSET-1 `content 28; search 8` (modern rows),
  `content 20; search 20` (classic hover), `content none; search 8` (`-empty`, `-error`, `-loading`).
- `[axe]` 0 violations, 0 incomplete on all eight captures (e.g. `[axe] sidebar-browse-results: 0 violations, 0 incomplete, 3
  accepted-as-design, 36 rules passed, 53 inapplicable (a11y-full-axe-real-page, hard)`).
- Pending P3.10 lines of the state cells (follow-up 3 DO 4; all on target):
  `[measure] DS-STATE-2@sidebar-browse-loading: bar at list top; skeleton rows 0, rows 0; rows-first pending P5.9a (pending P3.10)`,
  `[measure] DS-STATE-2@sidebar-browse-revalidating: bar at list top; rows 20; aria-busy (pending P3.10)`,
  `[measure] DS-STATE-2@sidebar-installed-loading: bar at list top; skeleton 3, rows 0 (pending P3.10)`,
  `[measure] DS-STATE-3@sidebar-browse-empty: start, 20/20, 0 buttons, gap 8 (1) (pending P3.10)`,
  `[measure] DS-STATE-4@sidebar-browse-error: 1 glyph (error), 1 buttons, ends with a full stop (1) (pending P3.10)`,
  `[measure] DS-HEIGHT-11@sidebar-browse-loading|-revalidating|@sidebar-installed-loading: 2 (target 2) (pending P3.10)`.
- `node scripts/check-rule-coverage.mjs --states <the seven>` → `check-rule-coverage: 7 states, 12 unasserted ids, 0 gap or hard at P0`.
- H27 probe: `[probe] h27 P-a|P-b|P-c: popups 0, aria-expanded false, active sidebar-search-input, hasFocus true, animations 0`; the three
  PNGs byte-identical (`probe/h27-P-a.png` cab6a927734c…). Ink/chroma per 11 px band (cols 0-285; ink = > 30 from the background, chroma =
  spread > 8): P-a `55:224/0 66:552/0 88:332/0 110:575/0 132:534/0 154:911/0`; `sidebar-sections` (56224588abee) `55:241/102 66:593/300
  88:390/351 110:725/674 132:651/594 154:1123/1042`. **P-a is greyscale: a focused, empty box is enough** (follow-up 1 DO 5): SB14 not pushed.
- Adopted as `baseline` from 43353120809 through `captures/43353120809/adopt-p38/` (`compare-goldens: 8 goldens adopted from run
  43353120809 as baseline`), with the seven ARIA snapshots (artifact = committed):

| Cell | sha256 | Text by band |
|---|---|---|
| `sidebar-browse-results.dark-modern.300` | 3c53215be86209e8c9c73dfef767dc700bc4b8004fe3faa1ed1a861d5cdb3ace | rows LCD |
| `sidebar-browse-hover.dark-modern.300` | 6f160e537758eb5948bd329e7ee278aec0d515b1d1196de80d6a7116cc741495 | rows LCD |
| `sidebar-browse-hover.dark-modern-classic.300` | d982a5c685fca7f5a44243a73de718cf381cc28db322309a7a2a151f044788e8 | rows LCD |
| `sidebar-browse-revalidating.dark-modern.300` | b32e06553a12a9eb169f6a548e7416fe621f43cb413d4d66f54bbf6f0e2ee6a7 | rows LCD |
| `sidebar-browse-loading.dark-modern.300` | 0def00fe4c420476b97453779ec579ffdd62acc853fe3f1501c8037d494be243 | the bar alone |
| `sidebar-browse-empty.dark-modern.300` | a21f4b97f0422f4973fe63441ace8f2da62dacace3e240021085d129a5840959 | **greyscale** (sentence 66:869/0) |
| `sidebar-browse-error.dark-modern.300` | c62e12e6907d2901c9d6fa51e195e81037814f021a186ad3233f08910238a6d8 | **greyscale** (banner 55:237/0 66:380/0) |
| `sidebar-installed-loading.dark-modern.300` | 432be39cf6df9fb248190d53c13202894de2570a25121a048316eabc0144d352 | **greyscale** pane header (55:103/0 66:319/0) |

  ARIA: `sidebar-browse-empty` 8868edf9dc0342e3…, `-error` 504ae5ffbccf416c…, `-hover` 43b989ab180bdde4…, `-loading` 1847f732e760f239…,
  `-results` d4bc881fb17d2899…, `-revalidating` 1a09ae19b9dd2807…, `sidebar-installed-loading` 5ee5fea14bf34d0b… (byte-equal to the artifact's).
- design-judge wf_bd76cb75-079 (screen; the three row cells against `main-installed-all.dark-modern.1200.png` and its spec):
  `{states 3, candidates 3, standing 1, blocking 0, refuted 0, singleJudge 1, incomplete 0}`; standing `sidebar-browse-hover#D1` (major,
  the 20 px label badge 2/0 in the 22 px compact band) `fixed` by a fix row to be placed (follow-up 4); the `-results` single-judge finding
  the same defect, informational. Five cells `pending artboard`. `docs/plans/judge-log/P3.8.json`.

## Done (tested)

Push 2 (jsdom and the lint suite; the UI job is its test):

- `BrowseResults.tsx` (SB9, first ruling DO 5-7): one project, an installed row without an obstacle gets `IconButton` "Uninstall <id>"
  (`row-action-uninstall`, `TrashIcon`), the button and `onDelete` through `usePackageRows(announce).uninstall`; with an obstacle no
  button, Delete says why; Delete on a row not installed writes nothing; Enter keeps its announcement. All Projects: "Uninstall <id>..."
  where installed in every project, "Install <id> <version>..." otherwise, both opening the actions menu; Delete on a row installed
  somewhere says the menu does it and writes nothing. Both `hint` sentences name Delete. States: the first search's bar alone
  (`sidebar-browse-progress`, the Skeleton removed), the same bar over the kept rows while it asks again, `sidebar-browse-error` on
  both banners with one full stop (`sentence` of `src/webview/shared/updates/sentence.ts`), `sidebar-browse-empty`.
- `InstalledSection.tsx` (DO 8): the pane's bar `sidebar-installed-progress` over its list's top edge on a first load (above the
  Skeleton) and while revalidating; `SidebarView.tsx`: the side bar header's bar removed.
- `sidebar.css`: `.nuiget-sidebar-progress` (the overlay, as `main.css:88-93`), `position: relative` on the browse and section content
  rules, `--nuiget-listbox-bg` on `.nuiget-sidebar-browse` (push 1); form 2's `.nuiget-sidebar-search` rule removed (follow-up 1 DO 1).
- New tests in `BrowseResults.test.tsx` (no title rewritten): `an installed package of the selected project is uninstalled from it by
  its row button or Delete; Delete on a package not installed writes nothing (UX-P3.8, SB9)`, `a package that cannot be uninstalled has
  no Uninstall button and Delete says why (UX-P3.8, SB9)`, `under All Projects a package installed in every project offers
  Uninstall..., which opens the actions menu; Delete names the menu and writes nothing (UX-P3.8, SB9)`, `a first search shows the 2 px
  bar alone, a failure the inline error with one full stop, no result the empty state (UX-P3.8, DS-STATE-1, DS-STATE-2)`, `a search
  that runs again keeps its rows under the bar, the list busy (UX-P3.8, DS-STATE-2)`, `the Installed pane loads and revalidates under
  its own 2 px bar, never one in the side bar header (UX-P3.8, DS-STATE-2)`.
- Harness: seven states in `states.ts` (`sidebar-browse-results`, `-hover` (modern and classic), `-loading`, `-revalidating`,
  `-empty`, `-error`, `sidebar-installed-loading`; mask `LIVE_SIDEBAR_RESULTS`), their reaches in the capture suite (no reach presses
  Delete, Enter on a row, Ctrl+Enter or a row action), `HELD_STATES` and `HOVER_STATES` entries, `measure.ts` DO 10 (`STATE_MARKERS`,
  `cellList`, `barAlone`, DS-INSET-1's search-alone reading), the H27 probe (follow-up 1 DO 2, `h27ProbeShot`), matrix rows R255-R261.
  `src/test/lint/named-states.test.ts`: the shard counts 175 → 196 and 166 → 187 and the floor's 78 → 85 (seven states, three widths
  each; no title changed), as every earlier state item did.
- Docs: interaction model §8 (`sidebar-installed-progress`, `sidebar-browse-progress`, `sidebar-browse-empty`, `sidebar-browse-error`
  moved from §8.1; `sidebar-updates-progress` and `sidebar-updates-error` stay for P3.10), §5 Delete row; two DECISIONS rows;
  `design-system.md` §9 in its own commit fe63e13; tracker hand-offs to P3.10 and P4.2b.

- Local capture tier (first ruling DO 11; macOS DPR 2, never evidence): `node scripts/ui-harness.mjs --build-sha d136c89 --states
  sidebar-browse-results,sidebar-browse-hover,sidebar-browse-empty` and the earlier run on 0343ba5: every crop throws locally at the crop step
  ("the webview is 299 px wide"); the five reachable cells measured; the hard reds were 54 `not measurable` lines, sent to the design-advisor
  (follow-up 2) and settled by its four lists. The first local run found the results predicate reading the badge's hidden title (fixed in d136c89).
- Measurement notes (follow-up 2 DO 5): a sidebar Browse cell does not exercise the pane-header rules (DS-COPY-5, DS-HEIGHT-1, DS-TYPE-9,
  DS-GRID-2b, DS-OVERFLOW-2; DS-TYPE-5 and DS-DIVIDER-1 in its rowless cells), because the results replace the sections in browse mode; a
  rowless sidebar cell (Browse loading, empty, error; the Installed pane's first load) does not exercise the row and badge rules (DS-DENSITY-1,
  DS-ROW-4, DS-ROW-5, DS-TYPE-6, DS-HEIGHT-10, DS-TYPE-8, DS-HC-1, and DS-HEIGHT-2's sidebar scope), because it shows neither; DS-INSET-3's
  sidebar scope skips the cells with nothing trailing at rest. DS-DIVIDER-1 reads the Browse rows alone (`no pane header (browse); rows <n>
  unlined`).

## Done (untested)

- The seven new cells on the Tier B lanes (the matrix themes at 200/300/400, the 1.90.0 floor in classic, macOS): no push runs them; the next
  `tier=B` dispatch (the P3 gate) reads them.
- The Browse row's Uninstall button and Delete outside jsdom: no UI test presses them (the capture suite never writes, by rule); jsdom proves the
  `ops/remove` request and the busy status.
- The H27 probe in the classic look: it ran in the `ui` lane's Modern UI pass only (removed by UX-P3.fix-4).
- Push 3 on CI: the new UI case, the `[keys]` and `[fringe]` lines, the two-section cells' `[diff]` (Exact next step).

## Not started

- Nothing of the item: push 3 (SB14) is landed locally and read on CI next (Exact next step). H27 was cured by UX-P3.fix-4
  (DS-TYPE-10 hard), which unblocked it; the first-open focus is the proposed host row's.

## For the planning session (UX-P3.8 push 3; design-advisor SB14 rulings of 2026-11-13)

One proposed row (the worker creates none): "⚑ Host: the side bar's box on a first open. After the view is opened from the
activity bar the workbench focus is nowhere (`[sb14-open]` lines above) and the webview never gains it; the Extensions view has
the focus in its box. Question for the `architecture-advisor`: can `SidebarHost` give the view the focus on a first resolve the
user caused without taking it at window start. Names `src/host/SidebarHost.ts`." With it, the observation: the host sends
`ui/focusSearch` on every change to visible (`SidebarHost.ts:57-61`), so showing the side bar with Cmd+B moves the focus from the
editor to the box (the Cmd+B readings above); whether the Extensions view does the same is not probed (a probe first, then the
advisor only if the exemplar keeps the editor focused).

## For the planning session (H27 hand-off, design-advisor follow-up 1 DO 6)

A fix row for H27 with the sidebar box in use, placed by the planning session. It carries: the four DO 1 counts above; form 1 (an opaque
section, 82cb616, run 43342362387) and form 2 (an opaque search row, 853edd4, run 43344632890), both byte-identical in every sidebar
crop; the probe lines and counts of push 2's run and the greyscale `baseline` cells to re-adopt when cured (both in the additions below); as its first step a pixel rule for the coloured-fringe bands, landing `pending` on that row and failing on today's captures;
and the candidates in order: P-b or P-c greyscale with P-a LCD: the quick-search popup's `will-change: transform`
(`src/webview/shared/search/search.css:25-28`, a ruled UX-P3.7a probe), scoped or replaced with the main quick-search cells re-proved;
P-a greyscale: the box itself (its focus ring or caret layer). `sidebar-all-projects.dark-modern.300` stays at 124 px as the witness.

Proposed row (architecture-advisor ruling of 2026-11-13, DO 4; the worker does not create it): "⚑ ADR-013 Decision 2 and D31 name the sidebar's
installed Browse row. Names `docs/adr/013-keyboard-and-menus.md` under the sentinel; one sentence; before or with P4.2b." The proposed sentence:
"*Delete* (Cmd+Backspace on macOS) uninstalls an Installed or an Updates row, and in the sidebar a Browse row of a package installed in the
selected project."

Additions to the H27 hand-off (follow-up 3 DO 6): the probe of run 43353120809 (P-a cab6a927734c…) decides alone: a focused, empty box turns
both panes greyscale; no popup is mounted and no animation runs, so the quick-search popup's `will-change` is not the cause and the first
candidate is the box itself (its focus ring or caret layer). The lead: with the box focused, `sidebar-browse-results` rows are LCD while P-a's
pane rows, the empty sentence and the error banner are greyscale; both lists paint the carrier and neither overflows, so the first comparison is
what differs between the two-section tree and the plain browse wrapper. Greyscale `baseline` cells to re-adopt when cured: `sidebar-filter`
(its golden), `sidebar-browse-empty`, `sidebar-browse-error`, `sidebar-installed-loading`; `sidebar-all-projects.dark-modern.300` (124 px) is
the witness. The probe stays in the suite as that row's instrument and is removed by it. SB14 waits on that row. Not separated by any shot:
"box focused" and "webview document focused" (every greyscale shot had both; no capture has the focus elsewhere in the side bar, and the first
ruling's DO 14 was never read on CI): the fix row's first probe shot should put the focus on a row.

Closing run 43356657101 on 57b28d9: green on every job; `[diff] summary: 96 compared, 95 at 0 px, 1 above tolerance, 0 without a golden, 0
refused` (the eight new cells 0 px; `sidebar-all-projects.dark-modern.300: 124 px`, the witness); `differs` 0 in both looks.

Second proposed row (follow-up 4; different cause, its own proving run): **compact row badge centring.** Box `sidebar-browse-hover.dark-modern.300`
208,54,56,22 (run 43353120809, 6f160e53…); cause `primitives.css:490-494, 511-514, 623-649` (`.nuiget-row--compact .nuiget-row-body` is
`align-items: baseline`, so the 20 px label badge rides the 13 px name's baseline: 2 px above, 0 below in the 22 px band; the CPM pills of the
`sidebar-all-projects` golden the same since UX-P3.7c). Cells that move: the three Browse row cells, `sidebar-browse-hover` classic,
`sidebar-all-projects` both looks, and any other compact row with a badge. Fix: the badge slot centred in the existing
`.nuiget-row--compact .nuiget-row-badges` rule, no new selector, no `*Props` change. Rule first, `pending` on that row and failing on today's
captures: a badge in a compact row is centred in the row band and never touches its edge, `|(badge.top − band.top) − (band.bottom −
badge.bottom)| ≤ 1` and both distances ≥ 1, per visible badge of a compact row, both looks. Proposed beside P3.9 (which edits `primitives.css`).

## Deviations from contract/ADR/decision

- `docs/adr/013-keyboard-and-menus.md:46-47` (Decision 2) and D31 (plan line 94) name Delete on Installed and Updates rows only;
  `src/webview/sidebar/BrowseResults.tsx` (`onDelete={remove}`) also uninstalls an installed Browse row of one project, by the
  design-advisor's B = b1 and the architecture-advisor's ruling of 2026-11-13 (option 2, narrowed: an incomplete enumeration, the ADR
  amendment proposed as its own row below); for the planning session's ratification.
- `src/test/ui/v2/measure.ts`: `SIDEBAR_NO_ROW_STATES` also on DS-HEIGHT-3, DS-ROW-1, DS-ROW-6 and DS-ICON-3, which have no sidebar
  scope (a no-op), so `measure-rules.test.ts`'s pin "these six share DS-ROW-4's exceptions" holds unchanged; the pins of DS-HEIGHT-10,
  DS-TYPE-8, DS-HC-1, DS-OVERFLOW-2, DS-GRID-2b, DS-TYPE-6/DS-ROW-4 extended with the ruled lists, and DS-INSET-3's `scopeExceptStates`
  pinned (follow-up 2).
- `src/webview/sidebar/packageRows.tsx` returns `busyStatus` (the Browse row reads its operation's status; precommit-review).
- `BrowseResults.test.tsx` `Enter or the row button installs the version found into the selected project, with the source it came from`:
  one assertion added (the row's status reads "Installing"); title unchanged.

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
### 2026-11-13, design-advisor, follow-up 1: both forms failed (verbatim)

> FOLLOW-UP 1 RULING, UX-P3.8 (H27 after two failed forms)
>
> DECISION: (b), amended. Push 2 goes now and carries one probe that tells the caret from the popup. Its new cells are adopted as `baseline` in the greyscale form they have. The H27 cure leaves P3.8 for a fix row the planning session places. SB14 is pushed only if the probe's caret-only crop is LCD; otherwise P3.8 ends `blocked` on SB14 alone. This replaces my DO 4 clause "no browse golden is adopted greyscale" and my DO 15. No third form in this item, and not (c) yet.
>
> Checked: commits 82cb616 and 853edd4 are on `labs/ux`. The six crop hashes you give match (bc89a8e8e26c twice, 0290fdcaa8e6, 076db9717809, 56224588abee twice). I did not open 0290fdcaa8e6; the other hashes are byte-equal to PNGs I opened in the first ruling. The fringe counts are yours; I cannot run the script. `search.css:25-28` and `SearchBox.tsx:134, 353` read as you say.
>
> WHY:
> - Two forms each had their one proving run and moved no pixel, so painting a surface is not the lever. A third guess without a discriminating reading would be the P2.9b pattern (two red runs on a probe-less theory).
> - Your four counts fit two causes equally. The selected-text PNGs come from a reach that typed nothing in that session, so they have neither a caret nor a popup that was ever mounted. The caret PNGs have both. No evidence in hand separates them.
> - The popup lead cannot be tried here. `will-change: transform` on `.nuiget-search-popup` is a ruled H27 fix of UX-P3.7a, and removing it moves the main quick-search goldens. That needs the reading first and its own row.
> - Adopting greyscale cells is now defensible where it was not in my first ruling. `sidebar-filter` was byte-equal (bc89a8e8…) on three runs under `typeHeld`, so a caret cell is deterministic. A greyscale `baseline` is a stable self-regression reference, the status the `sidebar-filter` golden already has by the P3.7c ruling. The defect is carried by the standing 124 px line and the fix row, not by a missing golden.
> - SB14 with an unexplained cause is the real risk. If a caret alone turns the pane greyscale, focus on first render makes every user's sidebar greyscale from the start. The probe's caret-only crop is exactly SB14's condition (focused, empty box, nothing typed).
>
> DO:
> 1. In push 2, as a forward commit, remove the `background-color` that 853edd4 added on `.nuiget-sidebar-search` (and the rule, if it holds nothing else). Keep `--nuiget-listbox-bg` on `.nuiget-sidebar-browse`: it is the P3.7c carrier applied to the third sidebar list. No revert of history, no force.
> 2. Add one probe to the capture suite's `ui`-lane Modern UI pass, after the key walks, in the sidebar with Gateway and an empty box. It saves three shots under a `probe/` folder of the artifact. They are not states, have no golden and are never diffed.
>    - P-a: the box clicked, nothing typed.
>    - P-b: `@` typed, then Backspace, the caret still in the box.
>    - P-c: `@installed` typed through `typeHeld`, then Escape.
>    Print one `[probe] h27 <name>:` line per shot with: the count of `.nuiget-search-popup` in the DOM, the box's `aria-expanded`, the active element's test id, `document.hasFocus()` and `document.getAnimations().length`. The probe presses no row and leaves the box empty.
> 3. Push 2 (SB9, the states, DO 5 to 12 of the first ruling, DO 11's local capture run first). After the run, paste the band counts (rows 55-77 and the row bands) of P-a, P-b, P-c and of each new browse cell and `sidebar-installed-loading`.
> 4. Adopt the new cells as `baseline` from that run, with their ARIA snapshots, whatever their antialiasing. Write in the STATUS note which of them are greyscale, by band counts. Do not adopt `sidebar-all-projects.dark-modern.300`; its 124 px stays as the standing witness. Leave the `sidebar-filter` golden as it is.
> 5. Read P-a:
>    - LCD (header bands 55/66 non-zero, near `sidebar-sections`' 108/319): the caret alone is not the cause. Push SB14 (first ruling DO 13, 14, 16). The two-section cells must stay 0 px or differ inside the box only; a difference outside the box comes back to me.
>    - Greyscale: do not push SB14. Mark P3.8 `blocked` with "SB14 waits on the H27 fix row" and stop; everything else of the item is landed.
> 6. Tracker, in push 2's docs: move the H27 hand-off out of the P3.8 row into a hand-off for a new fix row (the planning session places it; do not self-place an item). It carries:
>    - the four counts and the two failed forms with their run ids,
>    - the probe lines and counts,
>    - the list of greyscale `baseline` cells to re-adopt when cured,
>    - a first step: a pixel rule for the coloured-fringe bands lands `pending` on that row and fails on today's captures,
>    - the candidates in order: if P-b or P-c is greyscale and P-a is not, the popup's `will-change` (scope it or replace it, with the main quick-search cells re-proved); if P-a is greyscale, the box itself (its focus ring or caret layer).
> 7. Add a DECISIONS row: "H27, sidebar with the box in use (UX-P3.8): an opaque section (run 43342362387) and an opaque search row (run 43344632890) moved no pixel; the cause is not a missing surface; cure in its own row after the probe of run <id>."
>
> DO NOT:
> - Do not try a third form, touch `search.css`'s `will-change`, or add `will-change` anywhere in this item.
> - Do not adopt `sidebar-all-projects.dark-modern.300`, and do not re-adopt `sidebar-filter`.
> - Do not push SB14 before the P-a counts are pasted, or with P-a greyscale.
> - Do not treat the probe shots as states: no entry in `states.ts`, no golden, no mask.
> - Do not close P3.8 as `done` without SB14.
>
> CONTRACT CHANGE: none.
>
> VERIFY:
> - Push 2's run: three `[probe] h27` lines and three PNGs under `probe/` in `ui-screenshots`; `[diff] sidebar-all-projects.dark-modern.300: 124 px`; every other existing sidebar cell 0 px; the first ruling's push 2 checks.
> - `grep -n 'background' src/webview/sidebar/sidebar.css` shows no declaration from 853edd4.
> - SB14 run, if pushed: the first ruling's push 3 checks, plus the two-section cells' band counts equal to the goldens'.
> - Tracker: the P3.8 row no longer holds the H27 forms; the hand-off names the probe run and the cells to re-adopt.
>
> DEFECTS:
> - captures/43344632890/sidebar-all-projects.dark-modern.300.png 0,55,300,24 NEW (as in the first ruling: coloured-fringe count per 11 px text band > 0 in every sidebar cell) major: pane header greyscale with the box in use; unchanged by both forms; owned by the fix row of DO 6.
> - captures/43344632890/sidebar-filter.dark-modern.300.png 0,55,300,70 same rule major: header and both rows greyscale, as its golden; same owner.
>
> Not checked: capture 0290fdcaa8e6 was not opened; whether the popup is mounted in the caret cells is unverified by either of us, which is what the probe reads.

### 2026-11-13, architecture-advisor, Delete on a Browse row against ADR-013 (verbatim)

> UX-P3.8 (architecture-advisor, 2026-11-13): Delete on an installed sidebar Browse row against ADR-013 Decision 2
>
> DECISION: Option 2, narrowed. Keep `onDelete` as staged and change nothing under `docs/adr/**` in this item. This ruling is the architecture ruling the review found missing. The ADR amendment goes to the planning session as a proposed row, not to P4.2b as that row stands.
>
> WHY:
> - **Brief correction first.** Option 3's premise is wrong: without `onDelete` the trash would still have a key. `package.json:333` and `:338` offer the Uninstall menu command on `webviewSection == 'browseRow' && nuiget.installed`, and the gotcha "Buttons inside `role="option"`" counts Shift+F10 as a key. Option 3 fails instead because it drops a named output: the plan row (`docs/plans/2026-10-23-nuiget-ux-execution-plan.md:517`) says "Uninstall and Delete on installed rows", and SB9's fix (`docs/plans/parity-audit-2026-10-16.md:1075`) says "pass `onDelete` to the Listbox for the same path".
> - **The mismatch is an incomplete enumeration, not a contradiction.** `docs/adr/013-keyboard-and-menus.md:46-47` and D31 (plan line 94) both list "Installed and Updates rows". The plan row came in the same commit as the ADR (4fc363a), under the same owner approval. Decision 2 itself says (line 47-48) that the row's pointer action buttons "stay, mirrored by these keys", so a trash button on a Browse row calls for Delete under the ADR's own rule.
> - **Option 1 is closed by D6.** A frozen file changes only in an item that names it, and I may not relax that. P3.8's files column reads "sidebar". A grep of the plan for `docs/adr` finds only the guard description (line 189): no UX row names ADR-013's file, P4.2b ("sidebar, MainPanelHost, details") and P4.1 (`src/protocol/**`, host, entries, package.json) included.
> - **A deferral path exists.** Plan §2.3 makes a contract/ADR mismatch a universal trigger for the architecture-advisor, §2.5 gives the note a "Deviations from contract/ADR/decision" section, and RUN-ux §4.4 closes a blocking finding by "consult the advisor the item names and paste the ruling". The design-advisor disclaimed the wording, so no such ruling existed when the review ran.
> - **The unconfirmed Delete is today's tree, not a new deviation.** The sidebar Installed rows uninstall at once on Delete (`src/webview/sidebar/ProjectPackages.tsx:49`, `InstalledSection.tsx:150`), and the staged Browse path calls the same `usePackageRows().uninstall` (`packageRows.tsx:36-50`: busy check, `whyNotRemovable`, then `run('ops/remove')`). Decision 3's confirmation is P4.2a/P4.2b's for every list. The interaction model's "asks first" describes that target for all rows already.
>
> DO:
> 1. Paste this ruling verbatim into `src/webview/sidebar/STATUS.md` under "Advisor decisions".
> 2. Rewrite the note's Deviations entry so it cites `docs/adr/013-keyboard-and-menus.md:46-47` and D31 (plan line 94), names this ruling next to the design-advisor's B = b1, and ends "for the planning session's ratification".
> 3. Keep `onDelete={remove}`, the three staged SB9 tests and the staged interaction-model §5 cells as they are.
> 4. In the note's section for the planning session, propose a row (the worker does not create it or edit a plan row): "⚑ ADR-013 Decision 2 and D31 name the sidebar's installed Browse row. Names `docs/adr/013-keyboard-and-menus.md` under the sentinel; one sentence; before or with P4.2b." Give the proposed sentence: "*Delete* (Cmd+Backspace on macOS) uninstalls an Installed or an Updates row, and in the sidebar a Browse row of a package installed in the selected project."
> 5. Reword the P4.2b tracker hand-off: keep "the Delete confirmation covers the sidebar Browse row too", and replace "the architecture-advisor's wording to settle here" with "the ADR sentence is ruled (architecture-advisor, 2026-11-13, in the sidebar note) and waits for a row that names `docs/adr/013-keyboard-and-menus.md`; P4.2b does not name it".
> 6. Record the review finding as closed by this ruling (RUN-ux §4.4), with the workflow id `wf_1d0c1321-a20`. A re-run of `precommit-review` is needed only if the staged code changes after this point.
> 7. Before the commit, settle the working tree. `git diff --stat` showed five files modified after staging (`README.md`, `docs/plans/regression-matrix.md`, `src/test/lint/measure-rules.test.ts`, `src/test/ui/v2/measure.ts`, `src/webview/sidebar/BrowseResults.test.tsx`). Stage them by explicit path or drop them, then re-run the gates on what is staged.
> 8. This ruling does not block P3.8's commit.
>
> DO NOT:
> - Create `.claude/.contract-change` or edit `docs/adr/013-keyboard-and-menus.md` in P3.8.
> - Edit D31 or any plan row.
> - Drop `onDelete`, or weaken or delete the three SB9 tests, to make the finding go away.
> - Add a confirmation to the Browse Delete here; it is P4.2b's, for all three sidebar lists at once.
> - Make Delete write under All Projects (the design-advisor's A = a2 stands).
> - Commit with unstaged edits left over the staged files.
>
> CONTRACT CHANGE: none in UX-P3.8. `docs/adr/013-keyboard-and-menus.md` (Decision 2, one sentence, DO 4) changes only in a row the planning session places that names the file, behind the sentinel. Until then the ADR sentence and D31 stay as they are and the deviation stands recorded.
>
> VERIFY:
> - `git diff --cached --stat -- docs/adr src/protocol src/core/contracts.ts` → empty.
> - `git diff --cached src/webview/sidebar/BrowseResults.tsx | grep -c 'onDelete={remove}'` → 1.
> - `git diff --cached src/webview/sidebar/BrowseResults.test.tsx | grep -c "UX-P3.8, SB9"` → 3.
> - `grep -c '013-keyboard-and-menus.md:46-47' src/webview/sidebar/STATUS.md` → 1 or more.
> - `grep -n '^| P4\.2b ' docs/plans/STATUS-ux.md` shows the reworded hand-off of DO 5.
> - `ls .claude/.contract-change` → no such file.
> - `git diff --stat` → empty immediately before the commit.
>
> CHECKED:
> - `git status --short` and `git diff --stat` at fe63e13; `git diff --cached` of `/Users/mattias/github/nuiget/src/webview/sidebar/BrowseResults.tsx`, of the staged tests' titles and of the interaction model's Delete lines; the frozen paths (no staged diff).
> - `/Users/mattias/github/nuiget/docs/adr/013-keyboard-and-menus.md` in full (Decisions 1-8, Consequences) and its history (one commit, 4fc363a).
> - The plan's §2.1, §2.3, D31, D39, and rows P3.8, P4.1, P4.2a, P4.2b; a grep of the plan for `docs/adr`.
> - `/Users/mattias/github/nuiget/docs/plans/STATUS-ux.md` rows P3.8, P4.1, P4.2a, P4.2b.
> - `/Users/mattias/github/nuiget/docs/plans/parity-audit-2026-10-16.md` 1066-1080 (SB9).
> - `/Users/mattias/github/nuiget/docs/plans/RUN-ux.md` §4 and §4.4.
> - `/Users/mattias/github/nuiget/package.json` 313-348 (the `webview/context` clauses).
> - `/Users/mattias/github/nuiget/src/webview/sidebar/packageRows.tsx` 36-50 and the `onDelete` sites of the sidebar.
> - `/Users/mattias/github/nuiget/src/webview/sidebar/STATUS.md` by grep (the design-advisor's ruling lines on A, B and the ADR wording).
>
> Not verified:
> - The text of the precommit-review finding and its refuter: the workflow output is not in the repository, so I ruled on the brief's paraphrase.
> - That the staged tests pass: I read their titles only, and the test file has unstaged edits on top.
> - Which of lines 333 and 338 of `package.json` is the Uninstall command: both carry the installed Browse clause, and I did not read the command ids.

### 2026-11-13, design-advisor, follow-up 2: the local reds (verbatim)

> FOLLOW-UP 2 RULING, UX-P3.8 (the 54 red lines of the local capture tier)
>
> DECISION: Option 3: option 1's mechanism (exception lists by fact), but with four precise lists instead of joining `NO_LIST_STATES` / `NO_ROW_STATES`, plus one in-helper reading for DS-DIVIDER-1 so the new flat list keeps its "no line between rows" check. None of the reds is a CSS defect.
>
> Checked: commits 0343ba5 and d136c89 exist locally; `measure.ts:176-196` (the lists), the sixteen rule definitions (`:256-345`), the evaluators of DS-INSET-3 (`:2208-2242`), DS-OVERFLOW-2 (`:2258`), DS-DIVIDER-1 (`:2500-2514`), DS-TYPE-9 (`:2797`), the header collector's `trailingEnd` (`:1084-1087`) and `SectionHeader.tsx:88-101`. The local values are yours (DPR 2, not evidence); `-revalidating` and `-error` are unmeasured by anyone.
>
> WHY:
> - Every red is "nothing to read", not a wrong value. Browse mode has no pane header (interaction model §2), and three browse cells and the loading cell have no row and no badge.
> - Joining the main lists wholesale would over-exempt. `NO_LIST_STATES` also switches off DS-GRID-2b and DS-OVERFLOW-2, and `NO_ROW_STATES` switches off DS-DIVIDER-1. All three read green today on `sidebar-installed-loading`, whose two pane headers exist. Removing a green hard line is a weakening.
> - DS-DIVIDER-1's sidebar helper returns "no pane header" before it reads rows (`:2504`). Exempting the cells with rows would drop the row-line half of the rule on the one new list this item builds. DS-TYPE-5's "no group header (flat list)" answer is the precedent for reading what exists.
> - DS-INSET-3 on `-results` is correct as not measurable. The sidebar helper reads pane-header trailers, visible row actions and group-row counts. At rest there is no header and no visible action (your `DS-ROW-4@…-hover: visible actions per row 0 ×19, 1`); `-hover` reads `row actions 6` and stays measured.
> - DS-INSET-3 on `sidebar-installed-loading` is also by design. SB13 removes the badge, the headers have no visible action, and the spinner sits beside the title inside the toggle, not at the header's end.
>
> DO:
> 1. Add four constants to `measure.ts`, each with a one-line comment giving the fact:
>    - `SIDEBAR_BROWSE_STATES`: `sidebar-browse-results`, `-hover`, `-revalidating`, `-empty`, `-loading`, `-error` (no pane header).
>    - `SIDEBAR_BROWSE_NO_LIST_STATES`: `sidebar-browse-loading`, `-empty`, `-error` (no list).
>    - `SIDEBAR_NO_ROW_STATES`: the three above and `sidebar-installed-loading` (no row, no badge).
>    - `SIDEBAR_NO_TRAILER_STATES`: `sidebar-browse-results`, `-revalidating`, `-empty`, `-loading`, `-error`, `sidebar-installed-loading` (nothing trailing visible at rest).
> 2. Apply them, appended to what each rule already has:
>
> | Rule | Exception | List |
> |---|---|---|
> | DS-COPY-5, DS-HEIGHT-1, DS-TYPE-9, DS-GRID-2b, DS-OVERFLOW-2 | `exceptStates` | `SIDEBAR_BROWSE_STATES` |
> | DS-TYPE-5, DS-DIVIDER-1 | `exceptStates` | `SIDEBAR_BROWSE_NO_LIST_STATES` |
> | DS-DENSITY-1, DS-ROW-4, DS-ROW-5, DS-TYPE-6, DS-HEIGHT-10, DS-TYPE-8, DS-HC-1 | `exceptStates` | `SIDEBAR_NO_ROW_STATES` |
> | DS-HEIGHT-2 | `scopeExceptStates: { sidebar: … }` (the popup scope untouched) | `SIDEBAR_NO_ROW_STATES` |
> | DS-INSET-3 | `scopeExceptStates: { sidebar: … }` | `SIDEBAR_NO_TRAILER_STATES` |
>
> 3. DS-DIVIDER-1, sidebar scope: when there is no pane and `facts.rows.length > 0`, judge the rows alone. Value `no pane header (browse); rows <n> unlined|lined <k>`, pass when no row has a line. This covers `-results`, `-hover` and `-revalidating`. With no pane and no row it stays not measurable.
> 4. Leave `NO_LIST_STATES`, `NO_ROW_STATES` and `NO_BADGE_STATES` unchanged. No scope status and no tolerance changes.
> 5. Add one sentence each to the measurement notes in the STATUS note: which rules a sidebar Browse cell does not exercise and why (no pane header in browse mode; no row or badge in a rowless cell). The Design System text itself is not edited here.
> 6. Push 2. On its CI run, any hard red on the seven cells that this table does not cover comes back to me with its line; `-revalidating` and `-error` are first measured there. A red on `-revalidating` that `-results` does not have is not covered by this ruling.
> 7. Add a tracker hand-off, not this item's work: a held cell whose crop throws never runs its leave, so its hold swallows the next cells' answers (your local cascade). Name the capture suite's hold and leave as the place; the main panel's held reaches share it.
>
> DO NOT:
> - Do not add any of the seven states to `NO_LIST_STATES`, `NO_ROW_STATES` or `NO_BADGE_STATES`.
> - Do not exempt `sidebar-browse-hover` from DS-INSET-3 or DS-ROW-4, or `sidebar-installed-loading` from DS-DIVIDER-1, DS-GRID-2b, DS-OVERFLOW-2, DS-HEIGHT-1, DS-COPY-5, DS-TYPE-5 or DS-TYPE-9: it has its headers.
> - Do not make a helper answer pass for a missing header (option 2) beyond DO 3.
> - Do not change `sidebar.css` for any of these lines.
> - Do not treat the local 299 px crop failure as a finding, or adopt anything from the local run.
>
> CONTRACT CHANGE: none.
>
> VERIFY:
> - On push 2's run: `grep -c 'not measurable' ui-output.txt` restricted to the seven cells → 0 hard lines.
> - `[measure] DS-DIVIDER-1@sidebar-browse-results: no pane header (browse); rows <n> unlined (hard)`, and the same on `-hover` and `-revalidating`.
> - `[measure] DS-INSET-3@sidebar-browse-hover: row actions 6 (target 6) (hard)`, both looks.
> - `[measure] DS-DIVIDER-1@sidebar-installed-loading` and `DS-GRID-2b@sidebar-installed-loading` still printed and green.
> - `git diff 0343ba5 -- src/test/ui/v2/measure.ts` shows the three old lists untouched.
>
> DEFECTS: none.
>
> Not checked: I did not trace DS-ROW-5, DS-TYPE-6, DS-DENSITY-1, DS-HC-1 or DS-HEIGHT-10 inside their helpers; I took "no row / no badge" from your lines and the rule texts. I did not read the diff of 0343ba5 beyond its file list.

### 2026-11-13, design-advisor, follow-up 3: judge inputs, probe read (verbatim)

> FOLLOW-UP 3 RULING, UX-P3.8 (judge inputs; probe read)
>
> DECISION: Split, on the P3.2 and P3.6 precedent. One `design-judge` call on the three Modern UI cells that show rows (`sidebar-browse-results`, `sidebar-browse-hover`, `sidebar-browse-revalidating`), against `docs/design/artboards/main-installed-all.dark-modern.1200.png` and `main-installed-all.spec.json` (the sidebar precedent of P3.7c/P3.7d). The four state cells (`sidebar-browse-loading`, `-empty`, `-error`, `sidebar-installed-loading`) and the classic hover cell are recorded `pending artboard` without a panel; their gate is the measurements. The probe result stands: SB14 is not pushed and P3.8 ends `blocked` on SB14 alone.
>
> Checked:
> - Tree at e3f3574, with the adoption uncommitted in the working tree.
> - The eight adopted crop hashes match the prefixes you give; the three probe PNGs are byte-identical (cab6a927734c).
> - I opened `probe/h27-P-a.png`, `sidebar-browse-hover.dark-modern.300.png`, `sidebar-browse-error`, `sidebar-browse-empty` and `sidebar-installed-loading` from `captures/43353120809/`.
> - I did not open `sidebar-browse-results`, `-revalidating`, `-loading` or the classic hover.
> - The band counts and `[measure]` lines are yours, not verified by me.
>
> WHY:
> - The rubric judges a capture against an artboard and a redline. A bar alone, one sentence, or one banner has nothing in a main-panel artboard to be compared with. P3.2 recorded its quick-search cells and P3.6 its three state cells `pending artboard` for that reason (`judge-log/P3.2.json:10`, `P3.6.json:10`); `RUN-ux.md:182` gives the wording.
> - The cells with rows can be read for row anatomy, band, action and badge against the one sidebar proxy already used. Keeping the same proxy keeps the cross-surface dispositions of `judge-log/P3.7d.json` reusable.
> - The classic hover has no classic proxy at this composition. P3.7c and P3.7d judged the Modern UI cell only, and its hard lines (`content 20; search 20`, `row actions 6`) carry it.
> - Probe: P-a shows the box focused and empty with both panes (ring at about 8,25,284,26), and your counts read chroma 0 in every band where `sidebar-sections` reads 102 to 1042. A focused empty box is sufficient; no popup and no animation is involved.
> - P-b and P-c ended byte-identical to P-a, so they add nothing beyond it; Escape evidently leaves the box empty.
>
> DO:
> 1. Run `design-judge` once, screen mode, on the three cells from `captures/43353120809/` with their sha256, `artboardPng` and `spec` as above.
> 2. In `docs/plans/judge-log/P3.8.json`, write the panel note: "No sidebar artboard: the three Browse cells with rows are judged against main-installed-all.dark-modern.1200.png and its spec (design-advisor follow-up 3, UX-P3.8; the P3.7c precedent), the Modern UI cells. sidebar-browse-loading, -empty, -error, sidebar-installed-loading and the classic hover are pending artboard: their gate is the measurements (DS-STATE-1, DS-INSET-1, DS-INSET-3, axe)."
> 3. Dispositions:
>    - A finding that compares a main-panel element the sidebar does not have (icons, descriptions, group headers, check column, 72 px rows, the 16 px inset) is `accepted-as-design` under this ruling, citing DS-DENSITY-1 and T-3.
>    - A finding a hard line contradicts is `refuted-by-measurement` with the line.
>    - Anything else standing comes back to me before the closing commit.
> 4. Paste into the STATUS note the `(pending P3.10)` lines of DS-STATE-2, -3, -4 and DS-HEIGHT-11 for the four state cells. They are these cells' real rules and are not asserted yet. A value off target is fixed in `sidebar.css` now; if the value is the helper's (not reading the sidebar ids), it goes to P3.10's hand-off with the line.
> 5. Commit the adoption (eight goldens, sidecars, `index.json`, seven ARIA snapshots) with the note listing which cells are greyscale by your bands (`-empty`, `-error`, `sidebar-installed-loading`).
> 6. Close the run as ruled: P3.8 `blocked`, "SB14 waits on the H27 fix row". In the H27 hand-off add:
>    - P-a alone decides; the popup is not needed.
>    - The lead from this run: with the box focused, `sidebar-browse-results` rows are LCD while P-a's pane rows, the empty sentence and the error banner are greyscale. Both lists paint the carrier and neither overflows, so the first comparison is what differs between the two-section tree and the plain browse wrapper.
>    - The probe stays in the suite as the fix row's instrument and is removed by that row.
>
> DO NOT:
> - Do not pass a proxy artboard for the four state cells or the classic hover to fill the panel.
> - Do not call the four cells judged, or leave them out of the judge log.
> - Do not push SB14, and do not mark P3.8 `done`.
> - Do not re-run the probe or extend it in this item.
>
> CONTRACT CHANGE: none.
>
> VERIFY:
> - `judge-log/P3.8.json` has three judged states with zero `incomplete`, five entries `pending artboard`, and every standing finding with a disposition.
> - `grep -c 'pending P3.10)' ui-output.txt` lines for the four cells are pasted in the STATUS note.
> - Tracker: P3.8 `blocked` with the SB14 reason; the H27 hand-off names run 43353120809 and cab6a927734c.
>
> DEFECTS:
> - captures/43353120809/adopt-p38/sidebar-installed-loading.dark-modern.300.png 8,88,180,54 NEW: a compact skeleton row starts at the x of the row names it stands for (sidebar M 28 / C 20); measured as `skeletonRow.left − root.left` beside DS-INSET-1's names. minor: the three skeleton bars start at about x 8 where the pane's rows start at 28. `Skeleton` is unchanged by this item; hand to P3.10 with the sidebar DS-STATE-2 flip. Does not block the baseline.
> - captures/43353120809/probe/h27-P-a.png 0,55,300,390 NEW (first ruling's fringe-band rule) major: both panes greyscale with the box focused and empty, by your counts; owned by the H27 fix row; blocks SB14.
> - captures/43353120809/adopt-p38/sidebar-browse-empty.dark-modern.300.png 20,62,240,36 and sidebar-browse-error.dark-modern.300.png 8,58,284,54 same rule major: sentence and banner text greyscale by your counts; same owner; re-adopt when cured.
>
> Looked at and not a defect: the hover cell's band spans about 4 to 296 with the trash about 6 inside it and names at 28; the error banner is one glyph, one sentence with a period, one Retry; the empty sentence starts at 20; the loading header shows the spinner and no badge (SB13).
>
> Not checked: the 2 px bar's extent in `sidebar-installed-loading` (only a stripe segment from about x 8 is visible; the track's left edge cannot be read from the PNG). P3.10's DS-STATE-2 and DS-HEIGHT-11 lines should say whether the track spans the pane.

### 2026-11-13, design-advisor, follow-up 4: the judge's standing finding (verbatim)

> FOLLOW-UP 4 RULING, UX-P3.8 (judge finding sidebar-browse-hover#D1)
>
> DECISION: Option 1, sharpened. The finding is real and is the shared compact row's, not this item's. Disposition `fixed`, owner a fix row the planning session places (proposed: beside P3.9, which already edits `primitives.css` and re-proves sidebar cells), with a new measurable rule. Nothing changes in P3.8's CSS. The single-judge finding on `-results` is the same defect and takes the same owner.
>
> Checked:
> - I cropped and opened `captures/43353120809/adopt-p38/sidebar-browse-hover.dark-modern.300.png` at 150,46,150,84. The "Installed" pill sits low in the hovered band and reaches its bottom edge, and the Serilog.Sinks.Console pill does the same.
> - I cropped and opened golden `src/test/ui/v2/golden/sidebar-all-projects.dark-modern.300.png` at 150,120,150,60. The CPM pills, adopted at UX-P3.7c, have the same placement, so the offset predates this item and is already in a committed golden.
> - Cause, read in `primitives.css:490-494, 511-514, 623-649`: `.nuiget-row--compact .nuiget-row-body` is `align-items: baseline`, and the label badge (10 px text, `line-height: 1`, Modern UI padding 4, 1 px border, so 20 px high) is placed by its text baseline on the 13 px name's baseline in a 22 px band. That gives the judge's 2 above / 0 below.
> - `DS-HEIGHT-10` reads padding, font and radius only (`measure.ts:2099`), so no measurement contradicts the finding.
>
> WHY:
> - Not `refuted-by-measurement`: no line measures the pill's position. Not `accepted-as-design`: no spec line, artboard or DECISIONS row declares a pill flush with the band's edge, and the rubric lists an element touching an edge among its defects.
> - Closest to the workbench settles the target: a badge in a native list row is centred in the row (the pane-header count badge and the Extensions row's labels are centred in their boxes, `extensions.json pane_headers[4]`), so the pill belongs 1/1 in the 22 px band.
> - Not option 2: a sidebar-scoped correction of a primitive's placement is the layering ADR-010 forbids.
> - Not option 3 here: the one-declaration fix moves every compact row with a badge, including `sidebar-all-projects` in both looks. That cell is the standing H27 witness, and P3.8 is ending `blocked`. One cause per proving run.
>
> DO:
> 1. In `docs/plans/judge-log/P3.8.json`, give `sidebar-browse-hover#D1` disposition `fixed`, owner "fix row to be placed (compact row badge centring)", with this ruling cited. Record the `-results` single-judge finding as informational with the same owner.
> 2. Add a tracker hand-off for the planning session with:
>    - the box: `sidebar-browse-hover.dark-modern.300` 208,54,56,22 (run 43353120809, 6f160e53…);
>    - the cause lines above;
>    - the cells that will move: the three Browse row cells, `sidebar-browse-hover` classic, `sidebar-all-projects` both looks, and any other compact row with a badge;
>    - the expected fix: the badge slot of a compact row centred in the band, in the existing `.nuiget-row--compact .nuiget-row-badges` rule of `primitives.css`, no new selector and no `*Props` change;
>    - the rule below, landing `pending` on that row first and failing on today's captures.
> 3. Keep the eight goldens as adopted (`baseline`). The owner row re-adopts the moved cells with its CSS reason.
> 4. Close P3.8 as already ruled (`blocked` on SB14).
>
> DO NOT:
> - Do not edit `primitives.css`, `Row.tsx` or `Badge.tsx` in P3.8.
> - Do not add a badge-alignment rule or carrier to `sidebar.css`.
> - Do not mark the finding `accepted-as-design` or `refuted-by-measurement`.
> - Do not fold this into the H27 fix row: different cause, different proving run.
>
> CONTRACT CHANGE: none.
>
> VERIFY:
> - `grep -n '"disposition"' docs/plans/judge-log/P3.8.json` shows `fixed` for `sidebar-browse-hover#D1` with the owner text.
> - `git diff --stat` for the closing commit touches no file under `src/webview/shared/primitives/`.
> - The tracker hand-off names the box, the run and the rule.
>
> DEFECTS:
> - captures/43353120809/adopt-p38/sidebar-browse-hover.dark-modern.300.png 208,54,56,22 NEW: a badge in a compact row is centred in the row band and never touches its edge; measured as `|(badge.top − band.top) − (band.bottom − badge.bottom)| ≤ 1` and both distances ≥ 1, per visible badge of a compact row, both looks. major: the "Installed" pill is 2 px below the band's top and flush with its bottom. Does not block the baseline.
> - src/test/ui/v2/golden/sidebar-all-projects.dark-modern.300.png 218,128,40,20 (and each CPM row below) same NEW rule, major: the CPM pills carry the same offset since UX-P3.7c; same owner.
>
> Not checked: I measured no pixel rows myself; the 2/0 numbers are the judge's, and my crops confirm only the direction. I did not open the classic hover cell or `sidebar-browse-results`, and did not check whether a popup row or the Updates tree shows a badge in a compact row.

### 2026-11-13, design-advisor, SB14 form 1: DO 17 by Reload Webviews (verbatim)

Brief: DO 14's readings, DO 17 by the Cmd+B proxy (the editor lost the focus with and without SB14), options 1) push, 2) hold,
3) the host half. Answer verbatim:

> DECISION: Option 1, after one more local check in a different form. The Cmd+B comparison does not meet DO 17: it shows SB14 adds nothing on that path, but it never exercises SB14's own effect (a mount with no visibility change while an editor has the focus). Not option 2 or 3: the host's behaviour is pre-existing, outside this item, and not shown to be a defect.
>
> Checked:
> - `src/host/SidebarHost.ts:57-61` sends `ui/focusSearch` on every change to visible; `src/webview/shared/shellChrome.ts:27` answers it with `searchRef.current?.focus()`. Both as you quote.
> - The first ruling's DO 13 to 17 and VERIFY are at `src/webview/sidebar/STATUS.md:304-307, 324`.
> - UX-P3.fix-4 is `done` with 5daf711 in its row.
> - Not verified: every local reading in the brief (local macOS, illustrative only), and the working-tree diff, which I did not open.
>
> WHY:
> - **The Cmd+B proxy measures the workbench, not SB14.** With and without SB14 the editor loses the focus identically, so the cause is on the show path: the host event you found, and possibly the workbench itself. From memory of VS Code, unverified: showing the side bar re-opens its view container with focus, and the Extensions view's `focus()` puts the focus in its search box. If so, the host's event matches the exemplar (D22) on that path and is no defect.
> - **What DO 17 was written to catch is still unproven.** SB14 calls `focus()` at mount. The risk is a mount that happens while the user is in an editor (window start with the side bar restored, or the webview loading late). Cmd+B always comes with a visibility change, so it cannot separate the two.
> - **A mount without a visibility change can be produced under ExTester.** Reloading the webviews remounts the sidebar document while the view stays visible and the editor keeps the focus; no `ui/focusSearch` is sent.
> - **The capture readings are reassuring but not decisive.** The two-section cells read `hasFocus false, active body` locally, so no caret is expected in them; the hard `[keys]` and ring lines are unchanged.
>
> DO:
> 1. Run this local check twice, with SB14 and with it stashed (scratch only, never committed):
>    - nUIget's view visible in the side bar, `TestProject.csproj` open, the editor clicked; confirm the top document's active element is in the editor.
>    - Run the command `Developer: Reload Webviews`. Wait until the sidebar webview is up again.
>    - Read, at once and again 5 s later: whether the top document's active element is still in the editor, and inside the sidebar frame `document.hasFocus()` and the active element's test id.
> 2. Paste the four reading sets in the STATUS note as local readings (macOS, not pixel evidence).
> 3. If the editor keeps the focus with SB14: DO 17 is met. Push SB14 as prepared (`SidebarView.tsx`, its jsdom case, the `sidebar.ui.test.ts` case).
> 4. If the editor loses the focus with SB14 and keeps it without: do not push. Return to me with the lines; the mount effect needs a different form and I will not pre-rule it.
> 5. If the editor loses the focus in both: the reload itself moves the focus and the proxy is void. Return with the lines.
> 6. On the CI run, DO 15's second condition is replaced: instead of band counts, every sidebar cell reads `[fringe] … 0 greyscale` (`DS-TYPE-10`, hard). The first condition stands: a two-section cell that moves may differ only inside the box (8,25,284,26 at 300 px). Anything else comes back.
> 7. Record in the note, for the planning session, one proposed observation row; do not create it: the host sends `ui/focusSearch` on every change to visible (`SidebarHost.ts:57-61`), so showing the side bar with Cmd+B moves the focus from the editor to the box. Whether the Extensions view does the same is not probed. The row is a probe first (the same Cmd+B steps on the Extensions view), then an architecture-advisor question only if the exemplar keeps the editor focused.
>
> DO NOT:
> - Do not edit `SidebarHost.ts` or `shellChrome.ts` in this item.
> - Do not mark the item `blocked` on the host observation.
> - Do not count the Cmd+B comparison as DO 17's result; keep it in the note as the evidence for DO 7.
> - Do not commit the scratch check or a `[debug-sb14]` print.
> - Do not add `LIVE_SIDEBAR_CARET` to a two-section cell unless it moved on CI under DO 6's conditions.
>
> CONTRACT CHANGE: none. The host half, if the probe of DO 7 shows a difference from the exemplar, needs the `architecture-advisor` and its own row.
>
> VERIFY:
> - The note holds the four reading sets of DO 1 with the editor's active element named in each.
> - `git diff --stat` of the push: `src/webview/sidebar/SidebarView.tsx`, `SidebarView.test.tsx`, `src/test/ui/v2/sidebar.ui.test.ts` and the docs duties only.
> - CI run: the new `sidebar.ui.test.ts` case passes; `[keys] sidebar` and the ring line unchanged from run 43436877716; every sidebar `[fringe]` line `0 greyscale`; `[diff] summary` with 0 above tolerance, or the moved two-section cells pasted with the box-only evidence.
>
> DEFECTS: none.
>
> Files: /Users/mattias/github/nuiget/src/host/SidebarHost.ts (57-61), /Users/mattias/github/nuiget/src/webview/shared/shellChrome.ts (27), /Users/mattias/github/nuiget/src/webview/sidebar/SidebarView.tsx, /Users/mattias/github/nuiget/src/webview/sidebar/STATUS.md (304-307, 324), /Users/mattias/github/nuiget/docs/plans/STATUS-ux.md (row P3.8, line 112).

### 2026-11-13, design-advisor, SB14 form 2: the claim (verbatim)

Brief: form 1 took the focus from the editor on Reload Webviews (without SB14 the editor kept it). Answer verbatim:

> DECISION: A form between a) and b): the box claims the focus once, only when the sidebar's own document has the focus and nothing in it holds it; if that is not true at mount, it waits for the document's first focus gain. SB14 stays in UX-P3.8 as push 3 in this form. The row is not `blocked` and SB14 is not cut.
>
> Checked:
> - Your six `[sb14]` lines are a clean DO 4 result: without SB14 the editor keeps the focus through the reload; with it the top document's active element becomes `iframe.webview.ready` and stays there 5 s later.
> - `src/host/SidebarHost.ts:57-61` sends `ui/focusSearch` only on a visibility change, so it does not fire when the view is first resolved visible.
> - Not verified: the readings themselves (local macOS, illustrative), and the uncommitted working tree.
>
> WHY:
> - **The unconditional mount focus is a real defect, not a test artefact.** A `focus()` inside the webview pulls the workbench focus into the frame. At window start with the side bar restored, the user typing in an editor would lose the keyboard to the search box. That is worse than the finding SB14 fixes.
> - **Option b does not deliver SB14.** The host event is sent on a change to visible, not on the first resolve, so a first open would leave the box unfocused, which is the finding.
> - **Option a alone depends on an order nobody has measured.** If the frame gains the focus after React mounts, `document.hasFocus()` is false at mount and the box is never focused on a first open. Waiting for the first focus gain covers both orders.
> - **It matches the exemplar (D22).** The Extensions view puts the focus in its search box when the view takes the focus, not when it merely appears (from memory of VS Code, unverified). "The view has the focus and nothing in it does" is the same condition, read from inside the webview.
> - **Once is enough.** After the first claim the document keeps its own active element across later blurs, so no standing listener is needed, and a later click on the pane's empty area is left alone.
>
> DO:
> 1. In `src/webview/sidebar/SidebarView.tsx`, replace the mount effect with one effect that:
>    - defines a claim: when `document.hasFocus()` is true and `document.activeElement` is the body (or null), focus the search box and stop listening;
>    - runs the claim at mount;
>    - if it did not focus, listens for the window's `focus` event and runs the claim again; removes the listener after the first successful claim and on unmount.
>    Nothing else: no timer, no host message, no change to `useShellChrome`.
> 2. Rewrite the jsdom case in place and add the others, with `document.hasFocus` stubbed (name the titles in the note):
>    - document focused at mount → the box is the active element;
>    - document not focused at mount → the body stays active; after a window `focus` event with the document focused → the box is active;
>    - a window `focus` event while another element holds the focus → the focus does not move;
>    - after the first claim, a later window `focus` event with the body active → the focus does not move.
> 3. Keep the `sidebar.ui.test.ts` case as written (the box is the active element once the view is opened).
> 4. Before the push, three local readings, pasted in the note:
>    - the `Developer: Reload Webviews` check of the last ruling with the new form: the editor keeps the focus at both readings, and the sidebar reads `hasFocus false, active body`;
>    - the `sidebar.ui.test.ts` case passes on a VSIX built from the working tree;
>    - the Tier A readings of DO 14 again: the two-section states' `hasFocus` and active element, and the `[keys] sidebar` lines unchanged.
> 5. If the reload check still loses the editor's focus, or the UI case fails (the view opened and the box not focused), stop and return with the lines. Do not try a third form.
> 6. If all three hold, push. The CI conditions of the last ruling's DO 6 apply unchanged.
> 7. Docs duties as the item requires; if `docs/ux/interaction-model.md` states where the focus lands when the side bar view opens, its sentence takes this condition.
> 8. Keep the proposed observation row about `ui/focusSearch` on every visibility change (last ruling's DO 7); the Cmd+B readings are its evidence.
>
> DO NOT:
> - Do not push the unconditional `focus()` at mount.
> - Do not keep the listener alive after the first claim, and do not claim when any element other than the body holds the focus (a dialog's focus trap, a row).
> - Do not edit `SidebarHost.ts` or `shellChrome.ts`.
> - Do not weaken the `sidebar.ui.test.ts` case to make the new form pass.
> - Do not mark the row `done` without SB14 or `blocked` on it.
>
> CONTRACT CHANGE: none.
>
> VERIFY:
> - `npx vitest run src/webview/sidebar/SidebarView.test.tsx` → green with the four cases.
> - The note holds the three local readings of DO 4, the reload check showing `in editor true` twice.
> - `git diff --stat` of the push: `SidebarView.tsx`, `SidebarView.test.tsx`, `src/test/ui/v2/sidebar.ui.test.ts` and the docs duties only.
> - CI run: the new UI case passes; `[keys] sidebar` and the ring line unchanged from run 43436877716; every sidebar `[fringe]` line `0 greyscale`; `[diff] summary` 0 above tolerance, or a moved two-section cell pasted with the box-only evidence.
>
> DEFECTS: none in a capture. The unconditional mount focus is refused here on the local readings and never reached CI.
>
> Files: /Users/mattias/github/nuiget/src/webview/sidebar/SidebarView.tsx, /Users/mattias/github/nuiget/src/webview/sidebar/SidebarView.test.tsx, /Users/mattias/github/nuiget/src/test/ui/v2/sidebar.ui.test.ts, /Users/mattias/github/nuiget/src/host/SidebarHost.ts (57-61), /Users/mattias/github/nuiget/docs/plans/STATUS-ux.md (row P3.8, line 112).

### 2026-11-13, design-advisor, SB14 form 2 delivered to the exemplar's condition (verbatim)

Brief: form 2 held the reload check, the first UI case failed, the activity-bar open gives the view no focus. Answer verbatim:

> DECISION: Option b, as a ruling and not as a weakening. SB14 ships in the form now in the working tree, and the UI case is rewritten to the condition the exemplar actually states: the box takes the focus when the view takes the focus. The first-open gap you measured goes to its own host row behind the `architecture-advisor`. Not `OWNER MUST DECIDE`: the exemplar settles it.
>
> Checked:
> - SB14's own source, `docs/research/2026-10-23-ux-research.md:992`: "The Extensions view focuses its search box whenever the view takes focus." X35 (line 594) says the same, verified there against the VS Code source.
> - The sidebar view's id is `nuiget.sidebarView` (`package.json:73-74`), so the workbench provides the command `nuiget.sidebarView.focus`.
> - Not verified: the local readings (macOS, illustrative), the uncommitted working tree, and whether that focus command moves the focus into the webview frame; DO 2 measures it.
>
> WHY:
> - **The form matches the exemplar as the finding states it.** SB14's benchmark is "whenever the view takes focus", and the claim form does exactly that from inside the webview. My last ruling's UI case asked for more than the exemplar: focus after an open in which the workbench never gave the view the focus.
> - **Your diagnostic shows the gap is not the webview's.** After the activity-bar open the top document's active element is `body` for 6 s and the sidebar document never gains the focus. No code inside the webview can tell that case from "the user is typing in an editor" except by taking the focus, which is the defect the last check refused.
> - **The UI case was never committed**, so rewriting it removes no landed test. The four jsdom cases are the form's proof; the UI case proves the one path a real page adds.
> - **The remaining half is a host question.** Whether the host can focus the view on a first resolve the user caused, without doing so at window start, depends on what the extension API can know. That is not a design call and not this item's file.
> - **One known difference from the exemplar, accepted:** the claim runs once, so a user who left the focus on a row and returns finds it on the row, where the Extensions view would return to its box. It was ruled in the last answer and stays.
>
> DO:
> 1. Keep `SidebarView.tsx` and the four jsdom cases as they are.
> 2. Rewrite the new `sidebar.ui.test.ts` case, retitled to the condition (for example "the sidebar search box takes the focus when the view takes it (SB14, UX-P3.8)"): open the view as today, run the command `nuiget.sidebarView.focus` through the workbench, then poll, with the file's `poll`, that `sidebar-search-input` is the sidebar document's active element.
> 3. Run it locally on a VSIX built from the working tree and paste the result with one reading line (top active element, sidebar `hasFocus`, sidebar active element) taken after the command.
> 4. If the command does not move the focus into the frame (sidebar `hasFocus false` after it), stop and return with the lines. Do not substitute a click or another path without a ruling.
> 5. Run the Tier A readings still owed (last ruling's DO 4, third bullet): the two-section states' `hasFocus` and active element, and the `[keys] sidebar` lines unchanged from run 43436877716. Paste them.
> 6. Keep the reload-webviews reading already pasted (the editor keeps the focus at both readings) in the note as the proof that the form never takes the focus.
> 7. If DO 3 and DO 5 hold, push. CI conditions as ruled before: every sidebar `[fringe]` line `0 greyscale`; `[diff]` 0 above tolerance, or a moved two-section cell pasted with box-only evidence; hard `[keys]` and ring lines unchanged.
> 8. Record in the note, for the planning session, one proposed row; do not create it: "⚑ Host: the side bar's box on a first open. After the view is opened from the activity bar the workbench focus is nowhere (`[sb14-open]` lines) and the webview never gains it; the Extensions view has the focus in its box. Question for the `architecture-advisor`: can `SidebarHost` give the view the focus on a first resolve the user caused without taking it at window start. Names `src/host/SidebarHost.ts`." Fold the earlier Cmd+B observation (`ui/focusSearch` on every change to visible) into the same row.
> 9. In the note and the docs duties, describe SB14 as delivered to the exemplar's condition, with the first-open gap named and its proposed row. The CHANGELOG headline must not promise focus on open.
>
> DO NOT:
> - Do not return to an unconditional `focus()` at mount, a timer, or a retry that takes the focus.
> - Do not edit `SidebarHost.ts` or `shellChrome.ts`, or send a new host message, in this item.
> - Do not mark the row `blocked`, and do not close it by cutting SB14.
> - Do not write the UI case so that it passes without the claim effect (check once that it fails with the effect stashed, and say so in the note).
>
> CONTRACT CHANGE: none in this item. The proposed host row needs the `architecture-advisor`.
>
> VERIFY:
> - `npx vitest run src/webview/sidebar/SidebarView.test.tsx` → green, four SB14 cases.
> - Local: the rewritten UI case passes with the effect and fails with it stashed; both results in the note.
> - `git diff --stat` of the push: `SidebarView.tsx`, `SidebarView.test.tsx`, `src/test/ui/v2/sidebar.ui.test.ts` and the docs duties only.
> - CI run: the new UI case passes; `[keys] sidebar` and the ring line unchanged; every sidebar `[fringe]` line `0 greyscale`; `[diff] summary` 0 above tolerance or the box-only evidence pasted.
>
> DEFECTS: none in a capture.
>
> Files: /Users/mattias/github/nuiget/src/webview/sidebar/SidebarView.tsx, /Users/mattias/github/nuiget/src/webview/sidebar/SidebarView.test.tsx, /Users/mattias/github/nuiget/src/test/ui/v2/sidebar.ui.test.ts, /Users/mattias/github/nuiget/src/host/SidebarHost.ts (57-61), /Users/mattias/github/nuiget/docs/research/2026-10-23-ux-research.md (594, 992), /Users/mattias/github/nuiget/package.json (73-74).

## Exact next step

UX-P3.8: read push 3's CI run against the SB14 rulings' VERIFY (the new UI case passes; `[keys] sidebar` and the ring line
unchanged from run 43436877716; every sidebar `[fringe]` line `0 greyscale`; `[diff] summary` 0 above tolerance, or a moved
two-section cell with box-only evidence, then adopted `approved` with `LIVE_SIDEBAR_CARET`), then close the row.

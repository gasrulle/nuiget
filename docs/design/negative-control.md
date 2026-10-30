# Negative control

The harness is accepted only when it reports, by measurement, the defects a tree is known to have (plan D36): run from
HEAD against the VSIX of `80940aa` (`1784642^`, the tree before the five P9.fix commits) it must report the P9.fix
defects with coordinates, and against the `labs/ux` base it must report V2–V5 by measurement and nothing else at
blocking severity. A selector the old tree lacks is `not measurable`, never a pass. The runs use
`node scripts/ui-harness.mjs` through the `negative-control` job of `.github/workflows/ci.yml` (UX-P0.16): the job builds
the commit's VSIX in `/tmp/nuiget-<sha>` and runs HEAD's compiled capture suite on it in the `ui` job's window.

Coordinates are CSS px in the webview's frame (origin its top-left, DPR 1, the frame of the crops), read by the collector
of `src/test/ui/v2/measure.ts` with `getBoundingClientRect`; `x:` values are left or right edges, `y:` values centres or
edges, as each rule's line names them. Nothing here is read off a PNG.

## (a) The pre-fix tree `80940aa` (UX-P0.17)

- Dispatch run 40110663066 on `84de0f9` (`gh workflow run ci.yml --ref labs/ux -f negative_sha=80940aa`), job
  `Negative control` green (it fails only when the harness did not measure). Log `negative-output.txt` sha256
  53c66303a030a46242edfa238410e32dc056fa54e8b1ebd1a3b360fb648ba8db.
- Tree: `80940aa`, its VSIX `/tmp/nuiget-80940aa/nuiget-80940aa.vsix` sha256
  ac63d68130f77bb785382e0acf89b57ce3752554f722dd0c72f319bc3cc57dfe (the first dispatch, run 40106245758 on `fa8f304`, built
  7edf7a06451cbb167d0980b854d42748e11b632d446f4647b4e95e2ef9f94be9 from the same commit: `vsce package` is not
  byte-reproducible).
- Host: `[capture] lane ui vscode 1.140.0 chromium 150 linux dpr 1 look modern window 1440x900 png 1440x900`; Tier A, Modern
  UI. The capture suite: `30 passing`, `13 failing` (the captures with a red hard rule, and one cell not reached).
- HEAD's counterpart: push run 40109705646 on `84de0f9` (the same harness on the working tree's VSIX), every PF line green.

| Rule | P9.fix (commit) | On `80940aa` | On HEAD |
|---|---|---|---|
| PF-2 | P9.fix-2 (`1784642`): the transitive section pinned below the list | red in every cell: two scrollers | `gap 0 … one scroller` |
| PF-3a | P9.fix-3 (`8c1f643`): authors truncated | not red: `14 authors, none cut` / `15 authors, none cut` (deviation below) | the same |
| PF-3b | P9.fix-3 (`8c1f643`): check box and icon off-centre | red in every cell: check box −14.5, icon −3.5 | −0.5 and −0.5 |
| PF-4 | P9.fix-4 (`b83316d`): toolbar buttons bunched left | red in every cell: 18.3 to 199.3 px short of the list edge | 6 px |
| PF-5 | P9.fix-5 (`aacde06`): details buttons in two columns | red in every cell | one left edge |
| PF-6 | P9.fix-6 (`c50d335`): drifting left insets | red in every cell: spread 12 | spread 0 |

No PF line on `80940aa` reads `not measurable`. Per capture cell (the `[measure]` line verbatim, its coordinates, and
HEAD's line for the same cell):

| Rule | State | Theme | Width | `80940aa` (dispatch 40110663066) | Coordinates | HEAD (push run 40109705646) |
|---|---|---|---|---|---|---|
| PF-2 | main-installed-single | dark-high-contrast | 1200 | `PF-2@main-installed-single: gap -376 (at most 16; last direct row 1155, transitive header 779, two scrollers) (hard)` | y: last direct row 1155, transitive header 779 (two scrollers) | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1335, transitive header 1335, one scroller) (hard)` |
| PF-2 | main-installed-single | dark-modern | 1200 | `PF-2@main-installed-single: gap -309 (at most 16; last direct row 1088, transitive header 779, two scrollers) (hard)` | y: last direct row 1088, transitive header 779 (two scrollers) | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1256, transitive header 1256, one scroller) (hard)` |
| PF-2 | main-installed-single | dark-modern | 932 | `PF-2@main-installed-single: gap -376 (at most 16; last direct row 1155, transitive header 779, two scrollers) (hard)` | y: last direct row 1155, transitive header 779 (two scrollers) | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1335, transitive header 1335, one scroller) (hard)` |
| PF-2 | main-installed-single | dark-modern | 800 | `PF-2@main-installed-single: gap -341 (at most 16; last direct row 1120, transitive header 779, two scrollers) (hard)` | y: last direct row 1120, transitive header 779 (two scrollers) | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1367, transitive header 1367, one scroller) (hard)` |
| PF-2 | main-installed-single | dark-modern | 600 | `PF-2@main-installed-single: gap -369 (at most 16; last direct row 1148, transitive header 779, two scrollers) (hard)` | y: last direct row 1148, transitive header 779 (two scrollers) | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1395, transitive header 1395, one scroller) (hard)` |
| PF-2 | main-installed-single | dark-modern | 400 | `PF-2@main-installed-single: gap -348.4 (at most 16; last direct row 1127.4, transitive header 779, two scrollers) (hard)` | y: last direct row 1127.4, transitive header 779 (two scrollers) | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1441.4, transitive header 1441.4, one scroller) (hard)` |
| PF-2 | main-installed-single | light-modern | 1200 | `PF-2@main-installed-single: gap -376 (at most 16; last direct row 1155, transitive header 779, two scrollers) (hard)` | y: last direct row 1155, transitive header 779 (two scrollers) | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1335, transitive header 1335, one scroller) (hard)` |
| PF-3a | main-installed-single | dark-high-contrast | 1200 | `PF-3a@main-installed-single: 15 authors, none cut (hard)` | none (see PF-3a below) | `PF-3a@main-installed-single: 15 authors, none cut (hard)` |
| PF-3a | main-installed-single | dark-modern | 1200 | `PF-3a@main-installed-single: 14 authors, none cut (hard)` | none (see PF-3a below) | `PF-3a@main-installed-single: 14 authors, none cut (hard)` |
| PF-3a | main-installed-single | light-modern | 1200 | `PF-3a@main-installed-single: 15 authors, none cut (hard)` | none (see PF-3a below) | `PF-3a@main-installed-single: 15 authors, none cut (hard)` |
| PF-3b | main-installed-single | dark-high-contrast | 1200 | `PF-3b@main-installed-single: check box -14.5 ×15; icon -3.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 183.5, check 169, icon 180) (hard)` | y: Microsoft.Extensions.DependencyInjection.Abstractions row centre 183.5, check box 169, icon 180 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 189.5, check 189, icon 189) (hard)` |
| PF-3b | main-installed-single | dark-modern | 1200 | `PF-3b@main-installed-single: check box -14.5 ×14; icon -3.5 ×14 (centre offsets, 14 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 183.5, check 169, icon 180) (hard)` | y: Microsoft.Extensions.DependencyInjection.Abstractions row centre 183.5, check box 169, icon 180 | `PF-3b@main-installed-single: check box -0.5 ×14; icon -0.5 ×14 (centre offsets, 14 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 189.5, check 189, icon 189) (hard)` |
| PF-3b | main-installed-single | dark-modern | 932 | `PF-3b@main-installed-single: check box -14.5 ×15; icon -3.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 183.5, check 169, icon 180) (hard)` | y: Microsoft.Extensions.DependencyInjection.Abstractions row centre 183.5, check box 169, icon 180 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 189.5, check 189, icon 189) (hard)` |
| PF-3b | main-installed-single | dark-modern | 800 | `PF-3b@main-installed-single: check box -14.5 ×14; icon -3.5 ×14 (centre offsets, 14 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 215.5, check 201, icon 212) (hard)` | y: Microsoft.Extensions.DependencyInjection.Abstractions row centre 215.5, check box 201, icon 212 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 221.5, check 221, icon 221) (hard)` |
| PF-3b | main-installed-single | dark-modern | 600 | `PF-3b@main-installed-single: check box -14.5 ×14; icon -3.5 ×14 (centre offsets, 14 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 243.5, check 229, icon 240) (hard)` | y: Microsoft.Extensions.DependencyInjection.Abstractions row centre 243.5, check box 229, icon 240 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 249.5, check 249, icon 249) (hard)` |
| PF-3b | main-installed-single | dark-modern | 400 | `PF-3b@main-installed-single: check box -14.5 ×13; icon -3.5 ×13 (centre offsets, 13 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 289.9, check 275.4, icon 286.4) (hard)` | y: Microsoft.Extensions.DependencyInjection.Abstractions row centre 289.9, check box 275.4, icon 286.4 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 295.9, check 295.4, icon 295.4) (hard)` |
| PF-3b | main-installed-single | light-modern | 1200 | `PF-3b@main-installed-single: check box -14.5 ×15; icon -3.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 183.5, check 169, icon 180) (hard)` | y: Microsoft.Extensions.DependencyInjection.Abstractions row centre 183.5, check box 169, icon 180 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 189.5, check 189, icon 189) (hard)` |
| PF-3b | main-updates | dark-modern | 1200 | `PF-3b@main-updates: check box -14.5 ×14; icon -3.5 ×14 (centre offsets, 14 rows; first Dapper: row 159.5, check 145, icon 156) (hard)` | y: Dapper row centre 159.5, check box 145, icon 156 | `PF-3b@main-updates: check box -0.5 ×14; icon -0.5 ×14 (centre offsets, 14 rows; first Dapper: row 165.5, check 165, icon 165) (hard)` |
| PF-4 | main-installed-single | dark-high-contrast | 1200 | `PF-4@main-installed-single: installed-list: button 261.7, scroll port 420 (158.3; listbox 420) (hard)` | x: primary button right 261.7, installed-list scroll port right 420 | `PF-4@main-installed-single: installed-list: button 414, scroll port 420 (6; listbox 405) (hard)` |
| PF-4 | main-installed-single | dark-modern | 1200 | `PF-4@main-installed-single: installed-list: button 261.7, scroll port 420 (158.3; listbox 420) (hard)` | x: primary button right 261.7, installed-list scroll port right 420 | `PF-4@main-installed-single: installed-list: button 414, scroll port 420 (6; listbox 405) (hard)` |
| PF-4 | main-installed-single | dark-modern | 932 | `PF-4@main-installed-single: installed-list: button 261.7, scroll port 326.2 (64.5; listbox 326.2) (hard)` | x: primary button right 261.7, installed-list scroll port right 326.2 | `PF-4@main-installed-single: installed-list: button 320.2, scroll port 326.2 (6; listbox 311.2) (hard)` |
| PF-4 | main-installed-single | dark-modern | 800 | `PF-4@main-installed-single: installed-list: button 261.7, scroll port 280 (18.3; listbox 280) (hard)` | x: primary button right 261.7, installed-list scroll port right 280 | `PF-4@main-installed-single: installed-list: button 274, scroll port 280 (6; listbox 265) (hard)` |
| PF-4 | main-installed-single | light-modern | 1200 | `PF-4@main-installed-single: installed-list: button 261.7, scroll port 420 (158.3; listbox 420) (hard)` | x: primary button right 261.7, installed-list scroll port right 420 | `PF-4@main-installed-single: installed-list: button 414, scroll port 420 (6; listbox 405) (hard)` |
| PF-4 | main-updates | dark-modern | 1200 | `PF-4@main-updates: updates-list: button 220.7, scroll port 420 (199.3; listbox 420) (hard)` | x: primary button right 220.7, updates-list scroll port right 420 | `PF-4@main-updates: updates-list: button 414, scroll port 420 (6; listbox 420) (hard)` |
| PF-5 | main-installed-details | dark-high-contrast | 1200 | `PF-5@main-installed-details: left 562.4/666, height 24/24 (hard)` | x: Uninstall left 562.4, Update left 666 | `PF-5@main-installed-details: left 660.8/660.8, height 24/24 (hard)` |
| PF-5 | main-installed-details | dark-modern | 1200 | `PF-5@main-installed-details: left 562.4/666, height 24/24 (hard)` | x: Uninstall left 562.4, Update left 666 | `PF-5@main-installed-details: left 660.8/660.8, height 24/24 (hard)` |
| PF-5 | main-installed-details | dark-modern | 400 | `PF-5@main-installed-details: left 282.4/160, height 24/24 (hard)` | x: Uninstall left 282.4, Update left 160 | `PF-5@main-installed-details: left 293.3/293.3, height 24/24 (hard)` |
| PF-5 | main-installed-details | light-modern | 1200 | `PF-5@main-installed-details: left 562.4/666, height 24/24 (hard)` | x: Uninstall left 562.4, Update left 666 | `PF-5@main-installed-details: left 660.8/660.8, height 24/24 (hard)` |
| PF-6 | main-installed-single | dark-high-contrast | 1200 | `PF-6@main-installed-single: spread 12 (row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard)` | x: row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | dark-modern | 1200 | `PF-6@main-installed-single: spread 12 (row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard)` | x: row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | dark-modern | 932 | `PF-6@main-installed-single: spread 12 (row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard)` | x: row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | dark-modern | 800 | `PF-6@main-installed-single: spread 12 (row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard)` | x: row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | dark-modern | 600 | `PF-6@main-installed-single: spread 12 (row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard)` | x: row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | dark-modern | 400 | `PF-6@main-installed-single: spread 12 (row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard)` | x: row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | light-modern | 1200 | `PF-6@main-installed-single: spread 12 (row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard)` | x: row 16, search 16, section 4, tab 9, title 16, toolbar 8) (hard | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |

**PF-2.** The header is found by P9.fix-2's own selector (`section-header-transitive`, its closest
`.nuiget-section-header`): `80940aa` has no `section-box-transitive`, the hook UX-P0.10 added to the same element. On the
old tree the header sits at y 779, under the direct list, which scrolls by itself; `last direct row` is the bottom of the
last rendered row of that virtualized list, inside its own scroller, so the gap is negative and the line reads
`two scrollers`.

**PF-3a (deviation from the row's literal "each of PF-2…PF-6 red").** PF-3a stays as bound (hard, `main-installed-single`,
panel 1200) and reads `14 authors, none cut` / `15 authors, none cut` on both trees: at 1200 no author string of the dense
workspace is long enough to be cut, on either tree, so this is a true measurement, not a blind one. P9.fix-3 is reported on
`80940aa` by PF-3b. The cut exists at panel 932 on both trees (illustration only, not evidence:
`main-installed-single.dark-modern.932.png` of `80940aa`, first dispatch 40106245758, sha256
66782c9818d593698906324cde6599ac35557a778a4630005d5f5833aaf78bc0; of HEAD, run 40105259227, sha256
018ce01e8652e6ded838c53473de3132d468c063436abc94ca2ed3cd95a9bfd9). PF-3a is not bound at 932 and gains no own-line clause:
composition A (D46) and DS-ROW-1 / T-27 put the version and the authors on one line, so either would be red by design after
UX-P2.2; truncation at narrow widths is DS-ROW-5's (pending UX-P2.2), DS-ROW-1's and DS-OVERFLOW-1's. Design-advisor and
architecture-advisor rulings of 2026-10-24 (`docs/plans/handoff/P0.17.md`); the owner ratifies at the P0 gate. Ratified
2026-10-30 (tracker `## Phase gates`, the P0 gate on 2fa38d6).

**Cell not reached.** `main-installed-single.dark-modern.220.png` on `80940aa`: `not reachable (Timed out after 120000 ms
waiting for data-testid="package-row-fluentvalidation")`, so no PF line exists for that cell; HEAD measures PF-2, PF-3b and
PF-6 there. Every rule is red on `80940aa` in the six other cells of the state.

## (b) The `labs/ux` base (UX-P0.18)

- Push run 40111706433 on `57a9bdd` (the per-push `ui` job, the harness on the working tree's VSIX), every job green. The
  product tree of that SHA is the 2.0 tree before any screen item (`git diff --stat 1a608e4..57a9bdd -- src/webview src/host
  src/extension.ts` is empty: only measurement hooks were added before UX-P0.12). Logs: `ui-output.txt` sha256
  376c06d7e0be8ab6c2e2e0948b9b8bec796e6a03925bd6072de11a34c8f6439f, `ui-classic-output.txt` sha256
  655721fc871d0141e3b09f1f3666dd8b13eb9201a73476382f56d68c6e2a0ae0.
- Host: `[capture] lane ui vscode 1.140.0 chromium 150 linux dpr 1 look modern window 1440x900 png 1440x900`; Modern UI `43
  passing`, classic `8 passing`; `grep -c 'hard measurement red'` → 0; `grep -c '(hard)'` → 105; `[diff] summary: 46
  compared, 46 at 0 px`. The V lines and the five rules below read the same in the UX-P0.15 rerun pair (run 40101114443, both
  attempts): the P0 gate's two identical runs for declaring them `hard`.
- Pending lines print no verdict: each verdict below follows from the rule's text and its tolerance in
  `src/test/ui/v2/measure.ts`. Coordinates as in (a).

### V2: "Select all" and "Uninstall selected" misaligned with each other and with the list

| State | Line | Coordinates | Verdict |
|---|---|---|---|
| main-installed-single (dark-modern 1200, 932, 800, 600, 400; light-modern and dark-high-contrast 1200) | `DS-INSET-2@main-installed-single/toolbars: 16/6 4/4 (pending P2.5)` | x: start inset 16, end inset 6 | red: start and end differ by 10 against ± 1 |
| main-installed-single (dark-modern 220) | `DS-INSET-2@main-installed-single/toolbars: 16/-26.9 4/4 (pending P2.5)` | x: end −26.9 (the button past the end) | red |
| main-installed-single (dark-modern 1200) | `DS-INSET-3@main-installed-single/headers: group headers 0 (target 16); header and toolbars 6, 20 (target 16) (pending P2.6)` | x: toolbar end 6, header end 20 | red |
| main-updates (dark-modern 1200) | `DS-INSET-2@main-updates/toolbars: 16/6 4/4 (pending P2.5)` | x: 16 / 6 | red |

PF-4 stays green (`PF-4@main-installed-single: installed-list: button 414, scroll port 420 (6; listbox 405) (hard)`): P9.fix-4's
own tolerance is 8 px (D34's note); the 6 px it admits is V2's asymmetry, which DS-INSET-2 measures.

### V3: the "provisional" badge of a project header overlaps the list's right border

| State | Line | Coordinates | Verdict |
|---|---|---|---|
| main-installed-unsupported (dark-modern 1200) | `DS-OVERFLOW-2@main-installed-unsupported: 0 offending in 2 containers; badges: direct "Unsupported" 268.6–349.9 (box right 420); direct "provisional" 349.9–420 (box right 420); transitive "net8.0" 374.3–420 (box right 420) (pending P2.6)` | x: badge 349.9–420, the pane edge 420 | DS-OVERFLOW-2 passes on the boundary |
| main-installed-unsupported (dark-modern 1200) | `DS-INSET-3@main-installed-unsupported/headers: group headers 0 ×2 (target 16); header and toolbars 6, 20 (target 16) (pending P2.6)` | x: header end inset 0 | red |
| main-installed-unsupported (dark-modern 1200) | `DS-INSET-2@main-installed-unsupported/headers: direct 16/5 4/4; transitive 16/5 4/4 (pending P2.6)` | x: start 16, end 5 | red |
| main-installed-single (dark-modern 1200) | `DS-OVERFLOW-2@main-installed-single: 0 offending in 2 containers; badges: direct "provisional" 334.9–405 (box right 405) (pending P2.6)` | x: badge 334.9–405 against the scrollbar from 405 | DS-OVERFLOW-2 passes on the boundary; `DS-INSET-3 … group headers 0` red |
| main-installed-all (every theme, 1200) | `DS-OVERFLOW-2@main-installed-all: 0 offending in 5 containers; badges: … project-unsupported.csproj "provisional" 329.6–399.8 (box right 399.8) … (pending P2.6)` | x: badge 329.6–399.8 in a box ending 399.8 (below the fold: DOM only) | DS-OVERFLOW-2 passes on the boundary |
| main-installed-all (dark-modern 1200) | `DS-INSET-3@main-installed-all/headers: group headers 0 ×2, 237.2, 242.8 (target 16); header and toolbars 6, 20 (target 16) (pending P2.6)` and `DS-INSET-2@main-installed-all/headers: … project-unsupported.csproj 16/5 3.9/4 …` | x: end inset 0 and 5 | red |

V3 reproduces on HEAD: the badge ends on the pane edge (`main-installed-unsupported`) or on the list's scrollbar
(`main-installed-single`), the rubric's blocking class "touching the scrollbar or the pane edge". DS-OVERFLOW-2 (a child
inside its parent's content box; `.nuiget-section-header` has no end padding) is now bound and reads a true pass on the
boundary, so V3 is carried by DS-INSET-3 (group headers 0, target 16) and DS-INSET-2 (16/5), all pending P2.6, whose row names V3.
The Utility project's header carries an SDK-10 provisional badge in 2 of the 6 `main-installed-all` captures (its provisional
window closes while the suite runs): a timing item for the P0 phase review; the Unsupported project's badge is permanent and the V3
subject of record.

### V4: section headers with a small top margin and a large bottom margin

| State | Line | Coordinates | Verdict |
|---|---|---|---|
| main-installed-single (dark-modern 1200, 932, 800, 600; light-modern, dark-high-contrast 1200) | `DS-GRID-2b@main-installed-single: direct 9.3/19.2 (pending P2.6)` | y: 9.3 above the header, 19.2 below it | red: below exceeds above by more than 2 |
| main-installed-single (dark-modern 400, 220) | `DS-GRID-2b@main-installed-single: direct 9.3/1125 (pending P2.6)`, `… direct 9.3/28.7 …` | y: 9.3 / 1125 and 9.3 / 28.7 | red |
| main-transitive-expanded (dark-modern 1200) | `DS-GRID-2b@main-transitive-expanded: transitive 20/43.2 (pending P2.6)` | y: 20 above, 43.2 below | red |

### V5: spacing that follows no single scale

| State | Line | Coordinates | Verdict |
|---|---|---|---|
| main-installed-single (dark-modern 1200) | `DS-GRID-1@main-installed-single: 1 off-ramp ([tab-bar] padding-left 7px) (pending P2.7)` | x: tab bar padding 7 (ramp 6, 8) | red |
| main-installed-single (dark-modern 1200) | `DS-GRID-2a@main-installed-single: gaps 0 (3 off {4, 8}) (pending P2.7)` | three block gaps of 0 off {4, 8} | red |
| main-updates (dark-modern 1200) | `DS-GRID-1@main-updates: 1 off-ramp ([tab-bar] padding-left 7px) (pending P3.1b)` | x: 7 | red |
| main-updates (dark-modern 1200) | `DS-GRID-2a@main-updates: gaps 0 (3 off {4, 8}) (pending P3.1b)` | three gaps of 0 | red |

### V1: the tab bar and the bulk toolbar look squeezed (judge-only)

V1 is judge-only (D36); its numeric part, in `main-installed-single` and `main-updates` (dark-modern 1200):
`DS-HEIGHT-4@main-installed-single: 25 (target 36, workbench 37) (pending P2.5)`; `DS-HEIGHT-6@main-installed-single: 24 ×2 (target
26, workbench 26); fontSize 13px ×2 (target 12px); lineHeight 18.2px ×2 (target 16px); padding 0px 12px 0px 12px ×2 (target 4px 8px
4px 8px); radius 2px ×2 (target 4px) (pending P2.3)`; `DS-HEIGHT-7@main-installed-single: search 24 (target 26, workbench 26); select
24 ×2 (target 26, workbench 26) (pending P2.4)`; the same in `main-updates`. All red against their targets.

### PF-2…PF-6: green in every cell

Every PF line of the run reads `(hard)` and no capture fails a hard rule (38 PF lines, Modern UI):

| Rule | State | Theme | Width | Line |
|---|---|---|---|---|
| PF-2 | main-installed-single | dark-high-contrast | 1200 | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1335, transitive header 1335, one scroller) (hard)` |
| PF-2 | main-installed-single | dark-modern | 1200 | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1256, transitive header 1256, one scroller) (hard)` |
| PF-2 | main-installed-single | dark-modern | 932 | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1335, transitive header 1335, one scroller) (hard)` |
| PF-2 | main-installed-single | dark-modern | 800 | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1367, transitive header 1367, one scroller) (hard)` |
| PF-2 | main-installed-single | dark-modern | 600 | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1395, transitive header 1395, one scroller) (hard)` |
| PF-2 | main-installed-single | dark-modern | 400 | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1441.4, transitive header 1441.4, one scroller) (hard)` |
| PF-2 | main-installed-single | dark-modern | 220 | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1562.7, transitive header 1562.7, one scroller) (hard)` |
| PF-2 | main-installed-single | light-modern | 1200 | `PF-2@main-installed-single: gap 0 (at most 16; last direct row 1335, transitive header 1335, one scroller) (hard)` |
| PF-3a | main-installed-single | dark-high-contrast | 1200 | `PF-3a@main-installed-single: 15 authors, none cut (hard)` |
| PF-3a | main-installed-single | dark-modern | 1200 | `PF-3a@main-installed-single: 14 authors, none cut (hard)` |
| PF-3a | main-installed-single | light-modern | 1200 | `PF-3a@main-installed-single: 15 authors, none cut (hard)` |
| PF-3b | main-installed-single | dark-high-contrast | 1200 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 189.5, check 189, icon 189) (hard)` |
| PF-3b | main-installed-single | dark-modern | 1200 | `PF-3b@main-installed-single: check box -0.5 ×14; icon -0.5 ×14 (centre offsets, 14 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 189.5, check 189, icon 189) (hard)` |
| PF-3b | main-installed-single | dark-modern | 932 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 189.5, check 189, icon 189) (hard)` |
| PF-3b | main-installed-single | dark-modern | 800 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 221.5, check 221, icon 221) (hard)` |
| PF-3b | main-installed-single | dark-modern | 600 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 249.5, check 249, icon 249) (hard)` |
| PF-3b | main-installed-single | dark-modern | 400 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 295.9, check 295.4, icon 295.4) (hard)` |
| PF-3b | main-installed-single | dark-modern | 220 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 417.2, check 416.7, icon 416.7) (hard)` |
| PF-3b | main-installed-single | light-modern | 1200 | `PF-3b@main-installed-single: check box -0.5 ×15; icon -0.5 ×15 (centre offsets, 15 rows; first Microsoft.Extensions.DependencyInjection.Abstractions: row 189.5, check 189, icon 189) (hard)` |
| PF-3b | main-updates | dark-modern | 1200 | `PF-3b@main-updates: check box -0.5 ×14; icon -0.5 ×14 (centre offsets, 14 rows; first Dapper: row 165.5, check 165, icon 165) (hard)` |
| PF-4 | main-installed-single | dark-high-contrast | 1200 | `PF-4@main-installed-single: installed-list: button 414, scroll port 420 (6; listbox 405) (hard)` |
| PF-4 | main-installed-single | dark-modern | 1200 | `PF-4@main-installed-single: installed-list: button 414, scroll port 420 (6; listbox 405) (hard)` |
| PF-4 | main-installed-single | dark-modern | 932 | `PF-4@main-installed-single: installed-list: button 320.2, scroll port 326.2 (6; listbox 311.2) (hard)` |
| PF-4 | main-installed-single | dark-modern | 800 | `PF-4@main-installed-single: installed-list: button 274, scroll port 280 (6; listbox 265) (hard)` |
| PF-4 | main-installed-single | light-modern | 1200 | `PF-4@main-installed-single: installed-list: button 414, scroll port 420 (6; listbox 405) (hard)` |
| PF-4 | main-updates | dark-modern | 1200 | `PF-4@main-updates: updates-list: button 414, scroll port 420 (6; listbox 420) (hard)` |
| PF-5 | main-installed-details | dark-high-contrast | 1200 | `PF-5@main-installed-details: left 660.8/660.8, height 24/24 (hard)` |
| PF-5 | main-installed-details | dark-modern | 1200 | `PF-5@main-installed-details: left 660.8/660.8, height 24/24 (hard)` |
| PF-5 | main-installed-details | dark-modern | 400 | `PF-5@main-installed-details: left 293.3/293.3, height 24/24 (hard)` |
| PF-5 | main-installed-details | light-modern | 1200 | `PF-5@main-installed-details: left 660.8/660.8, height 24/24 (hard)` |
| PF-6 | main-installed-single | dark-high-contrast | 1200 | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | dark-modern | 1200 | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | dark-modern | 932 | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | dark-modern | 800 | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | dark-modern | 600 | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | dark-modern | 400 | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | dark-modern | 220 | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |
| PF-6 | main-installed-single | light-modern | 1200 | `PF-6@main-installed-single: spread 0 (row 16, search 16, section 16, tab 16, title 16, toolbar 16) (hard)` |

### The five rules flipped by UX-P0.18

Design-advisor ruling of 2026-10-24 (`docs/plans/handoff/P0.18.md`): `hard` where this run and the UX-P0.15 rerun pair read
green in every capture of the group; the red groups to the items that make them hold; no scope left on P0.18.

| Rule | Reading on this run (Modern UI + classic) | Disposition |
|---|---|---|
| DS-TYPE-1 | `one family` in 80 + 12 lines | hard in main-installed, main-updates, browse, details, dialogs, sidebar; sources pending P3.6 (no state) |
| DS-TYPE-4 | `line height 18.2 (target 18.2)` in 80 + 12 lines; 14 sidebar lines add `compact rows 18.2 ×29 (target 22)` (red) | hard in main-installed, main-updates, browse, details, dialogs; sidebar pending P3.7a (V36, V14, D47); sources pending P3.6 |
| DS-TYPE-6 | `meta 11.05 ×N (target 11)` green at the rule's own 0.1 in 78 lines; the two Browse-list states (`main-browse-results`, group browse; `main-browse-details`, group details by `stateGroup`'s `-details` test) read `description 11.05 ×15 (target 13)`, red in 4 lines; `not measurable (no row metadata)` in the 6 lines of the three no-row states | tolerance declared `TOLERANCES.fontExact` 0.1 (the applied value, unchanged); hard in main-installed, main-updates, details, sidebar; browse and `main-browse-details` (through `pendingStates`) pending P3.2 (T-27, DS-ROW-1); the three no-row states excepted |
| DS-ROW-4 | `visible actions per row 0 ×N` or `0 ×N, 1` (at most 3) everywhere it measures; `not measurable (no row)` in the 6 lines of the no-row states | hard in main-installed, main-updates, browse, details, sidebar; the three no-row states excepted |
| DS-COPY-3 | `main-installed-filter-nomatch: 2 end with a full stop` (green); `main-installed-unsupported: no full stop: banner "Unsupported project: requires .NET SDK 10 or newer"` (red) | hard in main-installed with `main-installed-unsupported` pending P2.8b (Design System §9, §10 item 2); main-updates pending P3.1b, browse and sidebar pending P3.10 (no ready state shows their empty, error or unavailable cells) |

The no-row states are `main-installed-filter-nomatch` (the list has no option), `main-quicksearch-open` and
`main-quicksearch-versions` (the popup over the list): the rules have no subject there, so they print nothing instead of `not
measurable` (`exceptStates`), never a pass. None of the three reds is at blocking severity (`judge-rubric.md` §3: a row height or
line box off the spec and a secondary text one size step off are major or minor, punctuation against the copy rules is major) and
each is classified, so no V-row is added. Every other blocking-class pending value of the run is classified: DS-OVERFLOW-6 and MS-8's
chrome by V72 on P2.1a, DS-OVERFLOW-1 and -6 at 220 and 400 by V50 on P2.7 and P3.3b.

The item's own run 40114517304 (on `63cbc67`) went red on one line, `DS-TYPE-6@main-browse-details: meta 11.05 ×45 (target 11);
description 11.05 ×15 (target 13); 0 meta off descriptionForeground (hard)` (`42 passing`, `1 failing`; `[diff] 40 compared, 40 at 0
px`, the classic pass not run): the first ruling had filed `main-browse-details` under browse, and the design-advisor's follow-up of
2026-10-24 sends that state to P3.2 through `pendingStates`, the details scope staying hard (fix-forward commit).

### The reference set

The run's 46 crops are committed as `docs/ux/reference-2.0/<state>.<theme>.<width>.png`, with their sha256 in that folder's
`README.md`: the permanent "before" of the before/after pages (UX-P2.10, UX-P7.4). The PNGs of run 39025149785 (classic, full
window) stay the V1–V5 evidence only.

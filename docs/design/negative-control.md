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
architecture-advisor rulings of 2026-10-24 (`docs/plans/handoff/P0.17.md`); the owner ratifies at the P0 gate.

**Cell not reached.** `main-installed-single.dark-modern.220.png` on `80940aa`: `not reachable (Timed out after 120000 ms
waiting for data-testid="package-row-fluentvalidation")`, so no PF line exists for that cell; HEAD measures PF-2, PF-3b and
PF-6 there. Every rule is red on `80940aa` in the six other cells of the state.

## (b) The `labs/ux` base (UX-P0.18)

Not run yet.

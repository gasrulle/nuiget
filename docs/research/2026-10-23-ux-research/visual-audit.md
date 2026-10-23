# Visual audit of nUIget 2.0 against the design rules

Research dimension: **visual-audit** · 2026-10-22 · repository `main` at `e4d6e97`, read-only (nothing written, built
or staged in the repository). Report path:
`/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/research/visual-audit.md`

## 0. Answer first

- **V1–V5 each have a named CSS cause and a rule that catches them** (section 2). The common root of V1 and of most
  height deviations is one token: `--nuiget-target-min: 24px` (`tokens.css:40`) is used 22 times as the *visual*
  height of buttons, inputs, selects, tabs and section headers. The pointer-target minimum and the drawn height are
  one number.
- **Eighteen findings the design-rules report does not already carry** came out of the pixel scans and the
  stylesheets. The five that change a plan decision:
  1. **On current VS Code the scrollbar rules do nothing.** VS Code's webview default styles set
     `html { scrollbar-color: … }` (`webview/browser/pre/index.html`, `@layer vscode-default`). On Chromium 121 and
     later that overrides every `::-webkit-scrollbar` rule (MDN). The captures (Chromium 150) show 15 px classic
     scrollbars with arrow buttons, in the editor-background colour, inside the side-bar-coloured list pane. The
     10 px rules in `primitives.css:25-44` are never applied. The CSS-baseline lint denies `scrollbar-color`, so
     today's lints block the obvious fix.
  2. **The sash is a 4 px bar that is always painted.** The workbench draws a 1 px separator and a transparent sash
     that shows `sash.hoverBorder` only after a 300 ms hover. nUIget paints the bar at rest and uses `focusBorder` on
     hover. In high contrast that becomes a 4 px cyan bar.
  3. **A count badge inside a section heading renders at 9.4 px**, because `0.85em` is applied inside `0.85em`. The
     Transitive badge inside the details title renders at 12.7 px bold. Badge text therefore comes in 9.4, 11.05 and
     12.7 px.
  4. **The row check mark is drawn in the divider colour with no fill**, at 1.36:1 on the list and 1.09:1 on a
     selected row (Dark Modern) and 1.19:1 on Light Modern. It is also a second check-box design next to the 16 px
     header check boxes.
  5. **The sidebar confirms Update all with an in-webview dialog.** Its backdrop lightens the sidebar (#181818 →
     #1c1c1c) instead of dimming it, and it covers the button that opened it. The same surface confirms a central
     update with a VS Code modal.
- **Things that measure as correct:**
  - The list column's left inset is 16 px for the title, search box, tab label, toolbar, section chevron and row
    check box (P9.fix-6 holds).
  - Lexically, every spacing value is on the workbench ramp except two (`main.css:165` at 7 px, `search.css:16` at
    48 px).
  - The tokens contain no colour literals.
  - The progress bar is 2 px.
  - Row names truncate last in the sidebar at 200 px.
- **Captures cannot measure several areas.** None of the 15 captures shows a loading, empty, error, unsupported,
  narrow-main or main-panel dialog state. The empty, error and loading paths exist in code: 23 `EmptyState`, 38
  `Banner`, 18 `Skeleton` and 4 `ProgressBar` JSX occurrences in non-test files under `src/webview`. Those state rules can only be checked from code until the capture list
  grows.

## 1. Method, sources and limits

| Item | Value |
|---|---|
| Captures | 15 PNGs, run 39025149785, 1280×900, DPR 1, VS Code **1.140.0** (classic chrome, Chromium 150; design-rules §1), Dark Modern unless suffixed: `/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/captures/39025149785/20261017T103410/` |
| References | 12 JPEGs of 1.18.9, `/Users/mattias/github/nuiget/docs/ux/reference-1.18.9/*.jpg` (1600 px wide, downscaled; used for IA comparison, not measured) |
| Stylesheets | all five under `src/webview` read in full: `shared/tokens.css` (231 lines), `shared/primitives/primitives.css` (844), `main/main.css` (735), `sidebar/sidebar.css` (136), `shared/search/search.css` (108) |
| Pixel tools (mine) | `visual-audit/tools/` in the scratchpad: `png.mjs` (decoder copied from `research/tools/`), `runs.mjs` (colour runs along a row or column), `ink.mjs` (ink box against a background), `rows.mjs` / `cols.mjs` (ink row/column runs), `crop.mjs` |
| Source tools (mine) | `tokens-usage.mjs` (use count of every token), `spacing.mjs` (every padding/margin/gap/inset resolved to px against the ramp; output `visual-audit/spacing-resolved.txt`, 148 declarations) |
| Workbench sources | design-rules' local copies (`research/vscode-src/`, pinned `microsoft/vscode@54d565d`, `release/1.85` in `r185/`), plus files I fetched at the same commit into `visual-audit/vscode/`: `sash.css`, `sash.ts`, `splitview.css`, `countBadge.ts`, `defaultStyles.ts`, `dialog.css`, `toggle.css`, `extensionsWidgets.css`, `extensions/theme-defaults/themes/dark_modern.json`, `light_modern.json` |
| Web | MDN `::-webkit-scrollbar` (fetched 2026-10-22, `visual-audit/web/mdn-webkit-scrollbar.html`); Chrome docs "Scrollbar styling" (`visual-audit/web/scrollbar-styling.html`) |

Coordinate conventions: x and y are CSS px in the 1280×900 captures. The main webview spans x 348–1279 and starts at
y 65; the list pane is x 348–673, the sash 674–677 and the details pane 678–1279. The sidebar webview spans x 48–347.
"Box" means a painted edge (border or background change). "Ink" means the bounding box of glyph pixels against the
background (threshold 30–60 per channel). Text renders with sub-pixel anti-aliasing, so ink edges are ±1 px.

What I could **not** do: the task forbids the browser pane, and VS Code is not installed, so there is no DOM. Every
rule whose measurement is written as `getComputedStyle` or `getBoundingClientRect` is approximated here in one of two
ways: from source, by resolving tokens to px at the webview's fixed 13 px base (`themeing.ts:84`, cited by
design-rules), or from pixels. Each claim says which. Font sizes are derived from CSS and cross-checked against glyph
heights (digit heights of 7 and 8 px tell 9.4 px apart from 11 px).

## 2. V1–V5: causes and catching rules

Design-rules §4 already measured all five. The table below adds the stylesheet rules that produce each symptom and
the coordinates I re-measured; where my scan agrees with design-rules, I cite it rather than repeat it.

| ID | Symptom (owner) | Measured (`main-installed-single.png` unless noted) | CSS that produces it | Rule(s) that catch it |
|---|---|---|---|---|
| **V1** | Tab bar and bulk toolbar look squeezed | Tab strip y 134–157 (24 px, including a 2 px underline at 156–157), tablist line 158. Toolbar buttons 163–186 (24 px). Only 4 px of box above and below the buttons (159–162, 187–190). Label ink: tab 139–148; "Select all" 169–178. The native editor tab strip in the same PNG is 35 px (30–64). | Tab: `primitives.css:803` `min-height: var(--nuiget-target-min)` (24), `:804` padding `0 8px` (no vertical padding), `:806-807` a 1 px contrast border plus a 2 px transparent bottom border inside the 24 px. Tablist: `primitives.css:792-797` (gap 2, 1 px line). Toolbar: `main.css:190-195` padding 4 above and below; `primitives.css:834-839` gap 4. Button: `primitives.css:507-516` `min-height: var(--nuiget-target-min)`, padding `0 12px`, no vertical padding. Root: `tokens.css:40` `--nuiget-target-min: 24px` (22 uses as a height). | DS-HEIGHT-4 (tab strip ≈ 33 px), DS-HEIGHT-6 (button 26/28 px), DS-GRID-2(a) (8 px between groups) |
| **V2** | "Select all" and "Uninstall selected" misaligned with each other and with the list | "Select all" box x 364–448 (start inset 16). "Uninstall selected (0)" box x 504–667: its right edge has an end inset of 6, while the pane content ends at 673. The selected row's highlight ends at 649 (actions column 650–673). The search box ends at 1263 (end inset 16). The right edge of the primary action lines up with none of 649, 657 or 673. | `main.css:192` padding `4px 16px`, overridden at `main.css:193-194` by `padding-inline-end: var(--nuiget-space-3)` (6 px, "ends at the list's right edge", P9.fix-4). `primitives.css:842-844` `.nuiget-toolbar-end { margin-inline-start: auto }`. The row's option is `flex: 1` and its 24 px actions column sits outside it (`primitives.css:90-100`, `337-342`, `371`). | DS-INSET-2 (start = end), DS-INSET-3 (end inset 16 in main), DS-ROW-3 (highlight covers the actions) |
| **V3** | The "provisional" badge of an All Projects project header overlaps the list's right border | `main-installed-all.png`: the badge box is x 604–673, y 376–393, with its info border (#59a4f9) at x 604 and 673. The sash starts at 674, so the end inset is 0. The `net8.0` TFM badge is the same at x 628–673 (`main-transitive-expanded.png`, y 297–314). | `primitives.css:451-455` `.nuiget-section-header` (flex, no padding). `:499-503` `.nuiget-section-actions` (no margin or padding). `main.css:168-170` gives the list's toggle a start inset only. The badges are passed as `actions`: `InstalledProjectSection.tsx:159-164,180,192`; `TransitiveSection.tsx:110,137`. | DS-INSET-3, DS-OVERFLOW-2, DS-INSET-2 |
| **V4** | Section headers have a small top margin and a large bottom margin | Ink gap above the DIRECT PACKAGES title (button bottom 186 → cap top 198) = 11 px. Below it (title ink bottom 207 → first row's name ink 230) = 22 px. The same 7 px above / 22 px below for TRANSITIVE PACKAGES after a row (`main-transitive-expanded.png`: row line 293, title ink 301–310, next name ink at 333). | Header box 24 px (`primitives.css:454` `min-height: var(--nuiget-row-height-compact)`) with the 11.05 px title centred: half-leading of about 7 px on each side. Above it there is only the toolbar's 4 px bottom padding (`main.css:192`). Below it the comfortable row adds 12 px of top padding (`primitives.css:247` `padding: var(--nuiget-space-5) var(--nuiget-inset)`), and the 13 px name line adds its own half-leading. So the header is visually closer to the block above than to the rows it labels. | DS-GRID-2(b) (gap below ≤ gap above + 2 px); DS-HEIGHT-3 (a 72 px row shrinks the stacked padding) |
| **V5** | Spacing between header, toolbar, section headers and rows follows no single scale | Box gaps down the list column: 8 (webview top 65 → select 73), 8 (select 96 → search 105, made of 4 + 4), 4 (search 128 → line 133), 0 (line → tabs), 0 (tabs → tablist line), 4 (line 158 → button 163), 4 (button 186 → header 191), 0 (header 214 → row 215). Ink gaps: 13, 10, 11, 22. Main header padding 8 top, 4 bottom. | `main.css:28` `padding: var(--nuiget-space-4) var(--nuiget-inset) var(--nuiget-space-2)` (8/16/4); `main.css:111` `padding: var(--nuiget-space-2) var(--nuiget-inset)`; `main.css:192`; `primitives.css:454`; `primitives.css:247`. Five different spacing sources set the vertical rhythm, and none of them is a stack gap. | DS-GRID-2(a), DS-INSET-2, DS-GRID-1 |

Every V-finding maps to at least one measurable rule. The residual "looks squeezed" part of V1 is judge-only.

## 3. Edge alignment across containers

### 3.1 Left edges (x; the list column's inset target is 348 + 16 = 364)

| Element | Box x | Ink x | Source | Verdict vs DS-INSET-1 / DS-ROW-2 |
|---|---|---|---|---|
| Main title "Manage NuGet packages" | – | 365 | `main.css:28` | ✓ (1 px side bearing) |
| Main search box | 364 | placeholder 371 | `main.css:111,125` | ✓ |
| Tab label "Installed" | tab 355 | 365 | `main.css:164-166` (7 px) + `primitives.css:804,806` (8 + 1) | ✓, but only through an off-ramp 7 px correction (DS-GRID-1) |
| Toolbar "Select all" | 364 | label 377 | `main.css:192` | ✓ |
| Section chevron / title | toggle 348 + 16 | chevron 366, title 384 | `main.css:168-170`; `primitives.css:471,474` | ✓ chevron |
| Row check box | 364 | – | `primitives.css:128-137,247` | ✓ |
| Row icon (Installed, Updates) | 390 | – | gap 12 (`primitives.css:246`) | – |
| Row name (Installed, Updates) | – | 434 | – | – |
| Row icon / name (**transitive**) | 364 | name 408 | no check column: `Row.tsx:135` renders the check only when `checkable` | ✗ Δ26 against direct rows **in the same scroller** (DS-ROW-2) |
| Row icon / name (**Browse**) | 364 (glyph ink 366) | name 408 | same cause | ✗ Δ26 against Installed rows in the same pane, across a mode switch |
| Details title | – | 695 | `main.css:273` | ✓ (inset 16 from 678 plus bearing) |
| Details labels "Installed:" / "Version:" | – | 695 | `main.css:273` | ✓ |
| **Details tab label "Details"** | tab 678 | **688** | `primitives.css:804,806` with no inset correction: the `main.css:164-166` rule is scoped to `.nuiget-main-list` | ✗ 7 px left of the title and labels (DS-INSET-1) |
| Details description / fact labels | – | 693–695 | `main.css:316-320` | ✓ |
| Details fact values | – | 793–795, but **801** for "Date published" | `main.css:332-340`: flex rows with `dt { min-width: 7em }` (91 px) | ✗ ragged value column: the 98 px "Date published" label pushes its value 8 px right |
| Sidebar search box | 56 | placeholder 63 | `sidebar.css:27` (`0 8px`) | – |
| Sidebar section chevron / title | – | 54 / **72** | `primitives.css:471` (gap 4), `:474` (padding 4) | ✗ +4 px against the native pane header title at **68** (chevron box margin 2, `paneview.css:51-53`) |
| Sidebar row name | – | 72 | `sidebar.css:118-120` (4 + 16 + 4) | aligned with its own title (intended), +4 against native |
| Native Explorer row label | icon 60 | 79 | workbench | reference |

### 3.2 Right edges (end insets)

| Element | Right x | End inset | Expected | Rule |
|---|---|---|---|---|
| Main search box | 1263 | 16 | 16 | ✓ |
| Bulk toolbar primary button | 667 | **6** | 16 | DS-INSET-2/3 ✗ |
| Comfortable row highlight (option) | **649** | 24 (actions column 650–673 unhighlighted) | 0 (whole row) | DS-ROW-3 ✗ |
| Provisional / TFM badge | **673** | **0** | 16 | DS-INSET-3 ✗ (V3) |
| Sidebar row highlight | 322 | 25 (actions 323–347) | 0 | DS-ROW-3 ✗ |
| Sidebar search box | 339 | 8 | ≥ 12 | DS-INSET-3 ✗ (the native Extensions header is `5px 12px 6px 20px`, `extensionsViewlet.css:25-29`) |
| Sidebar "Update all" icon | glyph ink 331–340, box ≈ 323–347 | 0 | ≥ 12 | DS-INSET-3 ✗ |

### 3.3 Cross-column alignment

- The list's tab strip is at y 134–157 and the details tab strip at y 231–254. These are two horizontal rules (158
  and 255) in adjacent columns at different heights. The workbench has no direct precedent; this is judge-only and
  not a finding.
- The row column moves when the tab changes: Installed rows start at y 215 (below DIRECT PACKAGES) and Updates rows
  of a single project at y 191 (no section header): `main-installed-single.png` versus `main-updates.png`. See X-2
  in section 13.

## 4. Tokens

| Group | Tokens (`tokens.css`) | Values | Use count (product files) | Verdict |
|---|---|---|---|---|
| Spacing | `--nuiget-space-1..6`, `-hairline`, `--nuiget-inset` (`:14-23`) | 2, 4, 6, 8, 12, 16, 1; inset = 16 | space-2 (4 px) 42, space-4 33, space-1 19, space-3 19, space-5 13, space-6 10, inset 10, hairline 3 | All on the workbench ramp; literals, not aliases of `--vscode-spacing-*` (DS-GRID-3, design-rules #2) |
| Radius | `-sm` 2, `-md` 4 (`:26-27`) | – | sm 13, md 5 | Buttons use sm (2 px); the current workbench text button uses 4 px (`button.css:11`) and 1.85 used 2 |
| Rows | `-compact` 24, `-comfortable` 78 (`:30,33`) | – | 3, 2 | 24 vs native 22 (DS-HEIGHT-2); 78 vs 72 (DS-HEIGHT-3); **actual pitch 79**: see density |
| Icons / target | `-sm` 12, `-md` 16, **`-lg` 24 (unused)**, `-xl` 32, `--nuiget-target-min` 24 (`:36-40`) | – | target-min **22** | target-min is also the drawn height of every control (V1 root) |
| Tree indent | 8 (`:43`) | – | 2 | – |
| Scrollbar | 10 (`:46`) | – | 2 | **Ineffective on Chromium ≥ 121** (section 6.5) |
| Z | `-sticky` 1, `-popover` 10, `-dialog` 20, `-toast` 30 (`:49-52`) | – | **sticky 0, toast 0** | Two unused |
| Motion | fast 100 ms, normal 200 ms, ease-out (`:55-57`) | – | 3 / 4 / 5 | DS-MOTION-1 (normal 200 > 150) |
| Type | sm 0.85em, md 1em, lg 1.15em, line-height 1.4 (`:60-63`) | – | sm 12, md 5, lg 2 | em-relative sizes compound (section 7) |
| Colour | 56 aliases of `--vscode-*` (`:69-150`), one `color-mix()` scrim (`:90`) | no literals | – | 13 workbench roles missing (design-rules §5); the scrim lightens (section 6.4) |

- **Unused tokens:** `--nuiget-icon-size-lg`, `--nuiget-z-sticky` and `--nuiget-z-toast` are referenced by no product
  file (`tokens-usage.mjs`). The token-name lint requires them to exist (`src/test/lint/webview-tokens.test.ts:30-31`),
  so they are dead weight that a lint keeps alive.
- **Off-ramp spacing (lexical, after resolving tokens):** 148 declarations, 5 hits outside the ramp.
  - `main.css:165`: 7 px. This is the tablist correction `calc(inset - space-4 - hairline)`.
  - `search.css:16`: 48 px (`2 × target-min`), larger than the ramp's 40.
  - Exempt: `primitives.css:12` (−1, visually hidden) and the README at `main.css:438,446`.

  The css-audit agrees that spacing is clean lexically. V5 is not caused by off-ramp values. It comes from too many
  different values and from asymmetric pairs (8/4, 16/6, 16/0).

## 5. Controls

| Control | Rule | Measured | Workbench (DS) | Verdict |
|---|---|---|---|---|
| Project and source selects | `main.css:31-41` | 24 px (y 73–96); border #3c3c3c, fill #313131 (dropdown tokens ✓) | 26 (DS-HEIGHT-7) | ✗ height |
| Main search input | `main.css:121-131` | 24 px (105–128) | 26 | ✗ |
| Sidebar search input | `sidebar.css:30-40` | 24 px (69–92); x 56–339 | 28 (`extensionsViewlet.css:36`) | ✗ |
| Details version select | `main.css:31-41` | 24 px (199–222) | 26 | ✗ |
| Text buttons | `primitives.css:507-516` | 24 px; radius 2; font 13 px; padding 0 12 | 26 cur (padding 4/8, 12 px, radius 4; `button.css:6-20`) / 28 at 1.85 | ✗ (V1) |
| Secondary button | `primitives.css:522-526` | Dark Modern: transparent fill and a #2f2f2f border, i.e. an outline button at 1.33:1. `button.secondaryBackground` is `#00000000` and `button.border` is `#ffffff1a` in `dark_modern.json:16,19`. Hover = rest, although Dark Modern defines `button.secondaryHoverBackground` #2B2B2B (`:21`). | hover state (DS-COLOR-7) | ✗ no hover feedback at all in Dark Modern |
| **Disabled primary** | `primitives.css:529-534` | Drawn as a secondary button with muted text. Light: "Uninstall selected (0)" fill #e5e5e5 / border #cdcdcd is pixel-identical to the enabled "Select all" (y 166 scans). Dark: both transparent with #2f2f2f borders; only the label differs (#9d9d9d vs #cccccc). | `.monaco-button.disabled { opacity: 0.4 }` (`button.css:40-43`) | ✗ shape no longer says "primary, unavailable". The tree's no-opacity choice is a contrast decision (comment `:528`), so the owner must decide. |
| Header check boxes | `main.css:54-68` | 16×16 (605–620 × 77–92), checkbox tokens (border #3c3c3c, fill #313131) | 18×18 radius 3 (DS-HEIGHT-9) | ✗ size |
| **Row check mark** | `primitives.css:128-137` | 14×14 (364–377), **border `--nuiget-color-border` (#313131), no fill**. Contrast: 1.36:1 on the list (#181818), **1.09:1 on the selected row** (#04395e), 1.19:1 on Light Modern (#e5e5e5 on #f8f8f8) | one check box, checkbox tokens (DS-HEIGHT-9, DS-COLOR-1) | ✗ second design, close to invisible |
| Icon buttons | `primitives.css:367-390` | 24×24, `descriptionForeground` at rest, colour change only on hover | 22 px hover box, `toolbar.hoverBackground` (DS-HEIGHT-8, DS-COLOR-3) | ✗ (design-rules #12) |
| Tabs | `primitives.css:799-823` | 24 px; 2 px underline in `focusBorder`; label 13 px | Settings scope tab ≈ 33 px, 1 px `panelTitle.activeBorder` (DS-HEIGHT-4, DS-COLOR-4) | ✗ |
| Details/README tabs | same primitive | 24 px + line (231–255); labels 13 px mixed case | Extensions editor navbar: 36 px, labels 11 px uppercase in `panelTitle.*` (`extensionEditor.css:372-401`) | ✗ (DS-HEIGHT-5) |
| Count badges | `primitives.css:398-410` | 17×17 (tab, 423–439 × 137–153), radius ≈ 4 (corner anti-aliasing over 3–4 px); sidebar 17×16 | pill: min 18×18, radius 11 (`countBadge.css:6-17`) (DS-HEIGHT-10) | ✗ |

## 6. Theming

### 6.1 Dark Modern (default captures)

- Surfaces: editor #1f1f1f, list pane and sidebar #181818 (`sideBar.background`). Lines #313131 (`widget.border`).
  Selection #04395e. Hover #2a2d2e. Focus #0078d4. Badge #616161. All of these are the theme's values, which confirms
  the token aliases.
- **The divider grey is not the workbench's divider grey.** nUIget lines are `widget.border` #313131 (search-row line
  y 133, tablist 158, row lines, sash). The workbench lines beside them are #2b2b2b: the sidebar edge at x 347, the
  section-header border at y 97 and 834, and the editor tab-strip line at 64. This is two greys of "line" in one
  window. DS-DIVIDER-4 names the role; this is the measured consequence.

### 6.2 Light Modern (`main-installed-single-light.png`)

- The current row is #e8e8e8 (`list.activeSelectionBackground`, `light_modern.json:61`) with a 3 px #005fb8 accent.
  The focused row has a 1 px #005fb8 outline. Both are as designed.
- The row check mark is #e5e5e5 on #f8f8f8 (1.19:1, column x 370, y 247 / 260) and practically invisible.
- "Select all" and the disabled "Uninstall selected (0)" are both #e5e5e5 with #cdcdcd borders and cannot be told
  apart by shape (section 5).

### 6.3 High contrast (`main-installed-single-hc.png`, HC Black)

`tokens.css:153-159` pins three keys: border → `contrastBorder`, focus → `contrastActiveBorder`, shadow →
transparent.

| Element | Measured | Workbench | Verdict |
|---|---|---|---|
| Dividers | 1 px #6fc3df at y 133, 158, 293, 372 | `contrastBorder` lines | ✓ |
| **Sash** | **4 px #6fc3df bar** (x 674–677, and sidebar 486–489) | 1 px separator; sash transparent until hover | ✗ heaviest line in the window |
| **Tabs** | Every tab is boxed in #6fc3df (x 355/448 and 451/543 at y 137) plus a 2 px #f38518 underline on the selected tab (`primitives.css:806`, `:820-823`) | composite-bar tabs draw a `contrastActiveBorder` outline only when checked (solid) or hovered (dashed) (`paneCompositePart.css:362-371`); Settings-editor HC tab treatment **not verified** | ✗ (DS-COLOR-4, DS-FOCUS-4) |
| **Count badges** | No box: background #000 and no border. Scan y 145, x 418–446 shows only glyph pixels; the same for the sidebar badge (y 109) and `net8.0` (y 380). Cause: `.nuiget-badge { border: 1px solid transparent }` (`primitives.css:402`) | `badgeBorder: contrastBorder` (`defaultStyles.ts:141-144`), applied as `1px solid` (`countBadge.ts:79-80`) | ✗ a badge becomes a loose number |
| Current row | marked only by the 3 px #f38518 accent (x 348–350); no outline | 1 px dotted `contrastActiveBorder` on selection, dashed on hover (DS-FOCUS-4) | ✗ (design-rules covers) |
| Focused row | 1 px #f38518 outline (y 215 and 292) | `list.focusOutline` | ≈ |
| Row icon | 1 px contrast outline box (`primitives.css:258-266`). The Newtonsoft rocket (black glyph on transparent) is invisible inside it; only the box shows (390–421) | Extensions view draws the icon as-is | judge-only; the outline helps but cannot rescue a black glyph |
| Buttons, inputs | `button.border` / `input.border` visible | same keys | ✓ |

### 6.4 Scrim (`sidebar-update-all-dialog.png`)

- `--nuiget-color-scrim: color-mix(in srgb, var(--vscode-editor-background) 60%, transparent)` (`tokens.css:90`).
- In Dark Modern the editor background (#1f1f1f) is lighter than the side bar (#181818). Under the dialog the sidebar
  therefore **lightens** from #181818 to #1c1c1c (scan y 200, x 50–60).
- Over the main panel's editor-coloured areas the scrim would change nothing. This is derived; no main-panel dialog
  capture exists.
- The workbench dims with `rgba(0, 0, 0, 0.5)` (`dialog.css:19-20`, `.monaco-dialog-modal-block.dimmed`).

### 6.5 Scrollbars (all themes)

- VS Code's webview default stylesheet sets `html { scrollbar-color: var(--vscode-scrollbarSlider-background)
  var(--vscode-editor-background); }` inside `@layer vscode-default`. This is in both current main
  (`research/vscode-src/webview-pre-index.html:117-120`) and 1.85 (`r185/index.html:89`).
- MDN: "If an element's computed scrollbar-color and scrollbar-width values are anything other than auto, they will
  override ::-webkit-scrollbar-* styling. Because scrollbar-color is inherited, an element is affected when an
  ancestor sets it". The standard properties are supported from Chrome 121 (Chrome docs, "Scrollbar styling").
- **Measured on Chromium 150:**
  - The Browse list scrollbar is a 15 px classic bar: track x 659–673 in **#1f1f1f** (editor background) inside the
    #181818 list pane, thumb 662–670, with an up-arrow button (crop
    `visual-audit/crops/browse-scrollbar.png`).
  - The README scrollbar is the same: track 1265–1279, thumb 1268–1276.
- `primitives.css:25-44` (10 px, token colours, forced-colours reach) is therefore inert on every VS Code whose
  Chromium is 121 or later. On the 1.85 baseline (Chromium 114, which has no `scrollbar-color`) it applies.
- The comment at `primitives.css:20-24` ("Chromium 114 has no standard property for scrollbar colours (N64), hence
  these rules") is true only for the baseline.
- The CSS-baseline lint denies `scrollbar-color` (`src/test/lint/webview-css-baseline.test.ts:37`, entry
  `{ name: 'scrollbar-color', … chromium: 121 }`). Setting `scrollbar-color: auto` on the root, which would re-enable the WebKit
  rules on new Chromium and is ignored on 114, is therefore blocked by a lint today. That fix is a hypothesis to
  probe, not verified. The other branch is to style through the standard properties: `scrollbar-color` with the
  nUIget tokens for the thumb and a transparent track, keeping the WebKit rules for 114. That also needs the lint to
  admit the property. Neither branch is verified.

### 6.6 Forced colours and reduced motion (code only; no capture)

- `tokens.css:162-223` maps every role to system colours. The following are hypotheses from source, not rendered:
  - The badge has `forced-color-adjust: none` (`primitives.css:409`), a transparent border and `Canvas` fill, so it
    loses its box as in HC.
  - `--nuiget-color-list-hover-bg: Canvas` makes hover invisible.
  - `--nuiget-color-list-inactive-bg: Canvas` leaves only the check mark to show the bulk selection.
  - The scrollbar tokens are inert on new Chromium (section 6.5).
- Reduced motion follows `prefers-reduced-motion` only (`tokens.css:225-231`), not `body.vscode-reduce-motion`
  (DS-MOTION-2, design-rules #15).

## 7. Typography

Computed sizes at the 13 px base, from CSS and cross-checked against glyph heights in the captures:

| Element | Rule | Size (px) | Weight | Case | Check in capture |
|---|---|---|---|---|---|
| Body, row name, controls, tab label | `main.css:12-20`; inherit | 13 | 400 (row name 600, `primitives.css:271`) | – | name cap+desc ink 13 px |
| Main title | `main.css:95-100` | 13 | 600 | – | – |
| Version, meta, authors, row badges, tab badges | `primitives.css:159,217,226,406` | 11.05 | 400 (new version 600, `:212`) | – | tab badge digit 8 px tall |
| Section heading (list, sidebar) | `primitives.css:458-465`, `:480` | 11.05 | 600 | upper | ink 10 px |
| **Count badge in a section heading (sidebar Installed/Updates)** | `.nuiget-section-heading` 0.85em (`primitives.css:463`) wraps the Badge (`SectionHeader.tsx:51`), which sets 0.85em again (`:406`) | **9.39** | 400 | – | sidebar badge digit **7 px** vs 8 px in a tab badge (`sidebar-sections.png` x 148–153, y 106–112) |
| Count badge in a grouped project heading | `main.css:702-705`, `sidebar.css:123-126` (heading 1em) | 11.05 | 400 | – | digit 8 px (`main-installed-all.png`) |
| Details title | `main.css:276-280` (no `font-weight`) | 14.95 | **700 (UA `h2` bold)** | – | ink 14 px |
| **Transitive badge in the details title** | `TransitiveDetails.tsx:44-48`: 0.85 × 1.15em | **12.7** | **700** (inherited) | – | box 80×20, cap 9 px (`main-transitive-details.png` 759–838 × 143–162) |
| Details section h3 ("Dependencies", "Required by", "Vulnerabilities") | `main.css:346-349` (no weight) | 13 | **700 (UA `h3` bold)** | – | – |
| Dialog title | `primitives.css:731-737` | 14.95 | 600 | – | ink 14 px |
| Folder caption, quick-search group header | `main.css:690-696`, `sidebar.css:79-85`, `search.css:62-68` | 11.05 | 600 | upper | – |
| Popup "‹ Serilog" header | `search.css:51-59` | 13 | 600 | – | – |
| README | `main.css:387-452` | 20.8 / 18.2 / 15.6 / 13.65 / 13; code 11.05 | 600 | – | exempt (DS-TYPE-2) |

- Non-README sizes in use: **9.39, 11.05, 12.7, 13, 14.95**. Three of them are off the ramp {10, 11, 12, 13, 18, 26}:
  9.39 (below Label3), 12.7 and 14.95. DS-TYPE-2 catches all three in a computed-style probe. A lint on the source
  cannot, because the cause is em-compounding through nesting.
- Weights 400, 600 and **700**. The 700 comes from the UA heading defaults, not from any rule (DS-TYPE-3).
- Line height 1.4 everywhere outside the README (DS-TYPE-4 ✓). A badge's line box is 15.47 px plus 2 px of border,
  giving the measured 17 px.
- Case: section and pane titles are uppercase (`primitives.css:480`). Grouped project headers and dependency groups
  use normal case (`main.css:707-709`, `:358-360`). The 1.18.9 references used normal case for "Direct packages (10)"
  (`installed-single-transitive-headers.jpg`) (DS-TYPE-5, design-rules #19).

## 8. Iconography

| Item | Source | Measured | Rule | Verdict |
|---|---|---|---|---|
| Glyph set | `icons.tsx`: 24 codicons + 2 custom (design-rules); JSX uses in product files: Trash 13, Sync 4, ArrowUp 4, Warning 3, Verified 3, Plus 3, Loading 2, Close 2, Gear 1, Filter 1, ChevronRight 1, Check 1 | – | DS-ICON-1 | pre-redraw paths (design-rules #13) |
| Sizes | default 16 (`icons.tsx:24`); **Verified 14** (`:151`); row check mark 12 (`Row.tsx:135`); package icon 32 (`tokens.css:39`) | Verified ink 12×10 at x 435 (name at 434), authors text at 452 | DS-ICON-2, DS-ICON-4 | Verified is the `check` glyph in `textLink` (`primitives.css:231-234`), not `verified-filled` in `extensionIcon.verifiedForeground` |
| **Quick-search expand and back marks** | text "›" (`SearchBox.tsx:272`) and "‹ id" (`:341`) | small text glyphs (`main-quicksearch-open.png` x ≈ 1253; `main-quicksearch-versions.png` x ≈ 371) | DS-ICON-1 | ✗ not codicons (chevron-right/left exist) |
| Version arrow | text " → " inside the version span (`Row.tsx:147`) | ink 9 px wide at 11.05 px, muted; new version 600 in `--nuiget-color-version-new` | – | matches 1.x; deliberately text for axe (gotcha table) ✓ |
| Section chevron | chevron-right rotated 90° (`primitives.css:495-497`) | expanded ink 11×6 (x 54–64 sidebar, 366–376 main) vs native chevron-down 12 px at 52–63 | DS-ICON-1 | ≈ (old path) |
| Icon colour | icon buttons rest in `descriptionForeground` (`primitives.css:377`) | gear and refresh ink #c5c5c5-ish | DS-ICON-2 (`icon.foreground`) | ✗ (design-rules #12) |
| Package icon | 32 px with radius 4 and an HC outline (`primitives.css:250-266`) | 390–421 | DS-ROW-1, DS-ICON-3 (36/42 px, breakpoints) | ✗ size (D15 history) |

## 9. Motion

| Animation | Rule | Duration | Workbench (DS-MOTION-1) |
|---|---|---|---|
| Icon button / tab colour | `primitives.css:379`, `:812` | 100 ms ease-out | 100–150 ✓ |
| Section chevron rotate | `:492` | 100 ms | ✓ |
| Progress bar width | `:597` | 200 ms | ✗ > 150 |
| Spinner | `:440` | 5 × 200 = 1 s linear | 1.5 s steps(30) ✗ |
| Indeterminate progress | `:605` | 8 × 200 = 1.6 s | 4 s ✗ |
| Skeleton breathe | `:565` | 6 × 200 = 1.2 s alternate | no workbench analogue (skeletons are not a workbench pattern; DS-STATE-2) |
| Sash hover | `:688-691` | instant, `focusBorder` | 300 ms delay, then `sash.hoverBorder` with a 0.1 s fade (`sash.css:114-121`, `sash.ts:154`) ✗ |

Every duration derives from two tokens. That is good for reduced motion, but it ties loop speeds to the UI transition
token: changing `--nuiget-duration-normal` to 150 ms would also shorten the spinner to 750 ms.

## 10. Density and rows

| Surface | Rule | Measured | Native | Verdict |
|---|---|---|---|---|
| Comfortable row | `tokens.css:33` (78 min) + `primitives.css:238-248` (border-box, 1 px bottom border, padding 12/16) | **Pitch 79 px** in five captures: highlight 215–292 + line 293 (installed-single), 191–268 + 269 (updates), 134–211 + 212 (browse), 318–395 + 396 (transitive), 294–371 + 372 (all). The option takes `min-height: inherit` = 78 (`primitives.css:96`), and the row's 1 px border is added below it. | Extensions 72, no divider | ✗ 79, not 78 or 72. Any rule implementation must count the border. |
| Comfortable anatomy | `primitives.css:244-272` | check 14 @364 → gap 12 → icon 32 @390 → gap 12 → name @434. Text ink lines 309–321 / 330–337 / 346–356, with 8 px between lines. 15 px from the row top to the name ink and 15 px from the authors ink to the line. | Extensions: 16 px start, icon 42/36, gap 14/16 (DS-ROW-1) | ✗ (D15 history) |
| Browse row | same + description (`Row.tsx:151-156`) | name ellipsis at ≈ 628; "Installed" badge after the name; version · downloads · Verified authors on line 2; description on line 3 | – | ✓ content; DS-ROW-2 ✗ (x 408) |
| Compact row (sidebar) | `tokens.css:30`, `primitives.css:82-84,291-334` | 24 px (122–145, 146–169); name 13/400 at x 72; version 11.05 | Explorer row pitch 22 (ink tops 92/114/136/158) | ✗ (DS-HEIGHT-2) |
| Sidebar section header | `primitives.css:451-455`, `sidebar.css:102-106` | 1 px border at 97 + 98–121 = 25 px | pane header 22 (834 + 835–855) | ✗ (DS-HEIGHT-1) |
| Narrow sidebar (200 px) | `primitives.css:303-322` | "Newtonsoft.J…" name ellipsis with "13.0…" version; text ends at 212, actions column 223–246 | name truncates last (DS-ROW-5) | ✓ |

## 11. Selection, hover and focus

Measured treatment:

- **Current row:** `list.activeSelectionBackground` (#04395e) over x 348–649 plus a 3 px `focusBorder` accent at
  348–350. The actions column 650–673 stays the list colour. In the sidebar the highlight is 48–322 and the actions
  column 323–347.
- **Hover:** `list.hoverBackground` #2a2d2e (`main-transitive-expanded.png` y 318–395; sidebar y 146–169).
- **Focus ring:** 1 px #0078d4 inset on the option (sidebar y 122 and 145; light 215 and 292).
- **Bulk-selected rows** (multi-select) use `list.inactiveSelectionBackground` (`primitives.css:117-120`).
- **Check mark on a selected row:** #313131 on #04395e (1.09:1). The check box disappears on exactly the row the user
  is looking at.

Already reported elsewhere and only cited here:

- Hover beats selection in single-select lists, and selection never drops to inactive (css-audit §6.4,
  design-rules #11, DS-COLOR-2).
- The accent and the tab underline use `focusBorder` (DS-COLOR-5).
- The ring uses `focusBorder` rather than `list.focusOutline` (DS-FOCUS-2). In Dark Modern both are #0078d4, so no
  pixel difference shows.
- The highlight stops before the actions (DS-ROW-3).

## 12. Empty, loading and error states

| Area | In code (call sites) | Captured | Visual rule (DS-STATE) |
|---|---|---|---|
| Details empty | `MainShell.tsx:301`, `DetailsPane.tsx:88` "Select a package to see its details." | ✓ `main-installed-all.png`: text centred (ink 866–1091 = centre of 678–1279) at y 153–165, padding 16 (`primitives.css:538-546`) | DS-STATE-3: left-aligned, 20 px ✗ |
| Browse "Press Enter to search for …" | `BrowseList.tsx:90` | covered by the open popup in `main-quicksearch-open.png` (the list pane looks blank under it) | – |
| Lists empty / error / loading | 23 `EmptyState`, 38 `Banner`, 18 `Skeleton`, 4 `ProgressBar` JSX occurrences in non-test files under `src/webview` (`grep -rn "<Name\b"`, the defining file excluded) | none | DS-STATE-1/2/3/4 not measurable from captures |
| README images | `ReadmeView.tsx` | `main-details-readme.png` shows alt text ("Logo Json.NET", "NuGet version (Newtonsoft.Json)", "Build status") as link-coloured broken images, while `main-installed-single.png` shows the same README with images loaded | Hypothesis: the images had not loaded or were blocked when captured; not verified. No placeholder style. |
| Toasts | host (`src/host/feedback.ts`) | three stacked success toasts in `sidebar-sections.png` | DS-STATE-5 (design-rules #16) |

## 13. Dividers, borders and layers

| Line | Rule | Width / colour | Workbench | Verdict |
|---|---|---|---|---|
| Header/body line under the search row | `main.css:112` | 1 px `widget.border` across the whole panel (y 133) | `settings.headerBorder` / `panelSection.border` (DS-DIVIDER-4) | role ✗, grey differs (section 6.1) |
| Tablist line | `primitives.css:796` | 1 px (158; details 255) | navbar `panelSection.border` | role ✗ |
| Tab selected underline | `primitives.css:807,821` | **2 px** `focusBorder` | 1 px `panelTitle.activeBorder` (`extensionEditor.css:398-401`) | ✗ |
| Row divider | `primitives.css:240` | 1 px under every comfortable row | none between rows (DS-DIVIDER-1) | ✗ (D15 history) |
| **Sash (list/details, sidebar sections)** | `primitives.css:658-691`; `sidebar.css:113-115` hides the next header's top line | **4 px always painted** in `--nuiget-color-border` (674–677, 486–489); hover and focus paint `focusBorder` | 1 px `separator-border` (`splitview.css:52-65`) plus a transparent 4 px sash that paints `sash.hoverBorder` after 300 ms (`sash.css:105-125`, `sash.ts:154,634`) | ✗ heavier than any workbench line; `focusBorder` used for hover (DS-COLOR-5) |
| Sidebar section header top line | `sidebar.css:103` | 1 px `sideBarSectionHeader.border` (#2b2b2b at y 97) | same key (OUTLINE header 834) | ✓ |
| Banner accent | `primitives.css:625` | 2 px start border | Extensions message container: icon + text | – |
| Dialog | `primitives.css:699-723` | 1 px border, radius 4, padding 12/16, `0 0 8px` shadow, scrim (section 6.4) | `.monaco-dialog-box`: min-width 480, padding 8, radius `cornerRadius-xLarge`, `shadow-xl`, dim black 50% (`dialog.css:19-35`, current main) | ✗ scrim; size not comparable in a 300 px sidebar |
| Popup | `search.css:33-48` | 1 px border, radius 2, shadow `0 2px 8px` (literal px) | quick input `shadow-xl` | ≈ |

Sidebar dialog geometry (`sidebar-update-all-dialog.png`):

- Box x 64–331, y 412–530, background #202020 (`editorWidget.background`), border #313131.
- Title ink 428–441 at x 82, 14.95 px / 600.
- Buttons y 494–517 (24 px); "Update" ends 16 px inside the box.
- The dialog covers the UPDATES section header (y ≈ 490–513), including the "Update all" button that opened it.

## 14. Comparison with 1.18.9 (information architecture and look; references are JPEGs, not measured)

| Aspect | 1.18.9 (reference file) | 2.0 (capture) | Note |
|---|---|---|---|
| Section headers | "Direct packages (10)", normal case, count in muted text (`installed-single-transitive-headers.jpg`) | "DIRECT PACKAGES (2)", uppercase, bold 11 px | DS-TYPE-5 favours normal case for in-list group headers |
| Bulk toolbar | three icon buttons (check-all, collapse, expand) + red "Uninstall Selected (0)" | text "Select all" + "Uninstall selected (0)" | 2.0 lost collapse/expand-all; design-rules §7 suggests icon button for Select all at narrow widths |
| TFM badge | blue pill with an end inset (`installed-single-transitive-headers.jpg`) | gray rounded rectangle flush to the edge (V3) | – |
| Count badges | blue pills (custom colour) | `badge.background` gray, radius 4 | 2.0 follows the theme key; shape still not the pill |
| Transitive rows | smaller icon, two lines, denser (`transitive-details.jpg`) | full 79 px comfortable rows, shifted 26 px left | DS-ROW-2 |
| Details header | title left; Installed/Version selects and buttons right-aligned in a column (`installed-all-projects.jpg`) | stacked grid under the title (`main.css:287-292`) | – |
| Details facts | uppercase labels with colons ("DESCRIPTION:") | sentence-case labels, no colon in facts but colons in the header ("Installed:", "Version:") and in transitive details | DS-COPY-2 (design-rules #18) |
| Browse rows | no description line (`browse-results.jpg`) | description as the third line (D14) | – |
| Quick search | per-source uppercase group headers (`quick-search-grouped.jpg`) | same in code (`search.css:62-68`); the capture has one source, so it is not shown | DS-DIVIDER-3 |

## 15. Findings

Ids are assigned later. Letters: V = visual, X = interaction / IA. "DR" = design-rules report; findings already
carried there are cited, not repeated, unless I add a measurement or a cause.

| # | L | Sev | Area | Finding | Evidence | Rule violated | Decision-relevant | Conf. |
|---|---|---|---|---|---|---|---|---|
| 1 | V | low | V1 | Tab strip and toolbar buttons are 24 px because `--nuiget-target-min` is their `min-height` with no vertical padding; 4 px between groups | §2 V1 | DS-HEIGHT-4, DS-HEIGHT-6, DS-GRID-2 | yes | high |
| 2 | V | low | V2 | Toolbar end inset 6 vs start 16; primary ends at 667 vs row highlight 649 vs pane 673 | `main.css:192-194`; §2 V2 | DS-INSET-2, DS-INSET-3, DS-ROW-3 | no | high |
| 3 | V | low | V3 | Header badges sit in `.nuiget-section-actions` with no end inset; badge right edge = 673 = pane edge | `primitives.css:451-455,499-503`; §2 V3 | DS-INSET-3, DS-OVERFLOW-2 | no | high |
| 4 | V | low | V4 | 11 px above vs 22 px below a section title: header half-leading + 4 px toolbar padding above; header half-leading + 12 px row padding + line half-leading below | `primitives.css:247,454`; `main.css:192`; §2 V4 | DS-GRID-2(b) | no | high |
| 5 | V | low | V5 | Eight block gaps in {0, 4, 8}, ink gaps {10, 11, 13, 22}, set by five unrelated paddings; header 8/4 | §2 V5 | DS-GRID-2(a), DS-INSET-2 | no | high |
| 6 | V | medium | tokens / controls | `--nuiget-target-min` (24 px, a pointer-target minimum) is the drawn height of 22 controls (buttons, inputs, selects, tabs, search options, icon buttons) and `--nuiget-row-height-compact` (24) of section headers. One token couples an a11y floor to the visual height, the root of V1 and of DS-HEIGHT-1/2/6/7. | `tokens.css:30,40`; `tokens-usage.mjs` count 22; `primitives.css:454,473,508,803`; `main.css:34,124`; `sidebar.css:33` | DS-HEIGHT-1/2/6/7 | yes | high |
| 7 | V | medium | theming / scrollbars | On Chromium ≥ 121 VS Code's inherited `html { scrollbar-color }` overrides `::-webkit-scrollbar`; nUIget scrollbars are 15 px classic bars with arrows and an editor-background track inside the side-bar-coloured list pane; `primitives.css:25-44` and the scrollbar tokens are inert; the CSS-baseline lint forbids `scrollbar-color`, so it blocks the fix | `webview-pre-index.html:117-120`; `r185/index.html:89`; MDN; `main-browse-results.png` track 659–673 #1f1f1f, thumb 662–670, arrow; README track 1265–1279; lint `webview-css-baseline.test.ts:37` | new: proposed DS-SCROLL-1 | yes | high |
| 8 | V | medium | dividers | Sash is a 4 px bar painted at rest in the border colour, hover in `focusBorder` at once; workbench: 1 px separator + transparent sash, `sash.hoverBorder` after 300 ms; in HC a 4 px cyan bar | `primitives.css:658-691`; `splitview.css:52-65`; `sash.css:105-125`; `sash.ts:154`; captures x 674–677, y 486–489 | DS-COLOR-5; new: proposed DS-DIVIDER-5 | yes | high |
| 9 | V | medium | typography | em-compounding: a count badge inside a section heading renders at 9.39 px (sidebar Installed/Updates), below the ramp's 10 px; the Transitive badge inside the details title at 12.7 px bold; badge text comes in three sizes | `primitives.css:406,463`; `SectionHeader.tsx:51`; `TransitiveDetails.tsx:44-48`; digit 7 px vs 8 px; badge 80×20 | DS-TYPE-2, DS-HEIGHT-10 | yes | high |
| 10 | V | medium | controls / theming | Row check mark is a second check-box design (14 px, divider-colour border, no fill) beside 16 px themed check boxes; contrast 1.36:1 (list), 1.09:1 (selected row), 1.19:1 (Light Modern) | `primitives.css:128-137` vs `main.css:54-68`; scans x 370 | DS-HEIGHT-9, DS-COLOR-1 | yes | high |
| 11 | V | medium | theming (HC) | Count badges have no box in high contrast: border `transparent`; workbench count badge border = `contrastBorder` | `primitives.css:402`; `defaultStyles.ts:141-144`; `countBadge.ts:79-80`; HC scans y 145, 109, 380 | DS-COLOR-1, DS-HEIGHT-10; new: proposed DS-HC-1 | no | high |
| 12 | V | low | theming (HC) | Every tab is boxed in `contrastBorder` in HC and the selection is a 2 px underline; workbench composite tabs outline only the checked (solid) or hovered (dashed) tab | `primitives.css:806,820-823`; HC scan y 137; `paneCompositePart.css:362-371` | DS-COLOR-4, DS-FOCUS-4 | no | medium (Settings-editor HC tabs not read) |
| 13 | V | medium | layers | The dialog scrim is the editor background at 60 %; in Dark Modern it lightens the sidebar (#181818 → #1c1c1c) and does nothing over editor-coloured areas; workbench dims with black 50 % | `tokens.css:90`; `sidebar-update-all-dialog.png` y 200; `dialog.css:19-20` | new: proposed DS-COLOR-8 | yes | high (sidebar), medium (main panel: derived) |
| 14 | V | low | alignment | Details tab labels start at x 688, 7 px left of the details title and labels (695): the tablist inset correction is scoped to `.nuiget-main-list` | `main.css:164-166`; `primitives.css:804,806`; `main-browse-details.png` | DS-INSET-1 | no | high |
| 15 | V | low | alignment | Browse rows (no check column) put icon and name 26 px left of Installed rows in the same pane (364/408 vs 390/434), the same cause as the transitive offset | `Row.tsx:135`; `main-browse-results.png`, `main-installed-single.png` | DS-ROW-2 | no | high |
| 16 | V | low | alignment | Details facts value column is ragged: `dt { min-width: 7em }` in flex rows; "Date published" (98 px) pushes its value to 801 vs 793–795 | `main.css:332-340`; `main-browse-details.png` y 408–422 | new: proposed DS-ALIGN-1 | no | high |
| 17 | V | low | alignment (sidebar) | Sidebar section title and row names start at x 72 vs the native pane-header title at 68: toggle padding 4 + gap 4 where the workbench uses a 2 px icon margin | `primitives.css:471,474`; `sidebar.css:119`; `paneview.css:51-53`; captures | DS-INSET-1 | no | high |
| 18 | V | low | typography | Details title (h2) and details section headings (h3) set no `font-weight` and render at the UA default 700 while every other title is 600 | `main.css:276-280,346-349`; `DetailsPane.tsx:161`; `DetailsInfo.tsx:155,168` | DS-TYPE-3 | no | high (source); medium (render) |
| 19 | V | low | controls | A disabled primary button is restyled as a secondary one with muted text; with Dark Modern's transparent secondary, "Select all" (enabled) and "Uninstall selected (0)" (disabled) differ only in label colour; Light: identical fill and border; the secondary has no hover although Dark Modern defines `button.secondaryHoverBackground` #2B2B2B | `primitives.css:522-534`; `dark_modern.json:16,19,21`; scans y 166 | DS-COLOR-6, DS-COLOR-7 | yes (no-opacity is a contrast choice: owner) | high |
| 20 | V | low | iconography | Quick-search popup uses text glyphs "›" and "‹" for expand and back, not codicons; `VerifiedIcon` defaults to 14 px while every other icon is 16 | `SearchBox.tsx:272,341`; `icons.tsx:151` | DS-ICON-1, DS-ICON-2 | no | high |
| 21 | V | low | theming | nUIget lines use `widget.border` (#313131 in Dark Modern) beside workbench lines in #2b2b2b (sidebar edge x 347, section header y 97, tab strip y 64): two greys of divider in one window | `tokens.css:81`; scans | DS-DIVIDER-4 | no | high |
| 22 | V | low | density | Comfortable rows measure 79 px, not the 78 px token: the option's `min-height: inherit` takes 78 and the row's 1 px bottom border is added below | `primitives.css:96,238-241`; five captures | DS-HEIGHT-3 (implementations must count the border) | yes (what to measure) | high |
| 23 | V | low | tokens | Three tokens unused by any product file and kept alive by the token-name lint: `--nuiget-icon-size-lg`, `--nuiget-z-sticky`, `--nuiget-z-toast`; two lexical off-ramp values: 7 px tablist correction, 48 px search padding | `tokens.css:38,49,52`; `webview-tokens.test.ts:30-31`; `main.css:165`; `search.css:16` | DS-GRID-1 | no | high |
| 24 | X | medium | sidebar confirmations | Two confirmation styles on one surface: Update all opens an in-webview `ConfirmDialog` (dims only the sidebar, wrongly; covers its own header), a central update opens a VS Code modal; interaction model §1 documents "confirmed in-panel" | `UpdatesSection.tsx:238-257`; `SidebarHost.ts:261-263`; `sidebar-update-all-dialog.png`; `docs/ux/interaction-model.md:12` | owner direction (workbench exemplar wins) | yes | high |
| 25 | X | low | IA / layout | Switching between Installed and Updates (one project) moves the first row from y 215 to y 191: Installed has a DIRECT PACKAGES header, single-project Updates has none | `main-installed-single.png`, `main-updates.png`; `UpdatesTab.tsx` (no `SectionHeader`) | DS-ROW-2 (spirit), DS-COPY-5 | no | high |

Findings already carried by design-rules §9 that this audit re-measured or confirmed:

| DR item | What I add |
|---|---|
| #3 (78 vs 72) | Actual pitch 79 (finding 22) |
| #9 (transitive offset) | Browse has the same offset (finding 15) |
| #10 (actions outside the highlight) | Measured 650–673 and 323–347 |
| #11 (selection ignores focus) | No addition |
| #12 (icon buttons, secondary hover) | Measured in Dark Modern (finding 19) |
| #14 (badge and check-box sizes) | Contrast numbers (finding 10) |
| #15 (motion) | No addition |
| #19 (14.95 px) | Plus 9.39 and 12.7 (finding 9) and the UA 700 weight (finding 18) |
| #20 (centred empty states) | Measured centre |
| #23 (Verified mark) | No addition |
| #24 (row divider) | No addition |
| #25 (popup captions) | No addition |
| #27 (24/25 px compact rows and headers) | Re-measured 24 and 25 |

## 16. Rules this audit suggests adding (for the rules owner)

| Proposed id | Rule | Measurement | Catches |
|---|---|---|---|
| DS-SCROLL-1 | Scrollbars look like the workbench's on both Chromium generations: 10 px, thumb in `scrollbarSlider.*`, track transparent over the surface it scrolls | Probe: `el.offsetWidth − el.clientWidth` = 10 for a scrolling list at the current host; computed `scrollbar-color` on the root is `auto`, or the track is transparent; the lint admits that one declaration | finding 7 |
| DS-DIVIDER-5 | A split between panes is a 1 px separator in the workbench's separator role; the sash is transparent until hovered (≥ 300 ms) or dragged, then `sash.hoverBorder` | Computed background of `.nuiget-sash` at rest = transparent; separator width 1 px | finding 8 |
| DS-HC-1 | In HC, every element whose boundary is a colour difference (count badge, tab, selected row) gets the workbench's HC line: badge 1 px `contrastBorder`; active tab solid and hovered tab dashed `contrastActiveBorder`; selection dotted | HC capture probes: badge border width 1 px and colour = `--vscode-contrastBorder`; inactive tab has no border | findings 11, 12 |
| DS-COLOR-8 | A modal backdrop dims: black at 50 % (workbench `.monaco-dialog-modal-block.dimmed`), or another token whose luminance is below the surface it covers | Composite colour under the scrim < underlying surface luminance in every theme kind | finding 13 |
| DS-ALIGN-1 | Label–value pairs share one value column | max − min of the value lefts in a facts block = 0 | finding 16 |
| DS-TYPE-8 | No em font size on an element whose ancestor below the root already sets a relative size (or: badge size is absolute, `rem` or a px token) | Lint plus DS-TYPE-2's computed probe | finding 9 |
| DS-TYPE-9 | Every heading outside the README sets its weight explicitly | Computed `font-weight` of `h1`–`h4` outside `.nuiget-readme` ∈ {400, 600} | finding 18 |

## 17. Not reachable, and gaps

Not reachable or not opened:

- No DOM, computed-style or rect probe (the browser pane is reserved; VS Code is not installed). Every DOM-based rule
  measurement is approximated from source plus pixels.
- The Chrome "Scrollbar styling" page does not itself state the precedence in the text I extracted. The precedence
  quote is from MDN.
- The workbench's Settings-editor HC tab treatment and the Modern UI tab and navbar modules (`modernUI/tabs.css`)
  were not read line by line.

Gaps:

- No Modern UI capture. The 1.140.0 run rendered the classic look (design-rules §1), so every comparison here is
  against the classic chrome.
- No main-panel dialog capture: the scrim over the editor surface, the dialog size and the bulk dialogs are
  unmeasured.
- No loading, empty, error, unsupported or narrow-main capture. Narrow-main overflow (details action grid at
  `main.css:287-292`) remains design-rules' hypothesis.
- No forced-colours render. Section 6.6 is from source only.
- Light Modern was checked against `light_modern.json` on `main@54d565d`, not the 1.140.0 theme. The values seen in
  pixels match that file (e.g. `list.activeSelectionBackground` #E8E8E8).
- Hover and focus states were measured only where a capture happened to show them (transitive hover, the sidebar
  focus ring, light focus).
- The 1.18.9 references are downscaled JPEGs and were compared by eye for IA, not measured.
- The README broken-image state (`main-details-readme.png`) was not traced to a cause.
- The VS Code version at which the webview's Chromium crossed 121 (when finding 7 began) was not looked up.
- No capture exists on a Chromium 114 host (VS Code 1.85). The claim that the `::-webkit-scrollbar` rules apply
  there is inferred from MDN's version data and the CSS-baseline lint's table, not observed.

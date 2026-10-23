# Design rules for nUIget: what "native" means, as measurable rules

Research dimension: **design-rules** · 2026-10-22 · repository `main` at `e4d6e97`, read-only.
Report path: `/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/research/design-rules.md`

## 0. Answer first

- "Good" for nUIget is **the workbench's own numbers**, taken from VS Code's CSS and TS, not from taste. This report
  turns them into 72 rules (`DS-<AREA>-<n>`), each with the workbench measurement it binds to, the value read in the
  source, how to measure it in the nUIget DOM, a tolerance and a status (measurable or judge-only).
- **There are two workbench looks in 2026, and the captures are not from the version the task assumed.** The UI job of
  run 39025149785 downloaded **VS Code 1.140.0** (job log, line 223: "Downloading VS Code: 1.140.0 / stable"), not a
  1.105-era build. From `release/1.139` the setting `workbench.experimental.modernUI` defaults to `true`
  (experiment-controlled), and Modern UI changes the exemplar values (pane header 22 px → 28 px, 11 px bold uppercase →
  12 px semibold capitalized, rounded corners, header hover tint). The captures still show the classic chrome, so Modern
  UI was not in effect in that run; why is not verified. Every numeric rule therefore names up to three values:
  **1.85** (release/1.85, the D10 baseline), **cur** (VS Code `main`, CSS that applies with or without Modern UI; what a
  current host such as the probe's shows, though which `main` values had already landed in 1.140 is not verified per
  value) and **M** (CSS gated by `.modern-ui`). The probe's VS Code version and the Modern UI setting decide which binds.
- **All five owner findings V1–V5 are measurable**, not judge-only. The pixel scans of the captures (section 4) give:
  tab strip 24 px vs the workbench's 33–36 px strips and 24 px buttons vs 26/28 px (V1); toolbar insets 16 px start vs
  6 px end (V2); the badge flush with the pane edge, end inset 0 (V3); 11 px of space above a section header's text vs
  22 px below it (V4); a header block with 8 px top and 4 px bottom padding and block gaps of 4/8/11/13/22 px (V5).
- The sourcing already shows **current-tree deviations** that the rules would flag: comfortable rows 78 px vs the
  Extensions view's 72 px; row actions drawn outside the row's highlight and focus ring; selection colours that ignore
  list focus; `focusBorder` used as a selection accent and tab underline; 13 workbench colour roles missing from
  `tokens.css` (11 of them needed by a rule); icon paths that predate the 2025-10 and 2026-02 codicon redraws; reduced motion that ignores
  `body.vscode-reduce-motion`; success toasts where the workbench announces success through the live region only.
- Decisions this reopens (D14–D19 are history, not contract): row height and icon size (D15), the row divider and the 3
  px accent (D15/interaction model §1), success toasts (D17), compact row 24 px vs native 22 px (tokens.css), literal
  spacing tokens vs aliases of `--vscode-spacing-*` (tokens.css), and the capture baseline (D18: which VS Code look the
  screenshots gate on).

## 1. Sources, versions and how they are cited

| Short name | What | Pinned at |
|---|---|---|
| `VSC@main` | microsoft/vscode `main` on 2026-10-22 (`package.json` version 1.144.0) | `https://raw.githubusercontent.com/microsoft/vscode/54d565d227f05c6b4dd9e109811128394125a753/<path>` |
| `VSC@1.85` | microsoft/vscode `release/1.85` (the D10 baseline) | `https://raw.githubusercontent.com/microsoft/vscode/release/1.85/<path>` |
| `VSC@1.139`, `@1.140` | release branches, checked for the Modern UI default | `.../release/1.139/...`, `.../release/1.140/...` |
| `DOCS` | microsoft/vscode-docs `api/ux-guidelines/*.md`, `api/extension-guides/webview.md`, `api/references/theme-color.md` | commit `fd64d64891a2e660bcc0d32ea402da905adfef7f` (pages dated 10/21/2026) |
| `ELEM` | vscode-elements/elements (community successor of the deprecated webview UI toolkit) | commit `b82f8fbea383a11cb477625cd9c3755cc128408a` |
| `GHPR` | microsoft/vscode-pull-request-github webview CSS | commit `8f35cbb6f32faf3912f4a7bc49b0665d97e4d7bf` |
| `GL` | gitkraken/vscode-gitlens webview tokens | commit `a9bc0f000eb4221bfeff4a1b03e624f478c96141` |
| Captures | 15 PNGs of run 39025149785, 1280×900, DPR 1, VS Code **1.140.0** on ubuntu, Dark Modern unless suffixed | scratchpad `captures/39025149785/20261017T103410/` |

Local copies of every fetched file are in the scratchpad under `research/vscode-src/`, `research/vscode-src/r185/`,
`research/vscode-src/modernUI/`, `research/vscode-docs/`, `research/vscode-elements/`, `research/exemplars/`. Line
numbers below are of those copies, which are byte-for-byte the pinned URLs.

Version facts (verified):

| Fact | Evidence |
|---|---|
| The UI job ran VS Code 1.140.0 with Chromium 150 (ChromeDriver 150.0.7871.124) | `gh api repos/gasrulle/nuiget/actions/jobs/117375049808/logs`, lines 220–234 |
| `extest setup-and-run ... --code_version max`; ExTester 8.28.1 supports 1.138–1.140 | `package.json:310`; `npm view vscode-extension-tester@8.28.1 supportedVersions` → `{"vscode-min":"1.138.0","vscode-max":"1.140.0"}` |
| The UI settings do not set `workbench.experimental.modernUI` | `src/test/ui/settings.json` (7 keys, none of them Modern UI) |
| `workbench.experimental.modernUI` default `false` in release/1.130–1.138, `true` from release/1.139 (with `experiment: { mode: 'auto' }`) | `src/vs/workbench/browser/workbench.contribution.ts` per branch: 1.138 line 836 `false`, 1.139 line 836 `true`, `VSC@main` lines 834–839 |
| `experiment.mode: 'auto'` means the experiment value replaces the setting whenever it changes | `VSC@1.140` `src/vs/platform/configuration/common/configurationRegistry.ts:299-305` |
| Modern UI view headers are not uppercase unless `modernUIUppercaseViewHeaders` (default `false`) | `VSC@main` `workbench.contribution.ts:840-845`; `modernUI/fontRamp.css:111-125, 146-152` |
| Since 2026-02-04 webviews receive every registered size token (`--vscode-spacing-size160`, `--vscode-fontSize-body1`, `--vscode-cornerRadius-small`, …) | `VSC@main` `src/vs/workbench/contrib/webview/browser/themeing.ts:72-79`; commit `63cc68e088` "feat: add size registry support to webview theme data provider" |
| The webview's `--vscode-font-size` is hard-coded to 13px; font family and weight come from the workbench | `themeing.ts:81-88` (`'vscode-font-size': '13px'` at line 84) |
| The size registry (font ramp, weights, radii, spacing ramp) exists since 2025-12-16; spacing ramp since 2026-06-05 | `gh api repos/microsoft/vscode/commits?path=src/vs/platform/theme/common/sizes/baseSizes.ts` |

## 2. Method

1. A rule is **derived** from a named workbench element whose metric was read in VS Code's source (and, where the
   captures show that element, measured beside nUIget in the same PNG). Where the workbench has no analogue, a UX
   guideline or a general heuristic is used only if it yields a number.
2. Every numeric rule is written as `= <workbench measurement name>` plus the CSS value read (classic | Modern UI), so
   the parallel ExTester probe can bind the name to a measured value or correct it.
3. **Measurement** names what to read in the nUIget DOM (element rects via `getBoundingClientRect`, computed styles via
   `getComputedStyle`), the formula and the tolerance. "Ink" means the bounding box of non-background pixels in a
   screenshot (used for V4/V5, where the eye reads ink, not boxes).
4. Status: **measurable** (a script decides) or **judge-only** (a person looking at a PNG decides).
5. Where no rule decides, the alternative closest to the workbench wins (owner's direction).

## 3. Rules

Legend: **1.85** = value in `VSC@1.85`; **cur** = value in `VSC@main` CSS that is not gated by `.modern-ui` (a current
host shows it whether or not Modern UI is on); **M** = value in a `.modern-ui`-gated module (`modernUI/*.css`); **C** =
"classic", used where 1.85 and cur agree; "(C, M)" = the same value with and without Modern UI as far as the gated
modules read here show (the `padding` and `roundedCorners` modules were not read line by line). "Current" in the last column = what the nUIget tree does today, with its
source line.

### 3.1 GRID

| ID | Rule | Binding (= workbench name: C \| M) | Measurement, tolerance | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-GRID-1 | Every computed padding, margin and gap of both roots is a step of the workbench spacing ramp. | = VS Code spacing ramp `spacing.size*`: {0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40} px (C: no registry, same values used literally) | For every element under `[data-testid=nuiget-app]` and `[data-testid=nuiget-sidebar]`: each of padding-*, margin-*, row-gap, column-gap ∈ ramp ∪ {1 (hairline, only `.nuiget-readme code` and visually hidden)}; README content exempt. Tolerance 0. | measurable | `VSC@main` `src/vs/platform/theme/common/sizes/baseSizes.ts:120-180` | Current tokens {1,2,4,6,8,12,16} (`tokens.css:14-23`) are inside the ramp; the existing pxSpacing lint (`webview-stylesheets.test.ts:20-21,55`) checks the source, this checks the result. |
| DS-GRID-2 | Vertical gaps between stacked blocks of one column use at most two values, both multiples of 4: 4 px inside a group, 8 px between groups. A section header sits at least as close to the rows it labels as to the block above it (proximity). | = workbench block rhythm: Extensions header padding 5/6 around a 28 px box (C, M), settings header 11+3 (C) — no single native number; the 4-px grid is the ramp's base. Native pane header text is centred in 22 px above 22 px rows, so its ink gaps above and below are equal (capture: OUTLINE ink 841–848 in header 834–855). | (a) In the list column (`.nuiget-main` children, then `.nuiget-main-list`, `.nuiget-installed` children): for each pair of consecutive blocks, gap = next.top − prev.bottom (box); the set of distinct gaps ⊆ {4, 8}. Tolerance 0. (b) For every section header: ink gap below (title text bottom → first row's name text top) ≤ ink gap above (previous block's last text or border → title text top) + 2 px; in the DOM use text rects (`Range.getBoundingClientRect`). | measurable | `VSC@main` `extensionsViewlet.css:25-29`; `settingsEditor2.css:22-31`; capture scan §4 | V5 (gaps today: 8, 8, 4, 4+1, 4, 4, 0 box; 13, 4, 11, 22 ink); V4 (11 px above vs 22 px below the DIRECT PACKAGES ink). |
| DS-GRID-3 | Spacing, radius and type tokens alias the workbench's size tokens, with the classic value as fallback, so the webview follows Modern UI and theme sizes. | = `--vscode-spacing-size*`, `--vscode-cornerRadius-*`, `--vscode-fontSize-*`, `--vscode-fontWeight-*` (exported to webviews since 2026-02-04) | Lint on `tokens.css`: each `--nuiget-space-N`, `--nuiget-radius-*`, `--nuiget-font-size-*` value matches `var(--vscode-<size-id>, <px>)`. Probe: in a Modern UI host, computed `--nuiget-space-6` = computed `--vscode-spacing-size160`. | measurable | `themeing.ts:72-79`; GitLens `src/webviews/apps/shared/styles/tokens.scss:14,31,55` (`--gl-space-16: var(--vscode-spacing-size160, 1.6rem)`) | Current: literal px (`tokens.css:14-27,60-63`); the tokens lint allows `var()` only for colours today (`webview-tokens.test.ts:56-65`). |

### 3.2 INSET

| ID | Rule | Binding | Measurement, tolerance | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-INSET-1 | One horizontal content inset per surface; every left edge of the list column starts there. | = Extensions view row padding-left: 1.85 16 px \| cur `var(--vscode-spacing-size160)` = 16 px | Rects: title, search box, tab label text, first toolbar control, section chevron, row check box (or icon when no check box), details title: `left − pane.left` = 16 ± 1. Sidebar: = Explorer twistie/content start (probe binds; tree twistie 16 px + indent, `tree.css:16-22,45-55`). | measurable | `VSC@1.85 extension.css:14-21`; `VSC@main extension.css:14-21` (`padding: 0 0 0 var(--vscode-spacing-size160)`) | Current inset 16 (`tokens.css:22-23`, P9.fix-6 test). Holds today for the list column. |
| DS-INSET-2 | Symmetric insets: every header, toolbar and control row has equal start and end inset, and equal top and bottom padding. | = Settings editor header padding-left = padding-right = 24 px (C, M); pane header actions margin-right 8 px with title margin 8 px (C) | For each container in {main header, search row, tab list, bulk toolbar, section header, details header, dialog footer, sidebar header}: `firstChild.left − box.left` vs `box.right − lastChild.right` (minus a visible scrollbar), and `firstChild.top − box.top` vs `box.bottom − lastChild.bottom`. Equal ± 1 px. | measurable | `VSC@main settingsEditor2.css:22-31`; `paneview.css:64-68`; `paneviewlet.css:22-24` | V2 (toolbar 16 vs 6: `main.css:190-195`), V3 (section header 16 vs 0: `main.css:168-170`, `primitives.css:451-455,499-503`), V5 (main header 8 top vs 4 bottom: `main.css:28`). |
| DS-INSET-3 | A trailing badge, count or action keeps an end inset of at least 12 px (sidebar) or the surface inset (main panel); nothing touches the pane edge or the sash. | = SCM row content padding-right 12 px; Extensions pane header padding-right 12 px; custom tree rows padding-right 12 px (C, M) | Rect: `container.right − lastChild.right ≥ 12` (sidebar) or `= 16 ± 1` (main list column). | measurable | `VSC@main scm.css:20-23`; `extensionsViewlet.css:167-169`; `views.css:149-152` (`.customview-tree .monaco-list .monaco-list-row { padding-right: 12px }`) | V3: provisional badge right = 673 = pane content right (end inset 0, `main-installed-all.png`); `net8.0` badge the same (`main-transitive-expanded.png`). |
| DS-INSET-4 | The details pane uses one inset on all four sides of its header block. | = Extensions editor header padding 20 px (top, left; bottom 12) (C, M) | Rects of `.nuiget-details-header`: top padding = left padding ± 1. | measurable | `VSC@main extensionEditor.css:19-26` | Current 8 top/bottom, 16 sides (`main.css:268-274`). |

### 3.3 HEIGHT

| ID | Rule | Binding (C \| M) | Measurement, tolerance | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-HEIGHT-1 | A sidebar section header is exactly as high as a native pane header, border included. | = pane header height: C 22 px \| M 28 px | Rect height of `.nuiget-sidebar-section > .nuiget-section-header` (border-box) = probe's `.pane-header` height ± 0. | measurable | `VSC@1.85 paneview.css:22-24` (`height: 22px`); `VSC@main paneview.css:6-11` (`--pane-header-size: 22px`), `paneview.ts:40`; `modernUI/paneHeaders.css:94-96` (`var(--vscode-spacing-size280, 28px)`); capture: native OUTLINE header 834–855 = 22 px | Current 25 px (24 min-height + 1 px border, `primitives.css:451-455`, `sidebar.css:102-106`; capture 97–121). Owner decision if 24 px pointer target must win (see DS-HEIGHT-2). |
| DS-HEIGHT-2 | A compact row (sidebar, popups) is as high as a native list row. | = Explorer / tree / quick pick row height 22 px (C, M) | Rect height of each sidebar `.nuiget-row` = 22 ± 0. | measurable | Capture: Explorer row pitch 92→114→136→158 (`main-transitive-expanded.png`); `quickInput.css:223-225` (`line-height: 22px`); ELEM `vscode-tree-item.styles.ts:37-38` | Current 24 px (`tokens.css:29-30`; capture 122–145). The small-targets lint exempts the row option (no `cursor: pointer`, `webview-stylesheets.test.ts:60-69`), so 22 px is lint-compatible; WCAG 2.5.8 is the a11y dimension's call. **Owner decision.** |
| DS-HEIGHT-3 | A comfortable row (main panel list) is as high as an Extensions view row. | = Extensions view row height 72 px (C, M) | Rect height of each main `.nuiget-row--comfortable` = 72 ± 0. | measurable | `VSC@1.85 extensionsList.ts:30`, `VSC@main extensionsList.ts:29` (`EXTENSION_LIST_ELEMENT_HEIGHT = 72`) | Current 78 px (`tokens.css:31-33`, D15 as amended). **Contradicts D15.** |
| DS-HEIGHT-4 | The Installed/Updates tab strip is as high as the workbench's in-editor scope tabs. | = Settings editor scope tab height: C ≈ 33 px (13 px label, padding 7 + 6.5, 1 px border; same at 1.85, `r185 settingsEditor2.css:118-125`; probe binds). V1 stated numerically: tab strip height ≥ bound value − 1 px (today 25). | Rect height of `[data-testid=tab-bar]` ≥ probe value − 1. | measurable | `VSC@main settingsEditor2.css:140-147, 153-156`; ELEM `vscode-tab-header.styles.ts:18-20` (`padding: 7px 8px`) | **V1**: 24 px + 1 px border (capture 134–158; `primitives.css:799-813`). |
| DS-HEIGHT-5 | The details pane's Details/README strip is as high as the Extensions editor's navbar. | = Extensions editor navbar height 36 px (C: 1.85 `extensionEditor.css:355-361`, cur `:372-378`) | Rect height of the details `role=tablist` = 36 ± 1. | measurable | `VSC@main extensionEditor.css:372-378` | Current 24 + 1 px (capture 231–255). |
| DS-HEIGHT-6 | Text buttons are as high as the workbench's text button. | = `.monaco-text-button` height: 1.85 28 px (padding 4, line-height 18, border 1+1, radius 2) \| cur 26 px (padding 4/8, line-height 16, 12 px font, radius 4; not Modern-UI-gated). V1 stated numerically: button height ≥ bound value − 1 px (today 24 < 26). | Rect height of every `.nuiget-button` and toolbar button = probe value ± 0. | measurable | `VSC@1.85 button.css:6-17`; `VSC@main button.css:6-20`; GHPR `webviews/common/common.css:24-34` (padding 3/12, lh 18 → 26); ELEM `vscode-button.styles.ts:42-53` (min-height 28) | **V1**: 24 px (`primitives.css:507-516`; capture 163–186). |
| DS-HEIGHT-7 | Text inputs and selects are as high as the workbench's. Sidebar search = Extensions view search box; main panel inputs/selects = Settings editor select box. | = sidebar search 28 px (C, M); editor select 26 px (C, M) | Rect heights: `[data-testid=sidebar-search-input]` = 28; `[data-testid=search-input]`, `project-selector`, `source-selector`, `version-selector` = 26. ± 0. | measurable | `VSC@1.85 extensionsViewlet.css:20-33`; `VSC@main extensionsViewlet.css:25-44`; `settingsEditor2.css:699-703`; ELEM `vscode-textfield.styles.ts:73-78` (18 + 3 + 3 + borders = 26) | Current 24 everywhere (`main.css:31-41,121-131`, `sidebar.css:30-40`; capture 73–96, 105–128, 69–92). |
| DS-HEIGHT-8 | Icon buttons draw a 22 px hover box (16 px glyph + 3 px padding) and keep a ≥ 24 px pointer target through spacing or a pseudo-element. | = action-label: 16 px codicon + padding 3 px (C, M) | Rect of the painted hover background = 22 ± 0; hit area (rect of the element or its `::after`) ≥ 24. | measurable | `VSC@main actionbar.css:41-53`; `style.css:354-357`; ELEM `vscode-toolbar-button.styles.ts:62-69` | Current: 24×24 box with no hover background (`primitives.css:367-385`). |
| DS-HEIGHT-9 | One check box size everywhere. | = `.monaco-checkbox` 18×18, radius 3 px (C, M) | Rect of every `input[type=checkbox]` and `.nuiget-row-check` = 18×18 ± 0; border-radius 3. | measurable | `VSC@1.85 toggle.css:40-44`; `VSC@main toggle.css:54-58`; GHPR `common.css:125-137` (18×18, radius 3) | Current three sizes: row mark 12 + 2 border = 14 (`primitives.css:128-137`, capture 364–377), header/dialog 16 (`main.css:54-68`). |
| DS-HEIGHT-10 | A count badge is the workbench count badge. | = `.monaco-count-badge`: min 18×18, 11 px, padding 3/5–6, radius 11 (pill) (C, M; label3 10 px in M) | Rect of each count badge ≥ 18×18; computed border-radius ≥ height/2 − 1; font-size 11 (C) \| 10 (M). | measurable | `VSC@1.85 countBadge.css:6-17`; `VSC@main countBadge.css:6-17`; `modernUI/fontRamp.css:95-98` | Current radius 4 px, ≈17×16 (`primitives.css:398-410`; capture sidebar 143–159 × 102–117). |
| DS-HEIGHT-11 | A progress bar is 2 px. | = `.monaco-progress-container` 2 px (C, M) | Rect height of `.nuiget-progress` = 2. | measurable | `VSC@main progressbar.css:8,14` | Holds (`primitives.css:588-591`). |

### 3.4 ROW

| ID | Rule | Binding | Measurement, tolerance | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-ROW-1 | A comfortable row has the Extensions row's anatomy: 16 px start padding, icon, gap, then a text column centred vertically; the icon is the Extensions icon size. | = Extensions icon: 1.85 42 px with 14 px gap \| cur 36 px with 16 px gap (not Modern-UI-gated) | Rect of `.nuiget-row-icon` = probe icon size ± 0; `name.left − icon.right` = probe gap ± 1. | measurable | `VSC@1.85 extension.css:29-33`; `VSC@main extensionsWidgets.css:6-13` | Current 32 px icon, 12 px gap (`tokens.css:39`, `primitives.css:244-255`). **Contradicts D15.** |
| DS-ROW-2 | Within one scroll container every row of a kind shares its icon x and its text x, whatever its section (direct, transitive, per project). | Gestalt alignment / continuation; the Extensions list has one column grid. | For all comfortable rows in one `.nuiget-installed-lists`: max − min of `icon.left` = 0 and of `name.left` = 0. Tolerance 0. | measurable | Capture `main-transitive-expanded.png`: direct icon x 390, name x 435; transitive icon x 364, name x 409 | Current: Δ 26 px between direct and transitive rows (the transitive row has no check box column). |
| DS-ROW-3 | The row's hover, selection and focus treatment covers the whole row, its action buttons included. | = `.monaco-list-row` (full width; actions are children of the row) (C, M) | Rect of the painted background / focus outline of a hovered, selected and focused row = rect of `[data-testid^=package-row-]` wrapper ± 0 horizontally. | measurable | `VSC@main list.css:34-39`; `scm.css:328-345` (actions inside the row) | Current: highlight ends at x 649, actions at 650–673 (main); 323 vs 324–347 (sidebar). `Row` puts actions in an `aria-hidden` sibling of the option (`primitives.css:336-348`). |
| DS-ROW-4 | A row shows at most three actions, on hover and on focus, and also on the focused row. | = tree item guideline "Don't add more than three actions to an item"; SCM actions on `:hover` and `.focused` | Count of visible action buttons per row ≤ 3; visible on `:hover` and `:focus-within`. | measurable | `DOCS views.md:64`; `VSC@main scm.css:336-345` | Holds today (one action per row). |
| DS-ROW-5 | A name never yields to a version, badge or count: the name truncates last, with an ellipsis and the full text available. | = Extensions name `text-overflow: ellipsis; min-width: 0` beside a `flex-shrink: 0` meta (C, M) | At 170/200/250 px sidebar widths: `name.scrollWidth > name.clientWidth` only if version and badges are already collapsed; computed `text-overflow: ellipsis`; the full id in `title` or the accessible name. | measurable | `VSC@main extension.css:74-80,111-113` | Holds in the sidebar (`primitives.css:287-322`; capture `sidebar-narrow-200px.png`). |
| DS-ROW-6 | Rows hide parts by priority as the width shrinks, at the Extensions view's breakpoints. | = Extensions view `.narrow` ≤ 250 px (icon 24 px) and `.mini` ≤ 200 px (icon and ratings hidden) | At list-pane widths 260/240/190 px: icon rect 32→24→hidden (or the bound size); no horizontal scroll. | measurable | `VSC@main extensionsViewlet.ts:740-741`; `extensionsViewlet.css:217-237` | Current: no breakpoint in the main list. |

### 3.5 TYPE

| ID | Rule | Binding | Measurement, tolerance | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-TYPE-1 | UI text uses the workbench font; only code uses the editor font. | = `--vscode-font-family`; `--vscode-editor-font-family` for code | Computed `font-family` of every text node = body's, except `code`, `pre` and `.nuiget-readme code`. | measurable | `themeing.ts:81-87`; `DOCS webview.md:566-570` | Holds (`tokens.css:64-65`, `main.css:18`). |
| DS-TYPE-2 | Every font size is a step of the workbench ramp (README body exempt: it follows the Markdown preview). | = font ramp: Heading1 26, Heading2 18, Heading3 13, Body1 13, Body2 11, Label1 12, Label2 11, Label3 10 px (tokens registered in cur; applied across the workbench by the M `fontRamp` module); 1.85 uses 11/12/13 and 26 for the Extensions editor title | Computed `font-size` of every text element outside `.nuiget-readme` ∈ {10, 11, 12, 13, 18, 26} ± 0.1 px. | measurable | `baseSizes.ts:35-65`; `modernUI/fontRamp.css:9-19`; `VSC@main extensionEditor.css:72-78` | Current `--nuiget-font-size-lg` 1.15em = 14.95 px (details title `main.css:276-280`, dialog title `primitives.css:731-737`). `sm` 0.85em = 11.05 px passes. |
| DS-TYPE-3 | Two weights: 400 and 600; 700 only where the classic pane header uses bold. | = `fontWeight.regular` 400, `fontWeight.semiBold` 600 (M); pane header `font-weight: bold` (C) | Computed `font-weight` ∈ {400, 600} (and 700 on sidebar section titles under C). | measurable | `baseSizes.ts:67-78`; `paneview.css:25-35` | Sidebar section titles are 600 (`primitives.css:458-465`) where the classic pane header is 700. |
| DS-TYPE-4 | Body line height is 1.4em; single-line rows and controls use a fixed line box equal to their height. | = workbench `line-height: 1.4em`; list rows 22 px | Computed `line-height` of root = 1.4 × font-size ± 0.5. | measurable | `VSC@main style.css:48-50` | Holds (`main.css:19`, `sidebar.css:19`). |
| DS-TYPE-5 | Section headers follow the host's casing, size and weight: classic = 11 px bold uppercase; Modern UI = Label1 12 px semibold capitalized unless the user keeps uppercase. In-list group headers (Direct packages, a project, Transitive packages) are tree rows: body size, normal case. | = pane header title (C: 11 px bold uppercase \| M: 12 px 600 capitalize); host settings mirrored on `<body>` as GitLens does | Computed `text-transform`, `font-size`, `font-weight` of sidebar section titles = probe's `.pane-header .title` in the same VS Code session. | measurable | `paneview.css:25-43`; `modernUI/fontRamp.css:56-60,111-125,146-152`; GL `src/webviews/hostEnvironment.ts:11-30`, `tokens.scss:117-124` | Current: always uppercase (`primitives.css:480`); main list group headers uppercase (V4 capture) while 1.18.9 used normal case ("Direct packages (10)", `docs/ux/reference-1.18.9/installed-single-transitive-headers.jpg`). |
| DS-TYPE-6 | Secondary text is `descriptionForeground` at 11–12 px; metadata at 11 px. | = Extensions publisher 11 px semibold; install count 11 px (cur) \| 90 % / 80 % (1.85) | Computed size of `.nuiget-row-version`, `-authors`, `-meta` ∈ {11, 12}. | measurable | `VSC@main extension.css:111-123,202-206`; `VSC@1.85 extension.css:101-106,187-190` | Holds (0.85em = 11.05 px). |
| DS-TYPE-7 | Titles inside the panel: the panel title at Body1 13 px semibold, the details title at Heading2 18 px semibold (or Body1 when the pane is narrow). | Derived from the ramp (Heading2 18 px / 600); no native details title exists below the Extensions editor's 26 px name (1.85, cur), which is the upper bound. Not a measurement of a workbench element. | Computed sizes of `.nuiget-main-title` (13) and `.nuiget-details-title` (18). | measurable | `baseSizes.ts:39-45`; `extensionEditor.css:72-78` | Current 13 (holds) and 14.95 (fails). |

### 3.6 ICON

| ID | Rule | Binding | Measurement, tolerance | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-ICON-1 | Every glyph is a codicon, drawn from the same codicon release as the host; no custom glyph where a codicon exists. | = `@vscode/codicons` `src/icons/<name>.svg` at a pinned version | Lint: each icon in `icons.tsx` names its codicon and its path `d` equals that SVG's at the pinned version; `/** Custom:` entries = 0. | measurable | `DOCS views.md:16,100` ("Use existing icons when possible"); `panel.md:37`; codicons repo history: chevron-right redrawn 2025-10-07 and 2026-02-02, trash 2025-11-05 | Current paths are the pre-redraw shapes (chevron-right `M5.7 13.7L5 13l4.6-4.6…`, `icons.tsx:27-31`, vs current `M6.14601 3.14579…`); two custom glyphs (`icons.tsx:183-200`). |
| DS-ICON-2 | Action and header glyphs are 16 px in `icon.foreground`; compact inline marks 12 px. | = `codiconFontSize` 16, `codiconFontSize.compact` 12; `.monaco-workbench .codicon { color: var(--vscode-icon-foreground) }` | Rect 16×16 for `.nuiget-icon-button svg`; computed colour = `--vscode-icon-foreground`. | measurable | `baseSizes.ts:80-86`; `actionbar.css:41-46`; `VSC@main style.css:210-211` | Size holds; colour fails: icon buttons rest at `descriptionForeground` (`primitives.css:377`). |
| DS-ICON-3 | Package icon size follows the Extensions view, including its narrow and mini breakpoints. | = Extensions icon (1.85 42 \| cur 36; 24 at ≤ 250 px; hidden at ≤ 200 px) | See DS-ROW-1, DS-ROW-6. | measurable | `extensionsWidgets.css:6-13`; `extensionsViewlet.css:217-237` | Current 32 px at every width. |
| DS-ICON-4 | The Verified mark is the Extensions view's verified-publisher mark. | = codicon `verified-filled` in `extensionIcon.verifiedForeground` (default `textLink.foreground`) | Icon name in DOM (`data-codicon` or title) and computed colour = `--vscode-extensionIcon-verifiedForeground`. | measurable | `VSC@main src/vs/workbench/services/extensionManagement/common/extensionsIcons.ts:12-13`; key exists at 1.85 (`extensionsWidgets.ts`) | Current: `check` glyph in `textLink.foreground` (`icons.tsx:150-151`, `primitives.css:231-234`). |
| DS-ICON-5 | Icon delivery is a decision with two native precedents; either keeps DS-ICON-1. | (a) inline SVG synced by a script (GitHub PR extension `build/update-codicons.ts` → `resources/icons/codicons/*.svg`); (b) the codicon font (`webview-codicons-sample`, GitLens `base.scss:243`, NuGet Gallery `@vscode/codicons`) | (a): the lint of DS-ICON-1. (b): `codicon.css` and `codicon.ttf` load under the existing CSP (`font-src ${cspSource}`, `src/host/services.ts:115`); `check:vsix` admits the files. | judge-only | official sample `webview-codicons-sample/src/extension.ts:34-50`; `icons.tsx:2-3` claims "Codicon fonts are NOT available in webviews — inline SVGs are required", which is wrong as a constraint | Count pinned at 26 by `webview-icons-pure.test.ts:29`; the font needs `scripts/check-vsix-contents.mjs:10-18` (`resources/**` already allowed) and is outside the JS bundle ceilings (`esbuild.mjs:24`). |

### 3.7 COLOR (the role table is section 5)

| ID | Rule | Binding | Measurement, tolerance | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-COLOR-1 | Every painted colour resolves to the `--vscode-*` key of its role in the table of section 5. | = theme colour reference | Per role, in all four theme kinds: computed colour of the role's element = computed value of its `--vscode-*` key. | measurable | `DOCS api/references/theme-color.md`; `DOCS webviews.md:19` ("Ensure all elements in the view are themeable") | 11 roles absent from `tokens.css` (section 5). |
| DS-COLOR-2 | Selection colours depend on list focus: active colours only while the listbox contains focus, inactive colours otherwise. | = `.monaco-list:focus .selected` → `list.activeSelection*`; otherwise `list.inactiveSelection*` | Focus outside the list: computed background of `[aria-current=true]` (multi) or `[aria-selected=true]` (single) = `--vscode-list-inactiveSelectionBackground`; focus inside = active. | measurable | `VSC@main listWidget.ts:921-968` | Current: active colour regardless of focus (`primitives.css:106-111,122-126`). |
| DS-COLOR-3 | Icon buttons paint `toolbar.hoverBackground` on hover and `toolbar.activeBackground` when pressed or toggled on. | = `.monaco-action-bar .action-label:hover` | Computed background of a hovered `.nuiget-icon-button` = `--vscode-toolbar-hoverBackground`. | measurable | `VSC@main style.css:354-362`; GHPR `common.css:242-256` | Current: colour change only (`primitives.css:382-385`). |
| DS-COLOR-4 | Tabs use the panel title colours: inactive `panelTitle.inactiveForeground`, active `panelTitle.activeForeground` with a 1 px `panelTitle.activeBorder` underline. | = Extensions editor navbar; panel tabs | Computed colours and underline thickness of `role=tab`. | measurable | `VSC@main extensionEditor.css:388-401`; `panelpart.css:60-68` | Current: `descriptionForeground`/`foreground` and a 2 px `focusBorder` line (`primitives.css:799-823`). |
| DS-COLOR-5 | `focusBorder` marks keyboard focus and nothing else. | = workbench focus outline | Lint: `--nuiget-color-focus` appears only in `outline` declarations and the sash hover; probe: no element without focus paints the focus colour. | measurable | `VSC@main style.css:268-282` | Current: the 3 px row accent (`primitives.css:274-285`) and the tab underline (`primitives.css:820-823`) use it. |
| DS-COLOR-6 | Disabled text uses `disabledForeground`, never opacity on text. | = Extensions disabled row `color: var(--vscode-disabledForeground)` | Computed colour of disabled names/buttons = `--vscode-disabledForeground` (≥ 4.5:1 checked by the a11y dimension). | measurable | `VSC@main extension.css:243-249` | Current uses `descriptionForeground` (`primitives.css:145-147,387-390,529-534`); opacity is avoided (good). |
| DS-COLOR-7 | Secondary buttons have a hover state. | = `button.secondaryHoverBackground` | Computed background of a hovered `.nuiget-button--secondary` ≠ rest and = the key. | measurable | `DOCS theme-color.md` (`button.secondaryHoverBackground`); key exists at 1.85 (`colorRegistry.ts`) | Current: hover = rest (`primitives.css:522-526`). |

### 3.8 DENSITY

| ID | Rule | Binding | Measurement | Status | Evidence | Current |
|---|---|---|---|---|---|---|
| DS-DENSITY-1 | Density is a property of the surface, not a user toggle: the sidebar is compact (one-line 22 px rows, no icons, no descriptions), the main list is comfortable (Extensions rows), the details pane uses editor spacing. | = Explorer / SCM (compact), Extensions view (comfortable), Extensions editor (details) | Row heights per surface per DS-HEIGHT-2/3; no density setting in `package.json`. | measurable | `DOCS sidebars.md`; `extensionsList.ts:29` | Holds in kind (24/78 values aside). |
| DS-DENSITY-2 | When the host runs Modern UI with `window.density.layout: compact`, the webviews follow it the way GitLens does (body attribute from the host, spacing tokens shrink with the host's). | = `window.density.layout` (M only) | Host passes the setting; with compact, block gaps shrink to the host's compact values (probe binds). | judge-only (until the probe measures compact) | `VSC@main workbench.contribution.ts:258-269`; GL `hostEnvironment.ts:25-30` | No support today. Owner decision whether to follow. |

### 3.9 OVERFLOW

| ID | Rule | Binding | Measurement, tolerance | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-OVERFLOW-1 | No surface scrolls horizontally at its host minimum width. | = sidebar part minimum width 170 px; editor minimum width 220 px | At sidebar widths {170, 200, 250, 300} and main panel widths {220, 400, 600, 800}: `scrollWidth ≤ clientWidth` for the root and every non-list container (`.nuiget-main-details` included). | measurable | `VSC@main sidebarPart.ts:48`; `editor.ts:29` (`DEFAULT_EDITOR_MIN_DIMENSIONS = new Dimension(220, 70)`) | Not measured today (no narrow main capture). `.nuiget-details-actions` is a 4-column max-content grid (`main.css:287-292`) that cannot wrap: hypothesis that it overflows below ~300 px, not verified. |
| DS-OVERFLOW-2 | No sibling collision: inside every flex/grid row, no two children's rects intersect and every child lies within the parent's content box. | Gestalt; workbench rows use `min-width: 0` + ellipsis | For each container in the overflow table (§7): pairwise rect intersection area = 0; `child.right ≤ parent.right − padding-right`. Tolerance 0. | measurable | `extension.css:65-80` | V3 (badge reaches the pane edge, `main-installed-all.png`). |
| DS-OVERFLOW-3 | Every container that holds a row of controls declares a minimum width and one overflow behaviour (wrap, icon-only, overflow menu, hide by priority), per §7. | = view title: navigation actions beyond the first few move to the `...` overflow; Extensions narrow/mini | For each container: at its declared min width, all its controls are reachable (visible or in an overflow menu) and DS-OVERFLOW-1/2 hold. | measurable | `DOCS sidebars.md:50`, `views.md:100`, `panel.md:37`; `extensionsViewlet.ts:740-741` | Tab list has no wrap or overflow rule (`primitives.css:792-797`); split bounds are percentages (`MainShell.tsx:62`, `min: 25` → 55 px list at 220 px). |
| DS-OVERFLOW-4 | The sidebar view title shows at most four navigation actions; the rest go to the `...` menu. | = Explorer view title: 4 navigation actions (New File, New Folder, Refresh, Collapse) | Count of `view/title` items in group `navigation*` visible at once for `nuiget.sidebarView` ≤ 4. | measurable | `VSC@main src/vs/workbench/contrib/files/browser/views/explorerView.ts:1115-1191`; `DOCS sidebars.md:50` | Current 6 (`package.json:204-245`, `navigation@0`…`@5`); at 200 px the title reads "N" (`sidebar-narrow-200px.png`). |
| DS-OVERFLOW-5 | Split bounds are in pixels: the list pane never goes below its toolbar's min-content width, the details pane never below its header's. | = editor/sidebar part minimums are pixels | `layout/set` clamps `splitPosition` so `listPane.width ≥ minContent(toolbar)` and `detailsPane.width ≥ minContent(details header)`. | measurable | `editor.ts:29`; `sidebarPart.ts:48` | Current percentage clamp 25–75 % (`MainShell.tsx:62,290`). |

### 3.10 STATE

| ID | Rule | Binding | Measurement | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-STATE-1 | Every screen has a defined loading-first, revalidating, empty, error, partial and unsupported state (matrix in §8), each with a capture state. | interaction model §4 + this matrix | Each matrix cell has a `data-testid` state marker and an ExTester capture; the capture list grows by those states. | measurable | `docs/ux/interaction-model.md:61-76`; capture list (15 states, none empty/loading/error) | The 15 captures cover success states only. |
| DS-STATE-2 | Progress is shown where the work is: a 2 px indeterminate bar at the top of the list (view progress), never a global progress notification for a single-package operation. | = view progress (`ProgressLocation` with a view id); pane progress container at the header's bottom | Presence of `.nuiget-progress` at the list top while loading or revalidating; no `withProgress(Notification)` for single operations. | measurable | `DOCS views.md:92-96`; `notifications.md:55-66`; `VSC@main paneviewlet.css:78-87` | Holds for revalidation (`main.css:106-119`); first load uses skeleton rows (interaction model §4) — a non-workbench pattern. |
| DS-STATE-3 | Empty states follow welcome-view content: left-aligned sentence(s), 20 px side padding, 1em between blocks, at most one primary button (full width up to 300 px), links preferred. | = `.welcome-view-content` | Computed `text-align` = start; padding-inline = 20; ≤ 1 button; button width = min(container − 40, 300). | measurable | `VSC@main views.css:92-130`; `DOCS views.md:68-90` | Current: centred text, 16 px padding (`primitives.css:538-550`). |
| DS-STATE-4 | Errors are inline: severity icon + one sentence + one action, in the area that failed; toasts only for operation failures. | = Extensions view message container (severity icon + message) | Inline error element contains a codicon `error`/`warning` glyph, text and ≤ 1 button. | measurable | `VSC@main extensionsViewlet.css:179-191,250-260` | Holds in kind (Banner primitive, `primitives.css:618-653`). |
| DS-STATE-5 | A successful single operation is confirmed in place (row state, button label) and through the live region, not by a toast; toasts are kept for failures, partial bulk results and long bulk runs. | = Extensions Install/Update: `alert("Installing extension {0} is completed.")`, no notification | Count of information notifications after a successful single install/update/uninstall = 0; `status-live` text present. | measurable | `VSC@main extensionsActions.ts:45,611,1047`; `DOCS notifications.md:42,44` | **Contradicts D17** (success toasts). Captures show three stacked toasts (`sidebar-sections.png`). |
| DS-STATE-6 | A pending operation changes the control in place to its "-ing" label or a spinner, and the row is `aria-busy`. | = Extensions "Installing"/"Uninstalling" button labels | Text or spinner of the row's action while busy; `aria-busy=true`. | measurable | `VSC@main extensionsActions.ts:720,735,894` | Holds (spinner replaces actions, interaction model §4). |
| DS-STATE-7 | Every disabled affordance says why in text, as Visual Studio does for SDK-implicit packages. | VS NuGet PM: "Implicitly referenced by an SDK. To update the package, update the SDK to which it belongs." | Each `aria-disabled` row/button has a visible or described reason (`aria-describedby` text non-empty). | measurable | learn.microsoft.com `install-use-packages-visual-studio` § "Update an implicitly referenced package" | Current: SDK/props rows show a dashed empty check mark only (`primitives.css:139-143`). |

### 3.11 FOCUS

| ID | Rule | Binding | Measurement, tolerance | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-FOCUS-1 | Focus rings are 1 px solid; offset −1 px for list rows, inputs, selects and tabs; +2 px for check boxes and text buttons. | = workbench focus rule; checkbox and `.monaco-text-button:focus` offsets | Computed `outline-width` 1, `outline-offset` per control kind. | measurable | `VSC@main style.css:268-282,291-292`; `button.css:32-34` | Current: check boxes +1 (`main.css:88-92`), buttons −1 (`primitives.css:353-363`). |
| DS-FOCUS-2 | The focused row's ring uses `list.focusOutline`, not `focusBorder`. | = `.monaco-list:focus .monaco-list-row.focused { outline: 1px solid list.focusOutline; outline-offset: -1px }` | Computed outline colour of the focused option = `--vscode-list-focusOutline`. | measurable | `VSC@main listWidget.ts:982-991` | Current `focusBorder` (`primitives.css:353-363`). |
| DS-FOCUS-3 | Focus is drawn for keyboard focus only. | = `:focus-visible`; Modern UI `keyboardFocusOnly` module | No outline after a pointer click on a row or tab. | measurable | `modernUI/keyboardFocusOnly.css`; `paneHeaders.css:103-110` | Holds (`:focus-visible` throughout). Inputs use `:focus` (`main.css:137-141`), matching the workbench input rule. |
| DS-FOCUS-4 | High contrast draws selection and hover as outlines: selection 1 px dotted `contrastActiveBorder`, hover 1 px dashed. | = list styles in HC | HC capture: selected row has a dotted outline, hovered row a dashed one. | measurable | `VSC@main listWidget.ts:995-1010` | HC tokens pinned to three keys (`tokens.css:153-159`, `webview-tokens.test.ts:96-100`); the HC capture shows solid orange outlines. |

### 3.12 MOTION

| ID | Rule | Binding | Measurement | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-MOTION-1 | UI transitions last 100–150 ms ease-out; loops use the workbench's timings (spinner 1.5 s steps(30), indeterminate progress 4 s linear). | = pane animation 0.15 s ease-out; indent guides 0.1 s; codicon spin 1.5 s steps(30); progress 4 s | Computed `transition-duration` ∈ {100, 150} ms; spinner `animation-duration` 1.5 s; progress 4 s. | measurable | `VSC@main paneview.css:119-124`; `tree.css:36-38`; `codicon-modifiers.css:16-23`; `progressbar.css:34-38` | Current 100/200 ms (`tokens.css:55-57`), spinner 1 s linear (`primitives.css:438-441`), progress 1.6 s (`primitives.css:603-606`), skeleton breathe 1.2 s. |
| DS-MOTION-2 | Reduced motion follows both the OS and VS Code's own setting. | = `body.vscode-reduce-motion` (set when `workbench.reduceMotion` resolves on) and `prefers-reduced-motion` | With `workbench.reduceMotion: on` and the OS default: computed `--nuiget-duration-normal` = 0ms. | measurable | `VSC@main src/vs/workbench/contrib/webview/browser/pre/index.html:511-512`; `VSC@1.85` same file `:495-496` | Current media query only (`tokens.css:225-231`); adding `body.vscode-reduce-motion` needs the selector allowlist of `webview-tokens.test.ts:53` widened. |

### 3.13 COPY

| ID | Rule | Binding | Measurement | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-COPY-1 | Button, tab and command labels are Title Case; tooltips and messages are sentence case. | = Extensions action labels ("Switch to Pre-Release Version", "Select Version to Install") vs tooltips ("Enable this extension") | Regex over rendered labels of `button`, `role=tab`, menu items: each word ≥ 4 letters capitalised (articles/prepositions excepted). | measurable | `VSC@main extensionsActions.ts:1563-1566,1635,1692-1700`; `explorerView.ts` titles ("Collapse Folders in Explorer") | Current sentence case: "Select all", "Uninstall selected (0)" (`InstalledTab.tsx:219`), "Update all (2)" (`UpdatesTab.tsx:225`), "Install in projects…". 1.18.9 used "Uninstall Selected (0)". |
| DS-COPY-2 | Label–value pairs have no colon and use one noun per field. | = Extensions editor More Info ("Identifier", "Version", "Last Updated", "Size") | Regex: no label text ending in ":" inside the details pane; "Author(s)" and "Authors" not both present. | measurable | `VSC@main extensionEditor.ts:1148-1212` | Current: "Installed:", "Version:" (`DetailsPane.tsx:167,181`), "Version:", "Authors:" (`TransitiveDetails.tsx:52,57`) beside "Author(s)" without colon (`DetailsInfo.tsx:48`). |
| DS-COPY-3 | Messages are whole sentences ending with a period; an empty state names the condition in one sentence. | = "No extensions found."-style messages; welcome views "Limit the length of the content" | Regex on `EmptyState` messages and banners: ends with "." | measurable | `DOCS views.md:72-86` | Holds for `EmptyState` (`grep EmptyState message=`); live-region strings lack the period (acceptable). |
| DS-COPY-4 | Labels of commands that open further UI end with "..." as the workbench writes it. | = "New File...", "Install from VSIX..." | Regex: label opening a dialog/picker ends with "..." (three ASCII periods). | measurable | `VSC@main explorerView.ts` ("New File..."); `extensionsActions.ts:232` | Current uses U+2026 "…" ("Install in projects…"). Low; a judgement of house style. |
| DS-COPY-5 | Counts appear one way per surface: a count badge in pane and tab headers, "N of M" only while filtering. | = Extensions/SCM pane header count badge | No header shows both a badge and "(N)" text; filtered headers show "N of M". | measurable | `VSC@main extensionsViewlet.css:154-156`; `scm.css:26-29` | Main list: tab badge plus "DIRECT PACKAGES (2)" text (capture). |

### 3.14 DIVIDER

| ID | Rule | Binding | Measurement | Status | Evidence | Catches / current |
|---|---|---|---|---|---|---|
| DS-DIVIDER-1 | No line between rows; lines only between groups (pane headers, sections), and none above the first group. | = list rows have no border; pane header `border-top` except the first pane; quick pick separator `border-top` between groups | Count of rows with a non-zero `border-bottom` = 0; first section header has no top border. | measurable | `VSC@main list.css:34-39`; `paneviewlet.css:6-8`; `quickInput.css:250-253,259-261` | Current: every comfortable row has a 1 px bottom border (`primitives.css:238-241`; D15 / interaction model §1 "a line under it"). **Contradicts D15.** |
| DS-DIVIDER-2 | Only layers above the page (dialog, popover, popup) are elevated: `widget.shadow` + `widget.border`, the hover's single shadow `0 2px 8px`. | = hover/quick input shadow | Computed `box-shadow` non-none only on `.nuiget-dialog`, `.nuiget-popover`, `.nuiget-search-popup`. | measurable | GL `tokens.scss:111` ("byte-identical to VS Code's native hover"); `VSC@main quickInput.css:13` (quick input elevated with `--vscode-shadow-xl`, a main-line token) | Holds (`primitives.css:722,771`, `search.css:46`). The dialog uses `0 0 8px` (`primitives.css:722`). |
| DS-DIVIDER-3 | A popup groups items with quick-pick separators: a top line and a `descriptionForeground` label, not uppercase captions. | = quick pick separator | Computed `text-transform` of `.nuiget-search-group-header` = none; a `border-top` on every group but the first. | measurable | `DOCS quick-picks.md:57`; `VSC@main quickInput.css:250-261,348-353` | Current uppercase bold captions without a line (`search.css:61-68`). |
| DS-DIVIDER-4 | The header/body line of the main panel and the tab strip line use one divider colour role. | = `settings.headerBorder` / `panelSection.border` (Settings editor, Extensions editor navbar) | Computed `border-color` of `.nuiget-main-search` and `.nuiget-tablist` bottom borders equal and = the bound key. | measurable | `VSC@main extensionEditor.css:378`; `settingsEditor2.css` (`settings.headerBorder`, ELEM `vscode-tabs.styles.ts:21`) | Current `widget.border` fallback `panel.border` (`tokens.css:81`). |

Rule count: GRID 3, INSET 4, HEIGHT 11, ROW 6, TYPE 7, ICON 5, COLOR 7, DENSITY 2, OVERFLOW 5, STATE 7, FOCUS 4,
MOTION 2, COPY 5, DIVIDER 4 = **72**. Judge-only: DS-ICON-5, DS-DENSITY-2 (and the residual "looks squeezed" of V1).

## 4. V1–V5: the negative control, measured

Tools: a 60-line PNG decoder and three scanners written for this report
(`research/tools/png.mjs`, `scan.mjs` = colour runs along a row or column, `bbox.mjs` = ink box in a rectangle,
`crop.mjs`). Example: `node scan.mjs <png> v 380 130 220` prints the colour runs of column 380 from y 130 to 220.
All values are CSS px at DPR 1 in the 1280×900 captures (webview x 348–1279).

| Finding | Measured (capture, coordinates) | Rule(s) that catch it | Expected under the rule |
|---|---|---|---|
| **V1** tab bar and bulk toolbar look squeezed | `main-installed-single.png`: tab strip 134–157 (24 px incl. 2 px underline) + border 158; toolbar buttons 163–186 (24 px); 4 px box gap tab line → button (159–162) and button → section header (187–190). Native in the same PNG: editor tab strip 30–64 (35 px). | DS-HEIGHT-4 (tab strip ≥ Settings scope tab height ≈ 33 px), DS-HEIGHT-6 (buttons = text button 28 at 1.85 / 26 cur), DS-GRID-2 (8 px between groups) | Tab strip ≈ 33 px, buttons 26–28 px, 8 px between tab strip and toolbar. **Measurable**; whether the result still "looks squeezed" is the residual judge-only part. |
| **V2** "Select all" and "Uninstall selected" misaligned with each other and with the list | Select all x 364–448; Uninstall selected x 504–667; pane content right 673; row option right 649 (`main-installed-single.png`). Start inset 16, end inset 6 (`main.css:190-195`). | DS-INSET-2 (start = end), DS-INSET-3, DS-ROW-3 (row highlight to 673) | Toolbar end inset 16 → right edge 657; rows' highlight to 673 so the content edges agree. |
| **V3** "provisional" badge overlaps the list's right border | Badge x 604–673 with its info border at 604 and 673; sash 674–677 (`main-installed-all.png`). Same for `net8.0` x 628–673 (`main-transitive-expanded.png`). | DS-INSET-3 (end inset ≥ 12 / = 16), DS-OVERFLOW-2 (child within parent content box) | Badge right ≤ 657. |
| **V4** section headers: small top margin, large bottom margin | Blank rows above the DIRECT PACKAGES ink: 187–197 = 11 px (from the button's bottom border 186 to cap top 198); below: 208–229 = 22 px (to the first row's name ink at 230), because the header's half-leading (7 px) stacks on the row's 12 px top padding. | DS-GRID-2 (b), the proximity clause: for every section header, ink gap below ≤ ink gap above + 2 px; DS-HEIGHT-3 (72 px rows) shrinks the stacked row padding | Gap below ≤ gap above. Measured as ink, because the boxes are adjacent (header 191–214, row 215). |
| **V5** spacing follows no single scale | Vertical blocks of the list column: webview top 65 → select 73 (8), select 96 → search 105 (8), search 128 → line 133 (4), tab line 158 → button 163 (4), button 186 → header 191 (4), header 214 → row 215 (0); main header padding 8 top / 4 bottom (`main.css:28`); ink gaps 13 (title → search), 11, 22. | DS-GRID-2 (≤ 2 distinct block gaps, multiples of 4), DS-INSET-2 (top = bottom) | Block gaps ⊆ {4, 8}, symmetric paddings. |

Every V-finding maps to at least one rule id: V1 → DS-HEIGHT-4, DS-HEIGHT-6, DS-GRID-2; V2 → DS-INSET-2, DS-INSET-3,
DS-ROW-3; V3 → DS-INSET-3, DS-OVERFLOW-2, DS-INSET-2; V4 → DS-GRID-2 (b); V5 → DS-GRID-2 (a), DS-INSET-2, DS-GRID-1.

## 5. Colour roles

Verified: every key below exists at 1.85 (grep of `VSC@1.85` `colorRegistry.ts`, `workbench/common/theme.ts`,
`extensionsWidgets.ts`, `settingsEditorColorRegistry.ts`, `extensionsActions.ts`, `keybindingsEditor.ts`), except
`gitDecoration.addedResourceForeground` (git extension) and `charts.green`.

| Role | State | `--vscode-*` key (workbench source of the role) | tokens.css |
|---|---|---|---|
| Page surface (editor) | rest | `editor.background` | `--nuiget-color-bg` (69) |
| List pane / sidebar surface | rest | `sideBar.background` | `--nuiget-color-bg-sidebar` (70) |
| Text | rest | `foreground` | `--nuiget-color-fg` (73) |
| Secondary text | rest | `descriptionForeground` | `--nuiget-color-fg-muted` (74) |
| Text | disabled | `disabledForeground` (`extension.css:243-249`) | **absent** (uses fg-muted) |
| Link | rest / hover | `textLink.foreground` / `textLink.activeForeground` | `--nuiget-color-link` (75) / **absent** |
| Error, warning, info text and icons | error | `errorForeground`; icons `editorError/Warning/Info.foreground` (`extensionsViewlet.css:250-260`) | 76 (`errorForeground`), 77, 78 |
| Icon (glyph) | rest | `icon.foreground` (`style.css:210-211`) | **absent** |
| Icon button | hover / pressed | `toolbar.hoverBackground` / `toolbar.activeBackground` (`style.css:354-362`) | **absent** |
| List row | hover | `list.hoverBackground` (+ `list.hoverForeground`) | 114 / **absent** |
| List row | selected, list focused | `list.activeSelectionBackground`, `…Foreground`, `…IconForeground` | 115, 116 / **absent** (icon) |
| List row | selected, list not focused | `list.inactiveSelectionBackground`, `…Foreground` | 117 / **absent** (fg) |
| List row | focused | `list.focusOutline` (1 px, −1), `list.focusBackground`; HC `list.inactiveFocusOutline` | **absent** (uses focusBorder) |
| List row | search match | `list.highlightForeground`, `list.focusHighlightForeground` (`style.css` `.highlight`) | **absent** |
| List row | error / warning name | `list.errorForeground`, `list.warningForeground` | **absent** |
| Section header (sidebar) | rest | `sideBarSectionHeader.background/foreground/border` | 93–95 |
| Section header | hover (M) | `list.hoverBackground` (`modernUI/paneHeaders.css:99-101`) | n/a (no hover by design, `main.css:698-700` — stale under M) |
| Tabs | inactive / active / indicator | `panelTitle.inactiveForeground` / `panelTitle.activeForeground` / `panelTitle.activeBorder` | **absent** (fg-muted / fg / focusBorder) |
| Focus | keyboard | `focusBorder`; HC `contrastActiveBorder` | 82, 157 |
| Divider | rest | `widget.border` → `panel.border`; editor dividers `settings.headerBorder`, `panelSection.border` | 81 / **absent** |
| Elevation | overlay | `widget.shadow`; `editorWidget.background/foreground` | 83, 87, 88 |
| Badge | rest | `badge.background/foreground` | 124, 125 |
| Primary button | rest / hover / border | `button.background`, `button.foreground`, `button.hoverBackground`, `button.border` | 126–128, 132 |
| Secondary button | rest / hover | `button.secondaryBackground/Foreground` / `button.secondaryHoverBackground` | 129–130 / **absent** |
| Check box | rest | `checkbox.background/foreground/border` | 136–138 |
| Drop-down | rest | `dropdown.background/foreground/border` | 139–141 |
| Input | rest / placeholder / invalid | `input.*`, `input.placeholderForeground` / `inputValidation.errorBorder`, `…warningBorder` | 142–145 / **absent** |
| Progress | running | `progressBar.background` | 84 |
| Scrollbar | rest / hover / active | `scrollbarSlider.*` | 148–150 |
| Verified mark | rest | `extensionIcon.verifiedForeground` | **absent** (uses link) |
| Update "new version" | rest | no workbench role; `gitDecoration.addedResourceForeground` → `charts.green` (contrast reasons documented) | 121 |
| Code | rest | `textCodeBlock.background`; inline `textPreformat.foreground/background` (webview default style) | 98 / **absent** |
| Scrim | dialog | none (derived) | 90 |

Absent roles that the rules need: `disabledForeground`, `textLink.activeForeground`, `icon.foreground`,
`toolbar.hoverBackground`, `toolbar.activeBackground`, `list.focusOutline`, `list.inactiveSelectionForeground`,
`list.activeSelectionIconForeground`, `panelTitle.activeForeground`, `panelTitle.inactiveForeground`,
`panelTitle.activeBorder`, `button.secondaryHoverBackground`, `extensionIcon.verifiedForeground` (13; 11 of them are
needed by a rule in §3).

## 6. Typography, iconography and density plans

**Type scale** (DS-TYPE-2/3/7), in px at the webview's fixed 13 px base (`themeing.ts:84`):

| Role | Size | Weight | Today |
|---|---|---|---|
| Badge, counter | 10 (M) / 11 (C) | 400 | 11.05, 400 |
| Metadata, version, authors | 11 | 400 (600 for publisher name, as Extensions) | 11.05, 400 |
| Section title (pane header) | 11 bold upper (C) / 12 semibold capitalized (M) | 700 / 600 | 11.05, 600, upper |
| Body, row name, controls | 13 | 400; row name 600 | 13, 600 |
| Panel title | 13 | 600 | 13, 600 |
| Details title | 18 | 600 | 14.95, 600 |
| README | Markdown preview scale (exempt) | — | 1.6/1.4/1.2em headings |

**Icons** (DS-ICON-*): 26 glyphs pinned (`webview-icons-pure.test.ts:29`); 24 named codicons + 2 custom
(`icons.tsx:183-200`). Plan: map the two custom glyphs to codicons; resync all paths from `@vscode/codicons` at the
host's version with a script (precedent: GitHub PR extension) or load the font (precedent: official sample, GitLens,
NuGet Gallery); either way a lint compares names and paths. 16 px glyphs, `icon.foreground`, package icons at the
Extensions size with its breakpoints, Verified = `verified-filled`.

**Density** (DS-DENSITY-*): sidebar compact = 22 px rows, 22/28 px headers, no icons; main list comfortable = 72 px
Extensions rows; details pane = editor spacing (20 px header inset). No user toggle; optionally follow Modern UI compact
density.

## 7. Containers that hold a row of controls: minimum width and overflow behaviour

| Container | Min width (rule) | Behaviour below it (order) | Today |
|---|---|---|---|
| Sidebar view title (VS Code-drawn) | 170 px (sidebar min) | ≤ 4 navigation actions; others in `...` (VS Code does it when not in `navigation`) | 6 navigation actions (`package.json:204-245`); title "N" at 200 px |
| Sidebar header (search box) | 170 px | search box shrinks; filter button stays inside the box | holds (`search.css:10-31`) |
| Sidebar section header | 170 px | title ellipsis; count badge stays; header actions (Update all) stay | title ellipsis holds (`primitives.css:484-488`) |
| Main header (title, check boxes, selects, gear, refresh) | 220 px (editor min) | wrap (already); then check box labels become icon toggles with tooltips; title hides last | wraps (`main.css:22-29`) |
| Tab strip (Installed/Updates) | list pane min | count badges hide first, then labels ellipsis; never horizontal scroll | no rule (`primitives.css:792-797`) |
| Bulk toolbar | list pane min | primary action stays at the end; Select all becomes an icon button (1.18.9 used icon buttons) | wraps (`primitives.css:834-844`) |
| In-list section header (Direct, Transitive, project) | list pane min | title ellipsis; badges (provisional, TFM, CPM) keep a 16 px end inset; badge text may ellipsize | badges reach the edge (V3) |
| Comfortable row | list pane min | Extensions breakpoints: ≤ 250 px icon 24, ≤ 200 px icon hidden; name ellipsis last; actions stay | no breakpoint |
| Details header (installed row, version row, buttons) | details pane min | grid becomes a wrapping flex row: label + value, then buttons on their own line | 4-column max-content grid, no wrap (`main.css:287-292`) |
| Details/README tabs | details pane min | as tab strip | as tab strip |
| Dialog footer | dialog min (`min(32em, 100%)`) | wrap, primary last | wraps (`primitives.css:745-750`) |
| Quick-search popup row | search box width | name ellipsis; version/chevron stays | holds |

Measurement for every row: DS-OVERFLOW-1/2/3 at the listed widths.

## 8. States per screen

Columns: what each state shows (rule), and whether a capture exists. "—" = no capture today (gap for DS-STATE-1).

| Screen | Loading first | Revalidating | Empty | Error | Partial | Unsupported |
|---|---|---|---|---|---|---|
| Main · Installed (single) | 2 px bar at list top (+ status text) — | bar, rows stay — | welcome-style sentence — | inline icon + sentence + Retry — | provisional badge on header ✓ (`main-installed-all`) | banner with reason — |
| Main · Installed (All Projects) | per project bar — | — | per project sentence — | per project inline — | provisional ✓ | per project banner — |
| Main · Transitive section | bar inside section on expand — | — | "No transitive dependencies." — | inline + Restore — | restore banner — | — |
| Main · Updates | bar — | — | "No updates available." — | inline — | sources-unavailable banner — | — |
| Main · Browse results | bar — | — | "No results for "x"." — | inline — | sources-unavailable banner — | — |
| Main · Quick-search popup | "Searching…" row ✓? (open capture shows results) | — | "No results" row — | error row — | per-source error row — | — |
| Main · Details (package) | bar in header — | — | "Select a package to see its details." ✓ (`main-installed-all`) | inline Retry — | stale selection read-only — | read-only note — |
| Main · README tab | bar — | — | "No README available." — | inline Retry — | images as links — | — |
| Main · Transitive details | — | — | — | — | — | — |
| Main · Sources dialog | bar — | — | "No sources" — | inline — | unreachable mark — | — |
| Sidebar · Installed | bar — | — | "No packages installed." — | inline (`sidebar-installed-error`) — | provisional badge — | banner (`sidebar-unsupported`) — |
| Sidebar · Updates | bar — | — | "No updates available." — | inline — | `sidebar-updates-unavailable` — | — |
| Sidebar · Browse | bar — | — | "No results…" — | inline — | `sidebar-browse-unavailable` — | — |
| Sidebar · Update all confirm | — | — | — | — | — | — |

Today's 15 captures show 13 success states, one dialog and one narrow sidebar; none of the loading, empty, error,
unsupported or narrow-main states.

## 9. Findings on the current tree

| # | L | Sev | Finding | Evidence | Decision-relevant |
|---|---|---|---|---|---|
| 1 | H | high | The captures are VS Code 1.140.0, not 1.105; Modern UI defaults on from 1.139 yet the run shows classic chrome; the screenshot gate (D18) has an unpinned look. Pin `workbench.experimental.modernUI` in `src/test/ui/settings.json` and capture both, or pin the version. | UI job log l. 220–234; `package.json:310`; `src/test/ui/settings.json`; `workbench.contribution.ts` per release | yes |
| 2 | V | medium | `tokens.css` spacing/type/radius are literals; the workbench exports `--vscode-spacing-*`, `--vscode-fontSize-*`, `--vscode-cornerRadius-*` to webviews (since 2026-02-04); GitLens aliases them with fallbacks. | `tokens.css:14-27,60-63`; `themeing.ts:72-79`; GL `tokens.scss:14,31,55` | yes |
| 3 | V | medium | Comfortable rows 78 px with 32 px icons vs Extensions 72 px with 42 (C) / 36 (M) px icons. | `tokens.css:31-33,39`; `extensionsList.ts:29`; `extension.css:29-33` (1.85); `extensionsWidgets.css:6-13` | yes (D15) |
| 4 | V | medium | V1 measured: tab strip 24 px, buttons and inputs 24 px vs 33–36 px strips, 26/28 px buttons, 26/28 px inputs. | §4; `primitives.css:507-516,799-813`; `settingsEditor2.css:140-147`; `button.css` | yes |
| 5 | V | low | V2 measured: toolbar insets 16/6, its end 667 vs row highlight end 649 vs pane end 673. | `main.css:190-195`; §4 | no |
| 6 | V | low | V3 measured: section header has no end inset; provisional and TFM badges end at the pane edge (673). | `primitives.css:451-455,499-503`; `main.css:168-170`; §4 | no |
| 7 | V | low | V4 measured: 11 px above a section header's ink vs 22 px below it. | §4 | no |
| 8 | V | low | V5 measured: main header 8/4 padding; block gaps 0/4/8 and ink gaps 4–22 with no rule. | `main.css:28,108-113`; §4 | no |
| 9 | V | low | Direct and transitive rows in one scroller are offset by 26 px (icon 390 vs 364, name 435 vs 409). | `main-transitive-expanded.png` | no |
| 10 | V | medium | Row actions sit outside the option's hover/selection/focus box (main 650–673, sidebar 324–347). | `primitives.css:336-348`; captures | no |
| 11 | V | medium | Selection ignores list focus; `focusBorder` used as row accent and tab underline; 13 workbench roles missing in `tokens.css`. | `primitives.css:106-126,274-285,820-823`; `listWidget.ts:921-991`; §5 | yes |
| 12 | V | low | Icon buttons rest at `descriptionForeground` and hover by colour only; secondary buttons have no hover. | `primitives.css:367-385,522-526`; `style.css:354-362` | no |
| 13 | V | medium | Icon paths predate the 2025-10/2026-02 codicon redraws; `icons.tsx:2-3` premise ("fonts are NOT available") is wrong under the current CSP; two custom glyphs. | `icons.tsx:1-31,183-200`; `services.ts:115`; codicons history | yes |
| 14 | V | low | Count badge radius 4 / 17×16 vs pill ≥ 18; three check box sizes (14/16) vs 18. | `primitives.css:128-137,398-410`; `main.css:54-68`; `countBadge.css`; `toggle.css` | no |
| 15 | V | low | Reduced motion ignores `body.vscode-reduce-motion`; durations 200 ms, spinner 1 s, progress 1.6 s vs 150 ms / 1.5 s / 4 s. | `tokens.css:54-57,225-231`; `pre/index.html:511-512` | no |
| 16 | X | medium | Success toasts after every operation where the workbench announces success through the live region only. Three toasts stack in `sidebar-sections.png`; two come from earlier steps of the same test run, so the stack is partly a test artefact, but each success raises one toast (D17). | `sidebar-sections.png`; `extensionsActions.ts:611,1047`; `notifications.md:42,44` | yes (D17) |
| 17 | X | low | Six sidebar view-title navigation actions vs Explorer's four; title collapses to "N" at 200 px. | `package.json:204-245`; `explorerView.ts:1115-1191`; `sidebar-narrow-200px.png` | no |
| 18 | X | low | Microcopy: colons on some labels, "Author(s)" vs "Authors", sentence-case buttons, U+2026 ellipsis. | `DetailsPane.tsx:167,181`; `TransitiveDetails.tsx:52,57`; `DetailsInfo.tsx:48`; `InstalledTab.tsx:219` | no |
| 19 | V | low | Font size 14.95 px off the ramp; section titles 600 where classic pane headers are 700. | `tokens.css:62`; `main.css:276-280`; `primitives.css:458-465` | no |
| 20 | X | low | Empty states centred (welcome views are left-aligned, 20 px padding); first load uses skeleton rows (workbench uses view progress). | `primitives.css:538-584`; `views.css:92-130`; interaction model §4 | no |
| 21 | H | medium | The capture set has no loading, empty, error, unsupported or narrow-main state, so DS-STATE and DS-OVERFLOW rules cannot be measured from captures. | capture list; interaction model §8 | yes |
| 22 | V | low | Split bounds in percent; at the 220 px editor minimum the list pane is 55 px. | `MainShell.tsx:62`; `editor.ts:29` | no |
| 23 | V | low | Verified mark is a check in link colour; Extensions uses `verified-filled` in `extensionIcon.verifiedForeground`. | `icons.tsx:150-151`; `extensionsIcons.ts:12-13` | no |
| 24 | V | low | A divider under every comfortable row; workbench lists have none. | `primitives.css:238-241`; `list.css:34-39`; interaction model §1 | yes (D15) |
| 25 | X | low | Quick-search groups use uppercase captions instead of quick-pick separators. | `search.css:61-68`; `quickInput.css:250-261,348-353` | no |
| 26 | X | low | SDK/props rows say why they cannot be selected only by a dashed empty mark; VS writes "Implicitly referenced by an SDK…", Rider shows the version in parentheses. | `primitives.css:139-143`; VS docs; Rider docs | no |
| 27 | V | low | Compact rows 24 px and sidebar headers 25 px vs native 22/22 (C). | `tokens.css:29-30`; captures | yes |

## 10. Exemplars: what makes a webview read as native

| Exemplar | What it does | Evidence |
|---|---|---|
| GitLens (53.5 M installs, 2026.10) | Bridges every spacing, radius, font size and weight to `--vscode-*` size tokens with a fallback; mirrors `workbench.experimental.modernUI`, `window.density.layout` and the uppercase setting onto `<body>` and switches header casing with it; uses the codicon font; hover shadow identical to VS Code's. | GL `tokens.scss:8-60,111,113-124`; `hostEnvironment.ts:5-30`; `base.scss:243` |
| GitHub Pull Requests (37.1 M) | Buttons 26 px (padding 3/12, 13 px, lh 18, radius 4); icon buttons padding 2 with `toolbar.hoverBackground`; check boxes 18×18 radius 3; codicons as SVG files synced by `build/update-codicons.ts`; colour roles: focusBorder, descriptionForeground, panel.background, button.*, badge.*, list.*Foreground. | GHPR `webviews/common/common.css:24-34,125-137,242-256`; repo tree |
| vscode-elements (successor of the deprecated `@vscode/webview-ui-toolkit`) | Re-implements native metrics as web components: button min 28 px, textfield 26 px, settings-style tab padding 7/8, panel-style tabs 31 px 11 px uppercase, collapsible 22 px 11 px bold uppercase, counter badge 18 px pill, tree item 22 px with 12 px end padding, toolbar button 22 px. | ELEM `vscode-button.styles.ts:42-53`; `vscode-textfield.styles.ts:73-78`; `vscode-tab-header.styles.ts:18-20,62-65`; `vscode-collapsible.styles.ts:20-42`; `vscode-badge.styles.ts:32-36`; `vscode-tree-item.styles.ts:37-40`; `vscode-toolbar-button.styles.ts:62-69`; `npm view @vscode/webview-ui-toolkit deprecated` |
| NuGet Gallery (direct competitor, 0.75 M, 4.81) | Webview NuGet manager on `@vscode/codicons` (font) and the deprecated toolkit. | `pcislo/vscode-nuget-gallery` `package.json` lines 127, 138 |
| Jupyter (110.6 M), Thunder Client (7.7 M), Database Client (1.3 M) | README screenshots only; Thunder Client and Database Client are closed source, Jupyter's webview CSS was not read. | Marketplace API (`extensionquery`, flags 914) |

Marketplace numbers: Marketplace `extensionquery` API, 2026-10-22 (installs, average rating, rating count).

## 11. Package managers outside VS Code: what they show (IA only)

| Product | Shows | Bearing on rules |
|---|---|---|
| Visual Studio NuGet Package Manager (VS 2026) | Tabs Browse / Installed / Updates / Consolidate (solution); search with Include prerelease; Package source selector + settings gear; rows with id, abbreviated owners/authors and downloads; details: version selector, Install/Update/Uninstall, Options (dependency behaviour, file conflict, preview window), Package Details and README tabs; implicit SDK packages disabled with a sentence; multi-select Update; per-project selection for a solution. | DS-STATE-7 (say why); DS-COPY-2; tab IA matches nUIget minus Consolidate. learn.microsoft.com `/nuget/consume-packages/install-use-packages-visual-studio` (ms.date 2026-04-10). |
| JetBrains Rider 2026.2 NuGet window | Tabs Packages / Sources / Log / Folders / PMC; Installed, Discover and Implicitly Installed groups (implicit versions in parentheses); scope selector per project; prerelease and source filters; details with project targeting, version, Frameworks and Dependencies; results in the Log tab. | DS-STATE-5 (results in place + a log, not toasts); DS-STATE-7. jetbrains.com `/help/rider/Using_NuGet.html` (via WebFetch summary). |
| Version Lens (2.6 M, 4.60) / Dependi (0.77 M, 4.39) | Inline in manifests: current vs latest, prerelease toggle, vulnerability squiggles and ⚠ on vulnerable update targets, a modal before updating to a vulnerable version, deprecations, yanked/unlisted versions. | WHAT to show beside a version (vulnerable, deprecated, unlisted); not how. Marketplace READMEs. |

npm/pnpm GUIs and cargo tools were not covered (gap).

## 12. Annotated gallery (not screenshotted; URLs answered HTTP 200 on 2026-10-22)

| Exemplar | URL | Look at |
|---|---|---|
| Views guideline: tree view | https://code.visualstudio.com/assets/api/ux-guidelines/examples/tree-view.png | 22 px rows, twistie and icon columns, descriptions muted after labels |
| View toolbar | https://code.visualstudio.com/assets/api/ux-guidelines/examples/view-toolbar.png | number of title actions, 16 px glyphs, spacing |
| Welcome view | https://code.visualstudio.com/assets/api/ux-guidelines/examples/welcome-view.png | left-aligned text, one full-width button, link |
| View with progress | https://code.visualstudio.com/assets/api/ux-guidelines/examples/view-with-progress.png | 2 px bar under the header as the loading state |
| Webview view | https://code.visualstudio.com/assets/api/ux-guidelines/examples/webview-view.png | native-looking inputs/dropdowns/buttons in a webview |
| Webview: Pull Request | https://code.visualstudio.com/assets/api/ux-guidelines/examples/webview-pull-request.png | editor webview header, buttons, typography |
| Sidebar toolbar (single view) | https://code.visualstudio.com/assets/api/ux-guidelines/examples/sidebar-toolbar-actions.png | how a single view's actions consolidate in the title |
| Sidebar toolbar (default) | https://code.visualstudio.com/assets/api/ux-guidelines/examples/sidebar-toolbar-default.png | `...` overflow |
| Panel toolbar | https://code.visualstudio.com/assets/api/ux-guidelines/examples/panel-toolbar.png | panel tabs: 11 px uppercase, count badges, active underline |
| Quick pick separators | https://code.visualstudio.com/assets/api/ux-guidelines/examples/quick-pick-separators.png | group line + muted label (DS-DIVIDER-3) |
| Notification decision tree | https://code.visualstudio.com/assets/api/ux-guidelines/examples/notification-decision-tree.png | when not to notify (DS-STATE-5) |
| VS NuGet PM: details | https://learn.microsoft.com/en-us/nuget/consume-packages/media/package-manager-package-details.png | fields of the details pane |
| VS NuGet PM: README | https://learn.microsoft.com/en-us/nuget/consume-packages/media/package-manager-package-readme.png | README tab placement |
| VS NuGet PM: implicit package | https://learn.microsoft.com/en-us/nuget/consume-packages/media/package-update-disabled.png | disabled Update with the reason in text |
| VS NuGet PM: solution | https://learn.microsoft.com/en-us/nuget/consume-packages/media/manage-packages-for-solution.png | per-project check list with versions |
| VS NuGet PM: Consolidate | https://learn.microsoft.com/en-us/nuget/consume-packages/media/consolidate-tab.png | version drift across projects |
| Rider NuGet window | https://resources.jetbrains.com/help/img/rider/2026.2/nuget_window.png | grouping Installed / Discover / Implicitly Installed |
| Rider scope selector | https://resources.jetbrains.com/help/img/rider/2026.2/nuget_window_project.png | project scope |
| Rider dependencies | https://resources.jetbrains.com/help/img/rider/2026.2/nuget_dependencies.png | frameworks/dependencies sections |
| GitLens Commit Graph | https://raw.githubusercontent.com/gitkraken/vscode-gitlens/main/images/docs/commit-graph-preview.png | dense native-looking webview list, header controls |
| GitHub PR demo | https://github.com/Microsoft/vscode-pull-request-github/raw/HEAD/.readme/demo.gif | tree view + webview detail split |
| Thunder Client | https://raw.githubusercontent.com/thunderclient/thunder-client-support/refs/heads/main/images/thunder-client-v2.png | sidebar webview list density, tabs |
| Database Client | https://doc.database-client.com/images/view.png | tree + table webview |
| Dependi vulnerabilities | https://www.dependi.io/screenshots/vuln.png | inline vulnerability marking |

## 13. Not reachable and gaps

Not reachable / not read:
- Thunder Client and Database Client sources (closed); only README images.
- Jupyter webview CSS (not read).
- The workbench itself was not screenshotted (no browser or VS Code here); Modern UI values come from CSS, not pixels.

Gaps:
- The Rider page was read through WebFetch's summary, not quoted directly.
- Problems, Search and SCM views were grepped for specific rules, not read as whole exemplars.
- The `activity-bar`, `context-menus` and `status-bar` guideline pages were fetched but not used.
- Which look (classic or Modern UI) the next UI run will show, and why 1.140.0 rendered classic despite the default.
- No measurement at DPR > 1, at zoom levels, or with a non-default `editor.fontSize`/`window.zoomLevel`.
- npm/pnpm GUIs and cargo tools (package managers outside VS Code) were not covered.
- Modern UI compact density values (DS-DENSITY-2) were not read.
- The Settings editor tab height (DS-HEIGHT-4) is computed from CSS (≈ 33 px), not measured.
- Contrast of the colour roles is the accessibility dimension's.
- Whether `.nuiget-details-actions` overflows at narrow widths is a hypothesis.

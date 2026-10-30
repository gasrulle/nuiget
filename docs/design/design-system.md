# nUIget Design System

The rules, tokens and component contracts that make the two nUIget webviews read as part of VS Code. "Native" means
the workbench's own numbers, measured: every rule below binds to a field of the ExTester probe of VS Code 1.142.0 or,
where the probe has no such element, to the VS Code source it was read from, and says so. Where the two workbench looks
differ, the Modern UI value comes first (it is the compiled default from 1.139) and the classic value second.

| Item | Value |
|---|---|
| Status | Proposed by the UX initiative, 2026-10-23. The plan's items implement it; this file is the reference they cite. |
| Rules | 84: the 72 `DS-*` rules of the research (ids kept) and 12 added (`DS-TYPE-8`, `DS-TYPE-9`, `DS-RADIUS-1`, `DS-RADIUS-2`, `DS-DIVIDER-5`, `DS-DIVIDER-6`, `DS-SCROLL-1`, `DS-SCROLL-2`, `DS-LOOK-1`, `DS-HC-1`, `DS-ALIGN-1`, `DS-OVERFLOW-6` (2026-10-24, V72)) |
| Tokens | 171 `--nuiget-*` custom properties (`tokens.json`, `src/webview/shared/tokens.css`), 26 of them switched by the look |
| Exemplar | The workbench: Extensions view (rows, pane headers, search), Explorer (tree rows, pane-header actions), Settings editor (controls, scope tabs), quick input (popup), Extensions editor (details header, navbar) |
| Floor | VS Code `^1.90.0` (Chromium 122, Node 20.9; owner round 2, D54); every rule renders correctly there through token fallbacks (1.90 exports none of the size tokens) |
| Owner rounds | Round 1: composition A, the Extensions view. Round 2: D51 disabled text buttons, D52 row check mark, D54 floor, D56 Browse loading. Applied throughout; §14 lists what each changed |
| Generator | `docs/design/tools/spec.mjs` and `build.mjs` (committed) write `tokens.json` and the artifact's token lists |

How to read the citations:

- `C:` is `probe/out/workbench/<file>` (classic look, `workbench.experimental.modernUI: false`, the ExTester default) and
  `M:` is `probe/out-modern/workbench/<file>` (Modern UI: `__document.workbenchClass` contains `modern-ui modern-ui-tabs
  … floating-panels`). A field reads `extensions.json pane_headers[0] .rect.h`: file, group, index, field. When a cell
  says "M 28 / C 22 (`extensions.json pane_headers[0] .rect.h`)" both runs were read at that field.
- `vars` means the theme dumps `probe/out/themes/<slug>.json` (`--vscode-*` values; the Modern UI run dumped identical
  values in all six themes). `PNG` means a pixel scan of the probe screenshots recorded in `rules-bound.json` `workbench.png`.
- "CSS-read" or "TS-read" marks a number read in VS Code source (`research/vscode-src/…`, pinned commit in the research
  report) and not measured; such a rule is "unbound" until the P0 probe measures it, and says which state it needs.
- Catches name the owner's findings (V1–V5, V14–V69 of the ledger) and the P9.fix gates (P9.fix-2 layout shift,
  -3 card centring, -4 toolbar end edge, -5 details actions, -6 left inset) a rule would have caught.

## 1. Rules

One rule per line. Status is `measurable` (a script decides) or `judge-only`. Tolerances are in CSS px unless stated.

### GRID

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-GRID-1 | Every computed padding, margin, row-gap and column-gap under both roots is a step of the spacing ramp {0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40} px. 1 px is allowed only on `.nuiget-visually-hidden` and inline code; README content is exempt; flex `auto` margins (used value above 40 px) are excluded. | For every element under `[data-testid=nuiget-app]` and `[data-testid=nuiget-sidebar]`: `getComputedStyle` padding-*, margin-*, row-gap, column-gap ∈ ramp. | 0 | measurable | V5, V44, V55 | M = C: `--vscode-spacing-size*` = the ramp in all six themes (`vars`); today the tab bar's `padding-left` 7 fails (`rules-bound` DS-GRID-1) |
| DS-GRID-2 | (a) Consecutive blocks of one column are 4 px apart inside a group and 8 px apart between groups, no other value (premise P-1). (b) A section header sits at least as close to the rows it labels as to the block above it. | (a) gap = next.top − prev.bottom (border boxes) over the children of `.nuiget-main`, `.nuiget-main-list`, `.nuiget-installed` and the sidebar root; the set of gaps ⊆ {4, 8}. (b) Per section header, on text line boxes: gap below (title bottom → first row name top) ≤ gap above (last text or border above → title top) + 2. | (a) 0; (b) 2 | measurable | V1, V4, V5, V43, V44, V54, V55 | M: Extensions header padding 4/8/4/8, 4-based (`M: extensions.json ext_search[0] .padding`); C: block gaps 5 and 10 (PNG search box, `rules-bound` DS-GRID-2), header padding 5/12/6/20; proximity holds natively: pane-header text 10 above / 6.4 below |
| DS-GRID-3 | Spacing, radius, font-size, font-weight and codicon-size tokens alias the workbench size token of their step with the classic px as fallback (`--nuiget-space-6: var(--vscode-spacing-size160, 16px)`); row, header and control heights stay literal. | Lint on `tokens.css`: each `--nuiget-space-{1..7}`, `--nuiget-radius-{xs,sm,md,lg,xl,circle}`, `--nuiget-font-size-{xs,sm,label,md,lg}`, `--nuiget-font-weight-{regular,semibold}`, `--nuiget-icon-size-{sm,md}`, `--nuiget-line-width` is `var(--vscode-<id>, <px>)` with the fallback equal to the dumped value. | exact | measurable | — | M = C: 30 size tokens exported, identical in six themes and both looks (`vars`; `out` vs `out-modern` themes: 0 differences) |

### INSET

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-INSET-1 | One start inset per region. Main panel: the title, search box, tab labels, first toolbar control, section chevrons, and the row check box (or icon when a row has none) start 16 px from the list column's content box, in both looks (editor lists are not inset under Modern UI). Sidebar: section titles and row names start at the pane-header title x, M 28 / C 20 px from the pane edge; the header row (search box) starts at the sidebar inset, M 8 / C 20. Details pane: 20 (DS-INSET-4). | `element.left − region.left` for each listed element. | 1 | measurable | V2, V45, V57, V58, V60, P9.fix-6 | M: title 28 (`M: extensions.json pane_headers[3] .rect.x` 77 − `webviews[0]` 49), Extensions search header pad 8 (`ext_search[0] .padding`), editor list x unchanged (`M: settings.json settings[0] .rect.x` 1002); C: row padding 16 (`C: extensions.json ext_rows[0] .padding[3]`), title 20 (`pane_headers[3]` 68 − 48), search box 20 (PNG `extSearchBox.left` 68) |
| DS-INSET-2 | Symmetric insets (premise P-2): every header, search row, tab strip, toolbar, section header, details header, dialog footer and the sidebar header has equal start and end inset and equal top and bottom padding. Main panel 16/16; sidebar header M 8/8 / C 20/20; details header 20 on all sides; toolbar 4 above and below its 26 px controls. | `first.left − box.left` vs `box.right − last.right` (a visible scrollbar excluded); `first.top − box.top` vs `box.bottom − last.bottom`. | 1 | measurable | V2, V3, V5, V41, V44, V52, P9.fix-4 | M: Extensions header 4/8/4/8, symmetric on each axis (`M: extensions.json ext_search[0] .padding`); C: Settings item 24/24 (`C: settings.json settings[10] .padding`); the classic Extensions header pads 5/12/6/20 (`C: ext_search[0]`), which the premise overrides |
| DS-INSET-3 | Nothing touches a pane edge or the sash. (a) A row's last action ends 6 px inside the row band, both looks. (b) The trailing count, badge or action of a sidebar section header ends M 6 px inside the header box (10 px from the pane edge) / C 12 px. (c) The trailing control of a main-panel header, toolbar or in-list group header ends at the surface inset, 16 px (DS-INSET-2). | (a) `band.right − lastAction.right` = 6; (b) `header.right − last.right` = M 6 / C 12; (c) `container.right − last.right` = 16. | 1 | measurable | V2, V3, V42, V53, P9.fix-4 | M = C 6: `extensions.json ext_rows[0]` right − `ext_parts[23]` right (C 348 − 342, M 343 − 337); M 6 / C 12: `pane_headers[0]` right − `pane_headers[4]` right (M 343 − 337, C 348 − 336) |
| DS-INSET-4 | The details header uses 20 px on all four sides, and the details title, its labels and the Details/README tab labels start at that inset. | `.nuiget-details-header` padding top = start = end = bottom = 20; details tab label left = details title left. | 1 | measurable | V57, P9.fix-5 | M = C 20 top/start (Extensions editor header, CSS-read `extensionEditor.css:19-26`; its bottom 12 yields to premise P-2); unbound until P0 probes `.extension-editor .header` |

### HEIGHT

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-HEIGHT-1 | A sidebar section header, and a main-list group header (one grouped list per view, owner round 1), is as high as a native pane header, border included: M 28 / C 22 px. | Rect height of `.nuiget-sidebar-section > .nuiget-section-header` and of every main-list group header (border box). | 0 | measurable | V36 | M 28 / C 22 (`extensions.json pane_headers[0] .rect.h`; Explorer the same, `explorer.json pane_headers[0]`) |
| DS-HEIGHT-2 | A compact row (sidebar lists, popups) is 22 px in both looks (owner round 1). | Rect height of each sidebar `.nuiget-row` wrapper and popup row. | 0 | measurable | V36 | M = C 22 (`explorer.json list_rows[0] .rect.h`; quick input `quickinput.json quickinput[3]`; Settings TOC `settings.json settings[0]`) |
| DS-HEIGHT-3 | A comfortable row is the Extensions row: its pitch, any line included, is 72 px in both looks, with its text block centred (three lines in Browse, two in Installed and Updates, DS-ROW-1) and no divider adding to it (DS-DIVIDER-1). Owner round 1 (composition A) retires D15's 78 px card with a line under every row. | Rect height of each main `.nuiget-row` wrapper and the distance between consecutive wrapper tops. | 0 | measurable | V10, V39, P9.fix-3 | M = C 72 (`extensions.json ext_rows[0] .rect.h`, `list_rows[0]`) |
| DS-HEIGHT-4 | The Installed/Updates tab strip is 36 px with its bottom line: the Extensions editor navbar, as composition A draws it (owner round 1); the Details/README strip is the same (DS-HEIGHT-5). | Rect height of `[data-testid=tab-bar]`. | 1 | measurable | V1, V11, V37 | Unbound: the navbar is not in the dump. CSS-read 36 (`extensionEditor.css:372-378`); consistent with PNG `extEditorNavbar` (label ink centre 245.25, bottom line 263). The Settings scope tabs (33, composition B) are no longer the exemplar. Nearest measured strip: editor tabs M 29 / C 35 (`extensions.json tabs[0] .rect.h`) |
| DS-HEIGHT-5 | The details Details/README strip is 36 px with its bottom line. | Rect height of the details `role=tablist`. | 1 | measurable | V57 | Unbound: the Extensions editor navbar is not in the dump. CSS-read 36 (`extensionEditor.css:372-378`); consistent with PNG `extEditorNavbar` (label ink centre 245.25, bottom line 263) |
| DS-HEIGHT-6 | Every text button (primary, secondary, toolbar, dialog, details pane) is 26 px: 12 px font, 16 px line box, padding 4/8, 1 px border, radius 4, in both looks. | Rect height of every `.nuiget-button`; computed font-size 12, line-height 16, padding 4 8, border-radius 4. | 0 | measurable | V1, V20 | M = C 26, 12px/16px, padding 4px 8px, radius 4px (`settings.json buttons[0]`) |
| DS-HEIGHT-7 | Inputs and selects match the control they stand for, in both looks: a search box (`sidebar-search-input`, `search-input`) 26 px; a select (`project-selector`, `source-selector`, `version-selector`) 26 px; every other text field (Add source, dialog fields) 25 px. | Rect heights of the listed test ids and of every `.nuiget-text-field`. | 0 | measurable | V1, V20 | M = C: Search view input 26 (`search.json search[0] .rect.h`), Extensions search box 26 (PNG `extSearchBox.h`), Settings select 26 (`settings.json settings[33]`), Settings input 25 (`settings[17]`), quick input 25 (`quickinput.json quickinput[1]`) |
| DS-HEIGHT-8 | An icon button paints a 22 px hover box (16 px glyph, padding 3) in rows, toolbars and main-panel headers, and a 20 px box (padding 2) in a sidebar section header; its pointer target stays at least 24 px through the element or an `::after`. | Rect of the painted hover background = 22 (20 in a section header); hit rect ≥ 24. | 0 / ≥ | measurable | V14 | M = C 22×22 pad 3 (`extensions.json ext_parts[23]`), 20×20 pad 2 (`explorer.json pane_headers[5]`) |
| DS-HEIGHT-9 | Every check box, the row check mark included, is 18 × 18 px with radius 3 in the `checkbox.*` colours; on a selected row the row check mark takes `checkbox.selectBackground` and `checkbox.selectBorder` (owner round 2, D52, the tree view's rule). | Rect of every check-box visual and `.nuiget-row-check` = 18 × 18; border-radius 3; on a selected row, computed fill and border = the two select keys. | 0; exact colour | measurable | V18, V47, P9.fix-3 | M = C 18×18 radius 3, border #3c3c3c, background #313131 (`settings.json settings[24]`); select keys set in all six themes, Dark Modern #202020 / #cccccc (`vars`) |
| DS-HEIGHT-10 | A count badge is the workbench count badge: min M 19 / C 18 px square, font M 10 / C 11 px, padding M 4/6 / C 3/5, radius M circle / C 11 px. A label badge (provisional, CPM, a TFM) keeps that font and those colours with padding M 4/6 / C 2/4 and radius M pill / C 2 px. | Rect ≥ min; computed font-size, padding, border-radius. | 0; font 0.1 | measurable | V17, V33, V47 | M 19×19, 10px, 4px 6px, 9999px / C 18×18, 11px, 3px 5px, 11px (`extensions.json pane_headers[4]`); label: M 4px 6px, 9999px / C 2px 4px, 2px (`badges[3]`, a hidden element: computed style only) |
| DS-HEIGHT-11 | The view progress bar is 2 px. | Rect height of `.nuiget-progress` = 2. | 0 | measurable | — | M = C 2 (`progressbar.css:8,14`, CSS-read); unbound until a loading or revalidating state is probed |

### ROW

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-ROW-1 | A comfortable row has the Extensions anatomy (owner round 1, composition A): 16 px start padding (after the check column in a multi-select list), a 36 px package icon with radius 2 centred vertically, a 16 px gap, then a text block centred vertically in the 72 px box. Browse rows have the Extensions row's three lines: line 1 the name 13/600 with its badges (20 px box); line 2 the description, 13 px muted, one line with an ellipsis (15 px box); line 3, 11 px muted on a 24 px line box, the version, the downloads and the authors with the Verified mark. Installed and Updates rows have no description (D14) and show two lines: the name with its badges, then the version (an update reads `old → new`), the authors with the Verified mark and the status. A description is also in the option's `aria-describedby` (T-27). Actions sit inside the band at its end (DS-INSET-3). | `.nuiget-row-icon` 36 × 36; `name.left − icon.right` = 16; icon centre y and text-block centre y = band centre y; three text lines in Browse rows, two in Installed and Updates rows. | 0 icon; 1 gap and centre | measurable | V10, P9.fix-3 | M = C: icon 36, radius 2 (`extensions.json ext_parts[1] .rect.w`, `.borderRadius`), margin-right 16 (`ext_parts[1] .margin[1]`), top 18 in 72; name 13px/600 on 18.2 in a 20 px header (`ext_parts[2..3]`); description 13px #9d9d9d, h 15 (`ext_parts[6]`); footer 26 with a 24 px line box, publisher 11px/600 (`ext_parts[7..9]`); the block runs 5.5–66.5 in 72, centred |
| DS-ROW-2 | Within one pane every row of a kind shares its icon x and its name x, whatever its section (direct, transitive, per project) and view (Installed, Updates, Browse): a row without a check box keeps the check column's space. | max − min of `icon.left` and of `name.left` over the comfortable rows of one pane, across its views. | 0 | measurable | V45, V58 | M = C: the Extensions list has one column grid (`extensions.json ext_rows`); today Δ 26 (CI PNG `main-transitive-expanded`, `main-browse-results`) |
| DS-ROW-3 | Hover, selection and the focus ring cover the whole row band, its actions included (composition A, owner round 1); selection beats hover. Main panel: the band is the full list width, radius M 4 / C 0. Sidebar: the band is inset M 4 px on each side / C 0, radius M 4 / C 0. | Painted background and outline rect of a hovered, a selected and a focused row = the wrapper (sidebar M: pane − 8 wide); a hovered selected row keeps the selection colour. | 0 | measurable | V2, V22, V32, V66, V69 | M: Explorer row x 53 w 290 in a 298 px pane, radius 4 (`M: explorer.json list_rows[0]`); editor list not inset, radius 4 (`M: settings.json settings[0]`); C: full width, radius 0; actions inside the row (`C: extensions.json ext_parts[10]` 314–342 inside 48–348) |
| DS-ROW-4 | A row shows at most three actions, visible on hover, on `:focus-within` and on the focused row; each has a key of the list. | Visible action buttons per row ≤ 3. | 0 | measurable | — | M = C: one visible action per Extensions row (`extensions.json ext_parts` with w > 0); "no more than three actions" (`views.md:64`) |
| DS-ROW-5 | The name truncates last: versions, badges and counts collapse or ellipsize first; the name ends in an ellipsis and its full id is in the tooltip and the accessible name. | At sidebar widths 170/200/250: `name.scrollWidth > name.clientWidth` only once version and badges are collapsed; computed `text-overflow: ellipsis`. | 0 | measurable | — | M = C: `text-overflow: ellipsis; min-width: 0` on the Extensions name (`extension.css:74-80`, CSS-read); unbound until the 170/200/250 states are probed |
| DS-ROW-6 | Comfortable rows hide parts by priority at the Extensions breakpoints of the list pane: at most 250 px the icon is 24 px; at most 200 px it is hidden; the name still truncates last; nothing scrolls sideways. | At list-pane widths 260/240/190: icon 36 → 24 → none. | 0 | measurable | V50 | M = C: `.narrow` ≤ 250 and `.mini` ≤ 200 (`extensionsViewlet.ts:740-741`, `extensionsViewlet.css:217-237`, CSS/TS-read); unbound until narrow main states are probed |

### TYPE

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-TYPE-1 | UI text uses the workbench font (`--vscode-font-family`); only code uses the editor font. | Computed font-family of every text node = the root's, except `code`, `pre` and README code. | exact | measurable | — | M = C: `extensions.json ext_rows[0] .fontFamily` = the webview body font (`vars` bodyFont) |
| DS-TYPE-2 | Every font size is a step of the ramp {10, 11, 12, 13, 18, 26} px; README body text follows the Markdown preview and is exempt. | Computed font-size of every text element outside `.nuiget-readme`. | 0.1 | measurable | V17, V25, V49 | M = C: `--vscode-fontSize-*` heading1 26, heading2 18, body1 13, label1 12, body2 11, label3 10 (`vars`) |
| DS-TYPE-3 | Two weights, 400 and 600; 700 only on classic section titles and main-list group headers. | Computed font-weight outside `.nuiget-readme` ∈ {400, 600}; 700 only on `.nuiget-section-title` and main-list group headers without the Modern UI attribute. | exact | measurable | V49, V61 | M 600 / C 700 on pane-header titles (`extensions.json pane_headers[3] .fontWeight`); `--vscode-fontWeight-*` 400/600 (`vars`) |
| DS-TYPE-4 | Body line height is 1.4 (18.2 px at 13 px); a single-line row, header or control sets a fixed line box equal to its content height (row 22, pane header M 28 / C 22, text button 16). | Computed line-height of the roots = 18.2; of compact rows = 22. | 0.5 | measurable | — | M = C 18.2 (`extensions.json ext_rows[0] .lineHeight`); rows 22 (`explorer.json list_rows[0] .lineHeight`); pane header M 28 / C 22 (`pane_headers[3] .lineHeight`) |
| DS-TYPE-5 | Casing follows the host. Sidebar section titles and main-list group headers (Direct Packages, Transitive Packages, a project; one grouped list per view, owner round 1) take the pane-header type: M 12 px, 600, capitalize in a 28 px header (uppercase when the host mirrors `modernUIUppercaseViewHeaders`) / C 11 px, 700, uppercase in 22 px. Details group headers: 13 px, 600, no transform. | Computed text-transform, font-size and font-weight of `.nuiget-section-title` and of every main-list group header = the probe's `.pane-header .title` of the same look; details group headers 13/600/none. | exact | measurable | V49 | M 12px/600/capitalize / C 11px/700/uppercase (`extensions.json pane_headers[3]`) |
| DS-TYPE-6 | Secondary text is `descriptionForeground`: versions, authors and metadata at 11 px, a publisher or author emphasis at 11/600, a Browse description at 13 px. | Computed size and colour of `.nuiget-row-version`, `-authors`, `-meta` (11), `-description` (13). | 0.1 | measurable | — | M = C: publisher 11px/600 #9d9d9d (`extensions.json ext_parts[9]`); description 13px #9d9d9d (`ext_parts[6]`) |
| DS-TYPE-7 | The panel title is 13/600; the details title and the dialog title are 18/600 (Heading2). | Computed size and weight of `.nuiget-main-title` (13/600), `.nuiget-details-title` and `.nuiget-dialog-title` (18/600). | 0.1 | measurable | V49, V61 | M = C: heading2 18, semiBold 600 (`vars`); upper bound Settings group title 26px/600 (`settings.json settings[9]`) |
| DS-TYPE-8 | A relative font size (em, %) goes on leaf text only, never on a container that holds a Badge or other sized text; the type tokens are px, so no size compounds. | Lint: no `em` or `%` font-size in a webview stylesheet outside the README rules; probe: every `.nuiget-badge` computes the badge size wherever it sits. | 0.1 | measurable | V17 | M 10 / C 11 (`extensions.json pane_headers[4] .fontSize`); today the sidebar header badge computes 9.39 (`rules-bound` DS-HEIGHT-10) |
| DS-TYPE-9 | Every heading outside the README sets its weight explicitly; none falls back to the UA's 700. | Computed font-weight of `h1`–`h4` outside `.nuiget-readme` ∈ {400, 600} (700 only per DS-TYPE-3). | exact | measurable | V61 | M = C: workbench headings set their weight (Settings group title 600, `settings.json settings[9] .fontWeight`) |

### ICON

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-ICON-1 | Every glyph is a codicon drawn from the pinned `@vscode/codicons` release (the release the icon item pins); no custom glyph where a codicon exists. | Lint: each icon in `icons.tsx` names its codicon, and its path `d` and viewBox equal `src/icons/<name>.svg` of the pinned release; `/** Custom:` entries = 0. | exact | measurable | V13, V62, V65 | M = C: Modern UI changes no glyph (modern-ui.md §1.3); a host-matched release is unsatisfiable (the 1.90 floor draws the pre-redraw glyphs, 1.142 the redrawn ones) |
| DS-ICON-2 | Action, header and twisty glyphs are 16 px in `icon.foreground`; compact inline marks 12 px. | Rect 16 × 16 of `.nuiget-icon-button svg`; computed colour = `--vscode-icon-foreground`. | 0; exact colour | measurable | V46 | M = C: codicon 16 / compact 12 (`vars --vscode-codiconFontSize*`); action glyph #cccccc = icon.foreground (`extensions.json ext_parts[23] .color`) |
| DS-ICON-3 | The package icon is 36 px with radius 2; 24 px when the list pane is at most 250 px wide; hidden at most 200 px (DS-ROW-6). | As DS-ROW-1 and DS-ROW-6. | 0 | measurable | V10 | M = C 36, radius 2 (`extensions.json ext_parts[1]`) |
| DS-ICON-4 | The Verified mark is codicon `verified-filled` in `extensionIcon.verifiedForeground`, 12 px beside an author and 16 px beside a title. | Glyph name in the DOM (`data-codicon`) and computed colour = `--vscode-extensionIcon-verifiedForeground`. | exact | measurable | V51, V62 | M = C #4daafc in Dark Modern (`vars`); the colour equals `textLink.foreground` in three probed themes, so the glyph check carries the rule (`rules-bound` DS-ICON-4) |
| DS-ICON-5 | Icons are delivered as inline SVG generated by a script from the pinned codicon release, with the CC-BY-4.0 attribution; the codicon font stays the costed alternative. | A delivery decision; DS-ICON-1's lint holds for either route. | — | judge-only | V13 | DECISIONS.md 2026-10-23 "Icon delivery" |

### COLOR

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-COLOR-1 | Every painted colour resolves, through a `--nuiget-color-*` token, to the `--vscode-*` key of its role in the colour-role table (§4), in all six themes. | Per role and theme: computed colour of the role's element = the resolved value of its key (`tokens.json` `resolved`). | exact | measurable | V40, V63 | M = C: both runs dumped identical `--vscode-*` values (`vars`, 0 differences) |
| DS-COLOR-2 | Selection follows list focus: the selected row (single-select) or the current row (multi-select) takes `list.activeSelection*` while the listbox contains focus and `list.inactiveSelection*` otherwise; selection beats hover; the row check mark on that row takes `checkbox.select*` (DS-HEIGHT-9, D52). | Focus outside the list: computed background of `[aria-current=true]` (multi) or `[aria-selected=true]` (single) = `list.inactiveSelectionBackground`; inside = active; a hovered selected row keeps the selection colour. | exact | measurable | V12, V22, V23 | M = C active #04395e (`extensions-states.json selected .background`), inactive #37373d (`vars`); unbound until the unfocused state is probed |
| DS-COLOR-3 | An icon button paints `toolbar.hoverBackground` in its hover box on hover and `toolbar.activeBackground` while pressed or toggled on; high contrast draws a 1 px dashed `toolbar.hoverOutline` instead. | Computed background of a hovered `.nuiget-icon-button` = `--vscode-toolbar-hoverBackground`. | exact | measurable | V46 | M = C rgba(90, 93, 94, 0.31) in Dark Modern (`vars`); unbound until a hover state is probed |
| DS-COLOR-4 | Tabs use the panel title colours: other tabs `panelTitle.inactiveForeground`, the selected tab `panelTitle.activeForeground` with a 1 px `panelTitle.activeBorder` underline. | Computed colours of `role=tab`; underline thickness 1. | exact; 0 | measurable | V56 | M = C indicator 1 px (PNG `settingsHeader.indicatorH`, `extEditorNavbar.indicatorH`); #cccccc / #9d9d9d / #0078d4 in Dark Modern (`vars`) |
| DS-COLOR-5 | `focusBorder` marks keyboard focus of controls and nothing else: no accent stripe, no tab underline, no sash hover; rows ring in `list.focusOutline` (DS-FOCUS-2). | Lint: `--nuiget-color-focus` appears only in `outline*` declarations; probe: no unfocused element paints it. | exact | measurable | V12, V16 | M = C: focused input outline 1px solid #0078d4 (`quickinput.json quickinput[1] .outline`) |
| DS-COLOR-6 | A disabled text button is drawn at opacity 0.4, as the workbench's text button (owner round 2, D51); every other disabled text (action labels, icon-button glyphs, row names, labels) uses `disabledForeground` without opacity. | Computed opacity of a disabled `.nuiget-button` = 0.4; computed colour of disabled action labels, icon-button glyphs and names = `--vscode-disabledForeground`. | exact | measurable | V38 | M = C: `.monaco-button.disabled { opacity: 0.4 }` (`button.css:40-43`, CSS-read; the label reads 2.8:1 in Dark Modern, round 2); disabled action rgba(204, 204, 204, 0.5) (`extensions.json ext_parts[11] .color`) |
| DS-COLOR-7 | A secondary button has a hover state in `button.secondaryHoverBackground`. | Hovered `.nuiget-button--secondary` background = the key and ≠ its rest background. | exact | measurable | V38, V46 | M = C #2b2b2b in Dark Modern (`vars`); unbound until a hover state is probed |

### RADIUS

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-RADIUS-1 | Every control (text button, select, text field, search box) has a 4 px radius in both looks. | Computed border-radius of `.nuiget-button`, selects, `.nuiget-text-field` and the search inputs = 4. | 0 | measurable | V20 | M = C 4: button (`settings.json buttons[0]`), select (`settings[33]`), input (`settings[17]`), Search view input (`search.json search[0]`) |
| DS-RADIUS-2 | Every other radius follows the element and the look: check box 3; package icon 2; icon-button hover box M 4 / C 6; row band M 4 / C 0; popup row M 4 / C 3; sidebar section header M 4 / C 0; count badge M circle / C 11; label badge M pill / C 2; layer (dialog, popover, quick-search popup) M 8 / C 12; a field inside a layer M 4 / C 6; scrollbar thumb M 4 / C 0. | Computed border-radius per element kind = the `radius-*` tokens of `tokens.json`. | 0 | measurable | V47 | 3 (`settings.json settings[24]`); 2 (`extensions.json ext_parts[1]`); M 4 / C 6 (`ext_parts[23]`); M 4 / C 0 (`explorer.json list_rows[0]`); M 4 / C 3 (`quickinput.json quickinput[3]`); M 4 / C 0 (`pane_headers[0]`); M 9999 / C 11 (`pane_headers[4]`); M 9999 / C 2 (`badges[3]`); M 8 / C 12 (`quickinput[0]`); M 4 / C 6 (`quickinput[1]`); scrollbar CSS-read (`roundedCorners.css`) |

### DENSITY

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-DENSITY-1 | Density belongs to the surface, with no user toggle: the sidebar is compact (22 px one-line rows, no icons, no descriptions), the main list comfortable (72 px Extensions rows), the details pane uses editor spacing (20 px header inset). | Row heights per DS-HEIGHT-2/3; no density setting in `package.json`. | exact | measurable | V68 | M = C 22 / 72 (`explorer.json list_rows[0]`, `extensions.json ext_rows[0]`) |
| DS-DENSITY-2 | When the host runs Modern UI with `window.density.layout: compact`, the webviews follow it: adopted as one token under `data-density="compact"` (sidebar row inset 2). | Judge-only until a compact capture exists. | — | judge-only | — | M compact: rows inset `size20`, margins 0 (`padding.css:71-74`, CSS-read); C: none |

### OVERFLOW

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-OVERFLOW-1 | No surface scrolls sideways at its host minimum: the sidebar at 170 px, the editor at 220 px. | At sidebar widths {170, 200, 250, 300} and main widths {220, 400, 600, 800}: `scrollWidth ≤ clientWidth` for the root and every non-list container. | 0 | measurable | V50 | M = C: side-bar part minimum 170 (`sidebarPart.ts:48`), editor minimum 220 (`editor.ts:29`), TS-read; unbound until the narrow states are probed |
| DS-OVERFLOW-2 | No sibling collision: in every container of the overflow table (§8) no two children's rects intersect and every child lies inside the parent's content box. | Pairwise intersection area = 0; `child.right ≤ parent.right − padding-right`. | 0 | measurable | V3, V42 | M = C: `min-width: 0` plus ellipsis rows (`extension.css:65-80`, CSS-read); bound by UX-P0.18 (run 40111706433): the Unsupported header's badge reads 329.6–399.8 in a box ending 399.8, 0 offending; V3 is carried by DS-INSET-3 (c) and DS-INSET-2 |
| DS-OVERFLOW-3 | Every container that holds a row of controls declares a minimum width and one overflow behaviour (wrap, icon-only, overflow menu, hide by priority), as the overflow table (§8) gives them. | Per container at its declared minimum: every control reachable (visible or in an overflow menu); DS-OVERFLOW-1/2 hold. | 0 | measurable | V50 | M = C: view-title actions overflow to `...`; Extensions `.narrow`/`.mini` (`extensionsViewlet.ts:740-741`, TS-read) |
| DS-OVERFLOW-4 | The sidebar view title shows at most four navigation actions; the rest go to the `...` menu. | Visible `view/title` navigation items of `nuiget.sidebarView` ≤ 4. | 0 | measurable | — | M = C 4: Explorer pane-header actions (`explorer.json pane_headers` action items with w > 0); nUIget today 6 (`C: with-main-installed-single.json sidebar_title`) |
| DS-OVERFLOW-5 | Split bounds are pixels: the list pane never goes below its toolbar's min-content width and the details pane never below its header's. | `layout/set` clamps `splitPosition` so both panes keep their min-content widths. | 1 | measurable | V50 | M = C: part minimums are pixels (`editor.ts:29`, `sidebarPart.ts:48`, TS-read) |
| DS-OVERFLOW-6 | The webview document never scrolls: lists and panes scroll, the root does not, at every width and in every state (a layer's scrim covers the viewport without extending it). | `documentElement.scrollHeight ≤ clientHeight` and `scrollWidth ≤ clientWidth` in every named state; the line names the deepest element outside the viewport that no scroller contains. | 0 | measurable | V72 | M = C: the Extensions view scrolls its list (`.monaco-list`), never the view pane (TS/CSS-read; the probe has no field) |

### STATE

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-STATE-1 | Every screen defines its loading-first, revalidating, empty, error, partial and unsupported state (§9), each with its `data-testid` marker and a named capture. | Each matrix cell renders its marker; the capture list names it. | exact | measurable | — | Interaction model §4; the captures hold 13 ready states and no loading, empty or error state (`ux-inventory.md` §1.4) |
| DS-STATE-2 | Progress shows where the work is: a 2 px indeterminate bar at the top of the list or pane that loads or revalidates, never a progress notification for a single operation. Browse shows its rows first under the bar and fills in icons, authors and downloads as the enrichment arrives (owner round 2, D56). Installed, Updates, Transitive and the details pane add three skeleton rows and a "Loading …" status line under the bar on a first load. A revalidation keeps the rows. | `.nuiget-progress` present at the list top while loading or revalidating; in Browse, rows render before the enrichment completes and no skeleton shows; no `withProgress(Notification)` for a single operation. | exact | measurable | — | M = C: view progress at the pane header's bottom (`paneviewlet.css:78-87`, CSS-read), 2 px (DS-HEIGHT-11); the Extensions view lists results under its bar before their details and keeps them on a new query (`performance.md` finding 6) |
| DS-STATE-3 | An empty state follows welcome-view content: left-aligned sentences, 20 px side padding, 8 px between blocks, at most one primary button, full width up to 300 px; links rather than buttons. | Computed text-align start; padding-inline 20; ≤ 1 button; button width = min(container − 40, 300). | 1 | measurable | — | M = C: SCM welcome button inset 20/20, w 260 in a 300 px pane (`scm.json buttons[0]`); `views.css:92-130` (CSS-read) |
| DS-STATE-4 | Errors are inline, in the area that failed: a severity glyph (`error`, `warning`, `info` in `problems*Icon.foreground`), one sentence, at most one action (Retry); toasts are kept for operation failures. | The inline error holds one severity codicon, text and ≤ 1 button. | exact | measurable | V40 | M = C: Extensions view message container, severity icon + message (`extensionsViewlet.css:179-191,250-260`, CSS-read) |
| DS-STATE-5 | A successful single operation is confirmed in place (row state, button label) and through the live region, not by a toast; toasts stay for failures, partial bulk results and long bulk runs (owner round 1, D-E). | Information notifications after a successful single install, update or uninstall = 0; `status-live` text present. | exact | measurable | — | M = C: Extensions Install/Update announce through `alert(…)` without a notification (`extensionsActions.ts:45,611,1047`, TS-read) |
| DS-STATE-6 | A pending operation changes its control in place: the "-ing" label (Installing, Updating, Uninstalling, Restoring) or a 16 px spinner where the row actions were; the row is `aria-busy`. | Busy row: spinner or "-ing" text; `aria-busy=true`. | exact | measurable | — | M = C: the disabled "Installing" action label (`extensions.json ext_parts[16] .text`) |
| DS-STATE-7 | Every disabled affordance says why in text, visible or through `aria-describedby`. | Each `aria-disabled` row and disabled button has a non-empty description. | exact | measurable | — | Visual Studio's NuGet manager: "Implicitly referenced by an SDK…" (design-rules DS-STATE-7); no workbench field |

### FOCUS

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-FOCUS-1 | Focus rings are 1 px solid `focusBorder`: offset −1 on inputs, selects, tabs and the main-panel group header, −2 on the Modern UI sidebar section header, +2 on check boxes and text buttons. | Computed outline-width 1 and outline-offset per control kind. | 0 | measurable | — | M = C: focused input 1px solid #0078d4 (`quickinput.json quickinput[1] .outline`); `.monaco-text-button:focus { outline-offset: 2px }` (`button.css:32-34`); M pane header −2 (`paneHeaders.css`, CSS-read) |
| DS-FOCUS-2 | The focused row (the active row of a focused listbox) rings in 1 px `list.focusOutline` at offset −1 around the whole band, actions included, following the band radius. | Computed outline colour of the focused row band = `--vscode-list-focusOutline`. | exact | measurable | V32 | M = C 1px solid #0078d4 on the clicked Extensions row (`C: extensions-states.json selected .outline`); equal to `focusBorder` in all six themes (`vars`), so the colour test cannot tell the keys apart |
| DS-FOCUS-3 | Focus after a pointer click follows the surface and the look (premise P-3): the sidebar (a side-bar surface) draws rings for keyboard focus only under Modern UI and also after a click in the classic look; the main panel (an editor surface) draws them after a click in both looks; a text field shows its ring on any focus. | After a WebDriver click on a row and on a tab: outline present (classic sidebar; main panel in both looks) or absent (Modern UI sidebar). | exact | measurable | — | C: clicked Extensions row 1px solid #0078d4 (`C: extensions-states.json selected .outline`); M: `none 0px` (`M: extensions-states.json selected .outline`); `keyboardFocusOnly.css` scopes Modern UI's rule to side bar, panel, auxiliary bar and status bar, "so editor and global widget focus rings are unaffected" |
| DS-FOCUS-4 | High contrast draws state as lines in `contrastActiveBorder`: the selected row 1 px dotted, a hovered row 1 px dashed, a hovered icon button 1 px dashed `toolbar.hoverOutline`, focus solid. | HC capture: selected row dotted, hovered row dashed. | exact | measurable | V33, V56 | M = C: HC list styles (`listWidget.ts:995-1010`, TS-read); unbound until HC hover and selection states are probed |

### MOTION

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-MOTION-1 | Transitions take 100 ms (hover and focus colours) or 150 ms (expand, collapse, layer entry), ease-out; loops use the workbench timings: spinner 1.5 s in 30 steps, indeterminate progress 4 s linear. | Computed transition-duration ∈ {100, 150} ms; spinner `animation` 1.5s steps(30); progress 4s linear. | exact | measurable | V48 | M = C: pane animation 0.15 s ease-out (`paneview.css:119-124`), indent guides 0.1 s (`tree.css:36-38`), codicon-spin 1.5s steps(30) (`codicon-modifiers.css`), progress 4s (`progressbar.css:33-38`), CSS-read |
| DS-MOTION-2 | Reduced motion follows both signals, `prefers-reduced-motion: reduce` and `body.vscode-reduce-motion` (VS Code sets it when `workbench.reduceMotion` resolves on, at the 1.90 floor too): every transition and animation stops, loops included: the skeleton is static, the spinner shows the still `loading` glyph, the indeterminate stripe stands at the start (decision T-9). | With `workbench.reduceMotion: on`: computed `--nuiget-duration-fast`, `-normal`, `-spin`, `-progress` = 0ms; `document.getAnimations()` has no running animation. | exact | measurable | V48 | M = C: `body.vscode-reduce-motion` (`webview-pre-index.html:511-512`); the workbench zeroes pane transitions (`paneview.css:126`) but keeps its spinner and progress bar moving (no reduce-motion rule in `codicon-modifiers.css`, `progressbar.css`): nUIget departs there for `a11y-reduced-motion-both-signals` |

### COPY

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-COPY-1 | Button, tab, menu, command and group-header labels are Title Case: every word capitalised except a, an, the, and, or, of, in, on, to, for, at, by, with, from, as when not first. Tooltips, messages, banners and empty states are sentence case. | Regex over the rendered labels of `button`, `role=tab`, menu items and group headers with that minor-word list. | exact | measurable | — | M = C: "Backup and Sync Settings", "Add Pattern" (`settings.json buttons[0..1] .text`), "Open Repository" (`scm.json buttons`) |
| DS-COPY-2 | Label–value pairs have no colon and one noun per field ("Authors", never "Author(s)"). | Regex: no details label ends in ":"; "Author(s)" absent. | exact | measurable | — | M = C: Extensions editor More Info "Identifier", "Version", "Last Updated" without colons (`extensionEditor.ts:1148-1212`; PNG of the quick-input screenshot) |
| DS-COPY-3 | Messages are whole sentences that end with a period; an empty state names its condition in one sentence; live-region announcements may drop the period. | Regex on EmptyState and Banner text: ends with ".". | exact | measurable | — | M = C: "No extensions found."-style welcome messages (`views.md:72-86`) |
| DS-COPY-4 | A label that opens further UI (a dialog, a picker, a menu) ends with "..." in three ASCII periods. | Regex: such labels end with "..." and contain no U+2026. | exact | measurable | — | M = C: "New File...", "Install from VSIX..." (`explorerView.ts`, `extensionsActions.ts:232`) |
| DS-COPY-5 | One count style per surface: a count badge in pane and tab headers, "N of M" text only while filtering, never a badge and "(N)" together. | No header shows both a badge and "(N)" text. | exact | measurable | — | M = C: pane-header count badge (`extensions.json pane_headers[4] .text` "1") |

### DIVIDER

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-DIVIDER-1 | No line between rows; lines only between groups: above every sidebar section header and every main-list group header but the first (M a 1 px separator inset 4 px / C a full-width 1 px top border; one grouped list per view, owner round 1). | Rows with a non-zero bottom border = 0; the first section or group header has no line; later ones have one. | 0 | measurable | V35, P9.fix-3 | M: border none plus an inset `::before` separator (`M: extensions.json pane_headers[5] .border` 0; `paneHeaders.css`, CSS-read); C: first header 0, later 1px #2b2b2b (`C: pane_headers[0]`, `[5] .border`) |
| DS-DIVIDER-2 | Only layers above the page are elevated (dialog, popover, quick-search popup): a 1 px `widget.border` and the native hover's shadow `0 2px 8px widget.shadow`; page content has no shadow and no stripe. | Computed box-shadow non-none only on `.nuiget-dialog`, `.nuiget-popover`, `.nuiget-search-popup`. | exact | measurable | V12 | M = C: the quick input is elevated (`quickinput.json quickinput[0] .boxShadow` 0 0 20px, a token webviews do not get); hover shadow 0 2px 8px (GitLens `tokens.scss:111`, "byte-identical to VS Code's native hover") |
| DS-DIVIDER-3 | The quick-search popup groups its items with quick-pick separators: a 1 px `pickerGroup.border` line above every group but the first, the group label in 11 px `descriptionForeground` and normal case at the end of the group's first row. | Computed text-transform of `.nuiget-search-group-header` = none; a top border on every group but the first. | exact | measurable | V62 | M = C: separator top border 1px #3c3c3c (`quickinput.json quickinput[16] .border`), label 11px #9d9d9d (`quickinput[10]`) |
| DS-DIVIDER-4 | The main panel has one divider role: the header/body line, the tab-strip line and group separators use `settings.headerBorder` (then `panelSection.border`, `panel.border`); layers keep `widget.border`; the sidebar keeps `sideBarSectionHeader.border`. | Computed border colours of the search row's bottom, the tab strip's bottom and group separators are equal and = the key. | exact | measurable | V63 | M = C #2b2b2b in Dark Modern (PNG `settingsHeader.borderColour`; `vars --vscode-settings-headerBorder`) |
| DS-DIVIDER-5 | A modal backdrop dims with black at 50 % (`rgba(0, 0, 0, 0.5)`) in every theme, as the workbench's modal block; forced colours keep `Canvas`. | Computed background of the scrim = rgba(0, 0, 0, 0.5); the composite under it is darker than the surface it covers in all six themes. | exact | measurable | V19 | M = C: `.monaco-dialog-modal-block.dimmed { background: rgba(0, 0, 0, 0.5) }` (`dialog.css:19-20`, CSS-read by the visual audit); unbound until a dialog state is probed |
| DS-DIVIDER-6 | A split between panes is a 1 px separator in `settings.sashBorder` with a 4 px transparent sash centred on it (its pointer target widened to 24 px); the sash paints `sash.hoverBorder` only after the pointer rests on it 300 ms, or while it is dragged. | Computed background of `.nuiget-sash` at rest = transparent; separator 1 px; the hover colour appears no sooner than 300 ms. | 0; 50 ms | measurable | V16 | M = C: 4 px sash (`sash.css:105-125`), 300 ms hover delay (`sash.ts:154`), separator (`splitview.css:52-65`), CSS/TS-read; unbound until a split state is probed |

### SCROLL

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-SCROLL-1 | Scrollbars are the token scrollbars on every host from the 1.90 floor (Chromium 122, owner round 2, D54): M 8 / C 10 px thick, the thumb in `scrollbarSlider.*` with radius M 4 / C 0, the track transparent over the surface it scrolls, drawn by the `::-webkit-scrollbar` rules; beside them the root declares `scrollbar-color: auto`, so the host's inherited `html { scrollbar-color }` no longer switches them off (T-28). `scrollbar-color` is plain CSS at the lint's new threshold 122 (Chromium 121): no allowlist entry. | `el.offsetWidth − el.clientWidth` = the scrollbar size for a scrolling list; computed `scrollbar-color` of `:root` = `auto`; thumb background = `scrollbarSlider.background`. | 0 | measurable | V15 | M 8 (`MODERN_UI_SCROLLBAR_SIZE`, `modernUI.contribution.ts:22`) / C 10 (`DEFAULT_SCROLLBAR_SIZE`, `scrollableElement.ts:27`; the webview default `::-webkit-scrollbar` 10px, `webview-pre-index.html:188-191`), TS/CSS-read; the host's `html { scrollbar-color }` (`webview-pre-index.html:119`) overrides WebKit rules from Chromium 121 (V15); unbound until the UI job probes it |
| DS-SCROLL-2 | A list scrolled away from its start shows the workbench's scroll shadow on its top edge: an inset `0 6px 6px -6px` shadow in `scrollbar.shadow`. | Computed box-shadow of the list's top decoration while `scrollTop > 0`. | exact | measurable | — | M = C: `box-shadow: var(--vscode-scrollbar-shadow) 0 6px 6px -6px inset` (`scm.css:387`, the SCM scroll decoration, CSS-read); the role "indicates that the view is scrolled" (`theme-color.md:192`); Modern UI's `scrollShadows` module was not read |

### LOOK

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-LOOK-1 | The webviews follow the host's look. The host writes `data-look` on `<html>` (`modern` when `workbench.experimental.modernUI` is true, otherwise `classic`), `data-density` (`compact` or `default`, from `window.density.layout`) and `data-uppercase-headers` when `workbench.experimental.modernUIUppercaseViewHeaders` is true (ADR-011 Decision 2); `tokens.css` switches only the tokens of the look table (§6) on those attributes; no component reads the setting. Without the attributes every token computes its classic value. | For each row of §6: the computed value under each attribute = the measured value of that look. | exact | measurable | — | `modernUI.contribution.ts` toggles `modern-ui*` on `.monaco-workbench` only, never inside a webview (modern-ui.md §1.2); `M: extensions.json __document.workbenchClass` holds `modern-ui` |

### HC

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-HC-1 | In high contrast every boundary that is a colour difference elsewhere becomes the workbench's line: a count or label badge gets a 1 px `contrastBorder`; tabs draw no box, the selected tab a solid and a hovered tab a dashed 1 px `contrastActiveBorder` outline; rows and icon buttons per DS-FOCUS-4. | HC capture: badge border 1 px = `--vscode-contrastBorder`; other tabs have no border. | exact | measurable | V33, V56 | M = C: the count badge's HC border (`defaultCountBadgeStyles`, TS-read by the visual audit); composite-bar tab outlines (visual audit V56); unbound until HC states are probed |

### ALIGN

| Id | Rule | Measurement | Tolerance | Status | Catches | Workbench reference (M / C, probe field) |
|---|---|---|---|---|---|---|
| DS-ALIGN-1 | Label–value pairs share one value column: a two-column grid with a max-content label column. | max − min of the value lefts in one facts block = 0. | 0 | measurable | V59 | M = C: Extensions editor More Info is a two-column table (`extensionEditor.ts:1148-1212`, TS-read) |

Rule count per area: GRID 3, INSET 4, HEIGHT 11, ROW 6, TYPE 9, ICON 5, COLOR 7, RADIUS 2, DENSITY 2, OVERFLOW 5,
STATE 7, FOCUS 4, MOTION 2, COPY 5, DIVIDER 6, SCROLL 2, LOOK 1, HC 1, ALIGN 1 = **83**. Judge-only: DS-ICON-5,
DS-DENSITY-2. Unbound until a state is probed (measurable, no number yet): DS-HEIGHT-4, DS-HEIGHT-5, DS-HEIGHT-11,
DS-INSET-4, DS-ROW-5, DS-ROW-6, DS-COLOR-2, DS-COLOR-3, DS-COLOR-7, DS-OVERFLOW-1, DS-OVERFLOW-2, DS-FOCUS-4,
DS-DIVIDER-5, DS-DIVIDER-6, DS-SCROLL-1, DS-HC-1; and every DS-STATE rule until its cell is captured.

## 2. The three premises, decided by rule

The exemplar fails three rule premises in the classic look; the closest-to-the-workbench rule decided them
(DECISIONS.md 2026-10-23, "Rule premises the exemplar itself fails"). The Modern UI probe now supports two of them.

| Premise | Rule | Statement | Decision reference and evidence |
|---|---|---|---|
| P-1 Block gaps | DS-GRID-2 | Blocks of one column are 4 px apart inside a group and 8 px between groups; no other gap. | DECISIONS.md 2026-10-23. Classic measures 5 and 10 (`rules-bound` DS-GRID-2); Modern UI pads the Extensions header 4/8/4/8 (`M: extensions.json ext_search[0] .padding`): the exemplar is 4-based in the primary look |
| P-2 Symmetric insets | DS-INSET-2 | Every header, toolbar and control row has equal start and end insets and equal top and bottom padding. | DECISIONS.md 2026-10-23. Classic Extensions header 5/12/6/20 (`C: ext_search[0]`); Modern UI 4/8/4/8, symmetric per axis (`M: ext_search[0]`); Settings item 24/24 in both (`settings.json settings[10]`) |
| P-3 Focus rings per look | DS-FOCUS-3 | Classic: rings after a pointer click too. Modern UI: keyboard only on the sidebar; the main panel, an editor surface, keeps rings after a click in both looks. | DECISIONS.md 2026-10-23, refined by T-4 and adopted (DECISIONS.md "Focus rings per look"): `keyboardFocusOnly.css` scopes the Modern UI rule to side bar, panel, auxiliary bar and status bar. C: `extensions-states.json selected .outline` 1px solid; M: none |

## 3. Tokens

`tokens.json` is the reference (171 tokens: space 19, radius 17, size 23, type 12, weight 4, motion 7, opacity 1, z 2,
colour 86; 26 switched by the look). `src/webview/shared/tokens.css` was copied from the generator's CSS at UX-P1.1 and differs in the five values `docs/plans/STATUS-ux.md` names for P1.5. `tokens.json` is written
by the committed generator, `docs/design/tools/build.mjs` from the spec `docs/design/tools/spec.mjs`, and resolve every
colour per theme from the probe dumps (`node docs/design/tools/build.mjs <dir holding probe/out and probe/out-modern> <timestamp>`).

### Token changes (old → new)

| Token | Old | New | Reason |
|---|---|---|---|
| `--nuiget-space-1..6` | 2, 4, 6, 8, 12, 16 px literals | `var(--vscode-spacing-size20..160, <px>)` | DS-GRID-3 (same px on every host) |
| `--nuiget-space-7` | — | `var(--vscode-spacing-size200, 20px)` | details inset, empty-state padding, classic sidebar inset |
| `--nuiget-radius-sm` | 2px | `var(--vscode-cornerRadius-small, 4px)` | DS-RADIUS-1; the names now follow the workbench tiers xs 2, sm 4, md 6, lg 8, xl 12 (T-7). Every current use moves to a semantic token: controls (`.nuiget-button`, `.nuiget-main-select`, `.nuiget-main-search-input`, `.nuiget-sidebar-search`, `.nuiget-input`, `.nuiget-readme-copy`) → `radius-control` (4); `.nuiget-row-check`, `.nuiget-dialog input[type=checkbox]` → `radius-checkbox` (3); `.nuiget-search-popup` → `radius-layer`; `.nuiget-skeleton-row`, `.nuiget-readme img/code/pre` → `radius-xs` (2, unchanged) |
| `--nuiget-radius-md` | 4px | `var(--vscode-cornerRadius-medium, 6px)` | same; current uses: `.nuiget-icon-button` → `radius-action`; `.nuiget-badge` → `radius-badge` / `radius-label-badge`; `.nuiget-dialog`, `.nuiget-popover` → `radius-layer`; `.nuiget-row-icon svg` → `radius-xs` |
| `--nuiget-row-height-compact` | 24px | 22px | DS-HEIGHT-2; `Listbox.tsx` `ROW_HEIGHT` changes with it (the tokens lint pins equality) |
| `--nuiget-row-height-comfortable` | 78px | 72px | DS-HEIGHT-3 (owner round 1, composition A: D15's card retired); `Listbox.tsx` `ROW_HEIGHT` too |
| `--nuiget-icon-size-sm`, `-md` | 12px, 16px | `var(--vscode-codiconFontSize-compact, 12px)`, `var(--vscode-codiconFontSize, 16px)` | DS-GRID-3 |
| `--nuiget-icon-size-lg` | 24px (unused, V64) | 24px | now the narrow package icon (DS-ROW-6) |
| `--nuiget-icon-size-xl` | 32px | 36px | DS-ROW-1, DS-ICON-3 |
| `--nuiget-scrollbar-size` | 10px | 10px, Modern UI 8px | DS-SCROLL-1 |
| `--nuiget-duration-normal` | 200ms | 150ms | DS-MOTION-1 |
| `--nuiget-font-size-sm` | 0.85em | `var(--vscode-fontSize-body2, 11px)` | DS-TYPE-2/8 (em compounded to 9.39 px, V17); ADR-008 amendment (em → px) |
| `--nuiget-font-size-md` | 1em | `var(--vscode-fontSize-body1, 13px)` | same |
| `--nuiget-font-size-lg` | 1.15em (14.95 px) | `var(--vscode-fontSize-heading2, 18px)` | DS-TYPE-2/7 |
| `--nuiget-color-scrim` | `color-mix(in srgb, editor.background 60%, transparent)` | `rgba(0, 0, 0, 0.5)` | DS-DIVIDER-5 (V19) |
| `--nuiget-color-section-header-bg` | `var(--vscode-sideBarSectionHeader-background)` | adds `sideBar.background` as fallback; Modern UI `sideBar.background` | DS-LOOK-1 (`paneHeaders.css`) |
| `--nuiget-color-list-active-bg`, `-inactive-bg`, `-button-secondary-bg`, `-blockquote-bg` | no fallback | `…, transparent` | T-21: explicit fallbacks where a high-contrast theme leaves the key unset; no rendering change |
| `--nuiget-color-list-active-fg` | no fallback | `…, var(--vscode-foreground)` | same |
| `--nuiget-color-border` | layers and dividers | layers only | DS-DIVIDER-4: dividers move to `--nuiget-color-divider` |
| `--nuiget-color-focus` | focus, row accent, tab underline, sash hover | keyboard focus of controls only | DS-COLOR-5: rows use `--nuiget-color-list-focus-outline`, tabs `--nuiget-color-tab-indicator`, the sash `--nuiget-color-sash-hover` |

New tokens (83): `space-7`; `inset-details`, `inset-sidebar`, `block-gap-inner`, `block-gap-outer`,
`row-action-end-inset`, `popup-row-padding-x`, `pane-header-margin-x`, `pane-header-padding-start`,
`pane-header-padding-end`, `row-inset-x`; `radius-xs`, `-lg`, `-xl`, `-circle`, `-checkbox`, `-control`, `-action`,
`-row`, `-popup-row`, `-section-header`, `-badge`, `-label-badge`, `-layer`, `-layer-input`, `-scrollbar`;
`line-width`, `pane-header-height`, `control-height`, `input-height`, `action-size`, `action-size-compact`,
`checkbox-size`, `badge-size`, `tab-strip-height`, `details-tab-strip-height`, `progress-height`, `sash-size`,
`welcome-button-max`, `focus-pointer-width`; `opacity-disabled` (D51); `font-size-xs`, `-label`, `-badge`, `-section-title`,
`font-weight-regular`, `-semibold`, `-bold`, `-section-title`, `text-transform-section-title`, `line-height-button`;
`duration-spin`, `easing-spin`, `duration-progress`, `delay-sash-hover`; and 28 colour roles (§4). `--nuiget-z-sticky` and `--nuiget-z-toast` are removed (V64); every other name stays.

## 4. Colour roles

Every role, its `--vscode-*` key per state and its token. "—" means the state does not exist for the role. HC is the
high-contrast treatment. New roles (28) are marked **new**; the 13 roles the research found missing are all among them.
Resolved hex per theme: `tokens.json` (`resolved`), and the artifact's colour list.

| Role | Rest | Hover | Active (pressed) | Selected | Focus | Disabled | Error / unreachable / HC | Token(s) |
|---|---|---|---|---|---|---|---|---|
| Editor surface (main root) | `editor.background` | — | — | — | — | — | — | `color-bg` |
| Side-bar surface (sidebar root, list pane) | `sideBar.background` | — | — | — | — | — | — | `color-bg-sidebar` |
| Layer surface | `editorWidget.background`, `editorWidget.foreground`; border `widget.border`; shadow `widget.shadow` | — | — | — | — | — | HC: border `contrastBorder`, no shadow | `color-widget-bg`, `-widget-fg`, `-border`, `-shadow` |
| Text | `foreground` | row: `list.hoverForeground` **new** | — | row: `list.activeSelectionForeground` (list focused), `list.inactiveSelectionForeground` **new** (not focused) | — | `disabledForeground` **new** | error text `errorForeground` | `color-fg`, `-list-hover-fg`, `-list-active-fg`, `-list-inactive-fg`, `-fg-disabled`, `-error` |
| Secondary text | `descriptionForeground` | — | — | the row's foreground (contrast) | — | `disabledForeground` | — | `color-fg-muted` |
| Link | `textLink.foreground` | `textLink.activeForeground` **new** | `textLink.activeForeground` | — | `focusBorder` ring | `disabledForeground` | — | `color-link`, `-link-active` |
| Glyph | `icon.foreground` **new** | — | — | `list.activeSelectionIconForeground` **new** | — | `disabledForeground` | — | `color-icon`, `-list-active-icon` |
| Icon button | transparent | `toolbar.hoverBackground` **new** | `toolbar.activeBackground` **new** | toggled: `toolbar.activeBackground` | `focusBorder` ring | glyph `disabledForeground` | HC hover: 1 px dashed `toolbar.hoverOutline` **new** | `color-toolbar-hover-bg`, `-toolbar-active-bg`, `-toolbar-hover-outline` |
| List row | transparent | `list.hoverBackground` | — | `list.activeSelectionBackground` / `list.inactiveSelectionBackground` | `list.focusOutline` **new** (1 px, −1) | name `disabledForeground` | HC: selected dotted, hover dashed `contrastActiveBorder` **new** | `color-list-hover-bg`, `-list-active-bg`, `-list-inactive-bg`, `-list-focus-outline`, `-contrast-active-border` |
| Section header (sidebar) | `sideBarSectionHeader.background`, `.foreground`, `.border` (Modern UI: `sideBar.background`, separator `sideBarSectionHeader.border` then `surface.border`) | Modern UI: `list.hoverBackground` **new**; classic none | — | — | `focusBorder` ring | — | HC: border `contrastBorder` | `color-section-header-bg`, `-hover-bg`, `-fg`, `-border` |
| Tabs | `panelTitle.inactiveForeground` **new** | `panelTitle.activeForeground` | — | `panelTitle.activeForeground` **new** + 1 px `panelTitle.activeBorder` **new** | `focusBorder` ring | `disabledForeground` | HC: selected solid, hover dashed `contrastActiveBorder` | `color-tab-inactive-fg`, `-tab-active-fg`, `-tab-indicator` |
| Primary button | `button.background`, `button.foreground`, border `button.border` | `button.hoverBackground` | — | — | `focusBorder` ring (+2) | opacity 0.4 (D51) | HC: border `button.border` | `color-button-bg`, `-fg`, `-hover-bg`, `-border`, `opacity-disabled` |
| Secondary button | `button.secondaryBackground`, `button.secondaryForeground`, border `button.border` | `button.secondaryHoverBackground` **new** | — | — | `focusBorder` ring (+2) | opacity 0.4 (D51) | — | `color-button-secondary-bg`, `-fg`, `-hover-bg`, `opacity-disabled` |
| Badge | `badge.background`, `badge.foreground`; tone border `editorInfo.foreground`, `editorWarning.foreground`, `errorForeground` | — | — | — | — | — | HC: 1 px `contrastBorder` (DS-HC-1) | `color-badge-bg`, `-badge-fg`, `-info`, `-warning`, `-error`, `-contrast-border` |
| Check box | `checkbox.background`, `checkbox.border`; glyph `checkbox.foreground` | — | — | the row check mark on a selected row: `checkbox.selectBackground`, `checkbox.selectBorder` **new** (D52) | `focusBorder` ring (+2) | `disabledForeground` | — | `color-checkbox-bg`, `-fg`, `-border`, `-checkbox-select-bg`, `-checkbox-select-border` |
| Select | `dropdown.background`, `dropdown.foreground`, `dropdown.border` | — | — | — | `focusBorder` ring | `disabledForeground` | — | `color-dropdown-bg`, `-fg`, `-border` |
| Text field, search box | `input.background`, `input.foreground`, `input.border`; placeholder `input.placeholderForeground` | — | — | — | `focusBorder` ring | `disabledForeground` | invalid: `inputValidation.errorBorder` **new** | `color-input-bg`, `-fg`, `-border`, `-placeholder`, `-input-error-border` |
| Focus | `focusBorder` | — | — | — | — | — | HC: `contrastActiveBorder` | `color-focus` |
| Divider, main panel | `settings.headerBorder` **new** (then `panelSection.border`, `panel.border`) | — | — | — | — | — | — | `color-divider` |
| Split separator | `settings.sashBorder` **new** | — | — | — | — | — | — | `color-split-border` |
| Sash | transparent | `sash.hoverBorder` **new** after 300 ms | `sash.hoverBorder` while dragged | — | — | — | — | `color-sash-hover` |
| Popup separator | `pickerGroup.border` **new**; label `descriptionForeground` | — | — | — | — | — | — | `color-picker-separator` |
| Progress | `progressBar.background` | — | — | — | — | — | — | `color-progress` |
| Scrollbar | `scrollbarSlider.background` | `scrollbarSlider.hoverBackground` | `scrollbarSlider.activeBackground` | — | — | — | scrolled: `scrollbar.shadow` **new** | `color-scrollbar`, `-hover`, `-active`, `-scroll-shadow` |
| Severity glyph | `problemsErrorIcon.foreground`, `problemsWarningIcon.foreground`, `problemsInfoIcon.foreground` **new** (then `editorError/Warning/Info.foreground`) | — | — | — | — | — | an unreachable source: warning glyph | `color-icon-error`, `-icon-warning`, `-icon-info` |
| Verified mark | `extensionIcon.verifiedForeground` **new** | — | — | — | — | — | — | `color-verified` |
| New version | `gitDecoration.addedResourceForeground` (then `charts.green`) | — | — | — | — | — | — | `color-version-new` |
| README code and syntax | `textCodeBlock.background`, `editor.foreground`; `symbolIcon.*`, `debugTokenExpression.*`, `editorLineNumber.activeForeground`; tables `keybindingTable.*`; quotes `textBlockQuote.*` | — | — | — | — | — | — | `color-code-*`, `-syntax-*`, `-table-*`, `-blockquote-*` |
| Scrim | `rgba(0, 0, 0, 0.5)` literal | — | — | — | — | — | forced colours: `Canvas` | `color-scrim` |

## 5. Type scale, iconography, spacing and density

### Type scale (px at the webview's fixed 13 px base, DS-TYPE-2)

| Role | Size | Weight | Line box | Transform | Token(s) |
|---|---|---|---|---|---|
| Details title, dialog title | 18 (Heading2) | 600 | 1.4 | none | `font-size-lg`, `font-weight-semibold` |
| Panel title | 13 (Body1) | 600 | 1.4 | none | `font-size-md` |
| Row name | 13 | 600 | 1.4 | none | `font-size-md`, `font-weight-semibold` |
| Body, inputs, selects | 13 | 400 | 1.4 (controls: their height) | none | `font-size-md` |
| Tab labels | 11 (Body2), 10 px side padding; the active label marked by a 1 px bottom border (DS-COLOR-4): the Extensions editor navbar's labels measured on VS Code 1.140.0 in both looks (UX-P0.14, `workbench/<look>.json` `exemplar.editor.navbarLabels`), artboard A's values | 400 | 36 (the strip) | uppercase (both looks) | `font-size-sm` |
| Main-list group header (one grouped list per view) | M 12 / C 11 | M 600 / C 700 | M 28 / C 22 | M capitalize / C uppercase | `font-size-section-title`, `font-weight-section-title`, `text-transform-section-title` |
| Details group header | 13 | 600 | 22 | none (Title Case text) | `font-size-md` |
| Text button | 12 (Label1) | 400 | 16 | none | `font-size-label`, `line-height-button` |
| Sidebar section title | M 12 / C 11 | M 600 / C 700 | M 28 / C 22 | M capitalize / C uppercase | `font-size-section-title`, `font-weight-section-title`, `text-transform-section-title` |
| Browse description | 13 | 400 muted | 1.4 | none | `font-size-md`, `color-fg-muted` |
| Version, authors, metadata | 11 (Body2) | 400 muted (publisher 600) | 1.4 | none | `font-size-sm` |
| Popup separator label | 11 | 400 muted | 22 | none | `font-size-sm` |
| Count and label badge | M 10 / C 11 | 400 | 11 | none | `font-size-badge` |
| README | Markdown preview scale (exempt) | — | — | — | — |

### Iconography

- One set: codicons of the pinned `@vscode/codicons` release, generated as inline SVG by a script, compared by a lint
  (path `d`, viewBox, name) and attributed under CC-BY-4.0 (DS-ICON-1, DS-ICON-5). The icon plan is `docs/design/icons.json` (export name → codicon file, release pinned in `package.json`): a glyph enters it in the change that renders it, with its user, and leaves it when nothing renders it (CA-R2); `scripts/sync-codicons.mjs` writes `src/webview/shared/primitives/icons.tsx` from it and the DS-ICON-1 lint compares both with the release. The two custom glyphs are removed (no user); a project glyph, if one is ever rendered, is `project` or `root-folder`; the quick-search chevrons become `chevron-right` / `chevron-left` (V62); Verified is `verified-filled`.
- Sizes: 16 px for actions, headers, twisties and severity glyphs (`icon-size-md`); 12 px for compact inline marks,
  the Verified mark beside an author included (`icon-size-sm`); package icons 36 px, 24 px narrow (`icon-size-xl`,
  `icon-size-lg`).
- Colour: `icon.foreground` at rest; `list.activeSelectionIconForeground` on a selected row; severity glyphs in
  `problems*Icon.foreground`; Verified in `extensionIcon.verifiedForeground`.
- Hover box: 22 px (padding 3) in rows, toolbars and the main header; 20 px (padding 2) in sidebar section headers and
  main-list group headers;
  radius M 4 / C 6; pointer target ≥ 24 px.

### Spacing

The ramp is {0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40}; the tokens use 2, 4, 6, 8, 12, 16 and 20. Block gaps
4 inside a group, 8 between groups (P-1). Insets: main panel 16, details 20, sidebar header M 8 / C 20, sidebar titles
and rows at the pane-header title x (M 28 / C 20), row actions 6 inside the band, sidebar header trailing items
M 6 / C 12 inside the header box.

### Density per surface (DS-DENSITY-1; no user toggle)

| Surface | Rows | Headers | Icons | Text |
|---|---|---|---|---|
| Sidebar (compact) | 22 px, one line, name first | pane-header variant, M 28 / C 22 | none in rows; 16 px glyphs in headers | 13 px names, versions muted |
| Main list (comfortable, one grouped list per view) | 72 px pitch, Extensions anatomy: three lines in Browse, two in Installed and Updates | group headers M 28 / C 22, pane-header type | 36 px package icon (24 / hidden narrow) | 13/600 names, 11 px metadata |
| Details pane (editor spacing) | facts grid (DS-ALIGN-1) | details group headers, 22 px | 16 px glyphs | 18/600 title, 13 px body |
| Popups (quick-search) | 22 px, padding M 4 / C 6, radius M 4 / C 3 | separators (DS-DIVIDER-3) | 16 px | 13 px, 11 px separator labels |

## 6. The look switch (DS-LOOK-1)

Every metric that differs between the looks, measured on VS Code 1.142.0. Everything else, including the colours, is
identical in both looks.

| Metric | Modern UI | Classic | Probe field | Token(s) |
|---|---|---|---|---|
| Pane-header height | 28 | 22 | `extensions.json pane_headers[0] .rect.h` | `pane-header-height` |
| Pane-header title | 12px / 600 / capitalize | 11px / 700 / uppercase | `pane_headers[3] .fontSize .fontWeight .textTransform` | `font-size-section-title`, `font-weight-section-title`, `text-transform-section-title` |
| Pane-header box | margin 0 4, padding-left 4, radius 4, no border, inset separator, hover `list.hoverBackground`, background `sideBar.background` | full width, radius 0, 1 px top border on later headers | `pane_headers[0] .margin .padding .borderRadius .border`; `paneHeaders.css` | `pane-header-margin-x`, `pane-header-padding-start`, `radius-section-header`, `color-section-header-*` |
| Main-list group header | 28, 12px / 600 / capitalize, radius 4, hover tint, not inset | 22, 11px / 700 / uppercase | as the pane header (`pane_headers[0]`, `[3]`) | `pane-header-height`, section-title tokens, `radius-section-header` |
| Title x from the pane edge | 28 | 20 | `pane_headers[3] .rect.x` − `webviews[0] .rect.x` (M 77 − 49, C 68 − 48) | derived |
| Trailing count end inset (header box / pane) | 6 / 10 | 12 / 12 | `pane_headers[0]` right − `pane_headers[4]` right | `pane-header-padding-end` |
| Count badge | 19×19, 10px, 4px 6px, radius 9999 | 18×18, 11px, 3px 5px, radius 11 | `pane_headers[4]` | `badge-size`, `font-size-badge`, `radius-badge` |
| Label badge | 4px 6px, radius 9999 | 2px 4px, radius 2 | `badges[3]` (hidden element) | `radius-label-badge` |
| Side-bar list row band | inset 4 each side, radius 4 | full width, radius 0 | `explorer.json list_rows[0] .rect .borderRadius` | `row-inset-x`, `radius-row` |
| Editor list row band (main panel) | radius 4, not inset | radius 0 | `settings.json settings[0] .rect.x .borderRadius` | `radius-row` |
| Icon-button hover box radius | 4 | 6 | `extensions.json ext_parts[23] .borderRadius`; `explorer.json pane_headers[5]` | `radius-action` |
| Layer radius (quick input) | 8 | 12 | `quickinput.json quickinput[0] .borderRadius` | `radius-layer` |
| Field inside a layer | 4 | 6 | `quickinput[1] .borderRadius` | `radius-layer-input` |
| Popup row | radius 4, padding 0 4 | radius 3, padding 0 6 | `quickinput[3] .borderRadius`, `quickinput[4] .padding` | `radius-popup-row`, `popup-row-padding-x` |
| Scrollbar | 8 px, thumb radius 4 | 10 px, square | `modernUI.contribution.ts:22`, `roundedCorners.css` (TS/CSS-read) | `scrollbar-size`, `radius-scrollbar` |
| Focus after a pointer click (sidebar) | none | 1 px ring | `extensions-states.json selected .outline` | `focus-pointer-width` |
| Extensions search header padding | 4 8 4 8 | 5 12 6 20 | `extensions.json ext_search[0] .padding` | `inset-sidebar` (8 / 20, symmetric) |
| Side-bar title (VS Code draws it) | 32, padding 0 4, label padding 8 | 35, padding 0 8, label padding 12 | `sidebar_title[0..1]` | none (host chrome) |
| Editor tab strip (VS Code) | 29, tabs 28 radius 4 | 35, square tabs | `tabs[0..1]` | none (host chrome) |
| Side-bar content box (VS Code) | x 49 w 298 (floating panels) | x 48 w 300 | `webviews[0] .rect` | none (host chrome) |
| Status bar (VS Code) | 28 | 22 | `statusbar[0] .rect.h` | none (host chrome) |

The same in both looks (probe, both runs): Extensions row 72 with a 36 px icon of radius 2 and 16 px padding, name
13/600, description 13 px, publisher 11/600, row action end inset 6 and box 22 pad 3; tree, quick-input and Settings TOC
rows 22; text button 26 (12/16, padding 4/8, radius 4); select 26; Settings input 25; Search input 26; check box 18
radius 3; every `--vscode-*` colour and size token.

## 7. Components: specification and accessibility contract

Each component's spec lives in the artifact (`project/components/<Name>/README.md`); this table is the binding
accessibility contract. "Reduced motion" is the behaviour under either signal (DS-MOTION-2).

| Component | Role and name | Keyboard map | Focus state | Reduced motion |
|---|---|---|---|---|
| Listbox | one `role="listbox"` per view (owner round 1, D-C), named by its view or tab, described by the visually hidden key hint (`aria-describedby`); each section (Direct Packages, Transitive Packages, a project) is a `role="group"` labelled by its header; `aria-multiselectable` when it offers bulk actions; `aria-busy` while revalidating | ArrowUp/Down move the active row across groups, Home/End jump (one tab stop, roving `tabIndex`); Enter opens or selects, never writes: the main panel selects the row and shows its details, the sidebar opens the main panel on the row (owner round 1, D-D); how a group header collapses by key and pointer is settled by the Listbox item (a button inside the listbox is nested-interactive content); Ctrl/Cmd+Enter runs the secondary action; Delete (Cmd+Backspace) uninstalls after a confirmation; Shift+F10 and the ContextMenu key dispatch a synthetic `contextmenu` for the `webview/context` menu (no `preventDefault`); Space, Ctrl/Cmd+click and a click on the check mark toggle the bulk set (multi-select only) | the active row of a focused listbox rings in `list.focusOutline` (DS-FOCUS-2); pointer focus per DS-FOCUS-3; an emptied list hands focus to its empty-state container | no transition on the band |
| Row (comfortable, compact) | the pinned triad: wrapper `div.nuiget-row[role=presentation]` (classes, `data-*`, `data-vscode-context`, the measuring ref only) → option `role="option"` (`aria-selected`, `aria-current` in multi-select, `aria-posinset`, `aria-setsize`, `aria-labelledby` name + version, `aria-describedby` badges, meta, status, the disabled reason; `aria-busy`, `aria-disabled`) → actions `div.nuiget-row-actions[aria-hidden=true]` with `IconButton tabIndex=-1`; tooltip `id version` on `.nuiget-row-body` only | through the Listbox; a click on an action keeps focus on the option | the band (wrapper width, actions included) carries hover, selection and the focus ring (DS-ROW-3) | the busy row's spinner stands still; its status text says the state (T-9) |
| SectionHeader, pane-header variant (sidebar sections) | a toggle `button` with `aria-expanded`, named by the title and its count; the count badge is part of the name, actions are buttons beside the toggle | Enter and Space toggle; Tab reaches the toggle, then its actions | focus ring offset M −2 / C −1; Modern UI hover tint | the collapse animates 150 ms; 0 under reduced motion |
| SectionHeader, group variant (main list: Direct Packages, Transitive Packages, a project) | the label of its `role="group"` inside the view's listbox, its count part of the name; the collapse control meets the nested-interactive constraint (Listbox item) | collapse and expand per the Listbox item, no extra tab stop inside the listbox | ring offset −1 | as above |
| SectionHeader, details group variant (Dependencies, Vulnerabilities, Required by) | a heading (`h3`) with the 13/600 style, collapsible ones a toggle `button` with `aria-expanded` | Enter and Space toggle | ring offset −1 | as above |
| Toolbar | `role="toolbar"` with `aria-label`; one tab stop, roving `tabIndex` kept by the primitive | ArrowLeft/Right move between controls, Home/End jump; Tab leaves; in a text field the arrows move the caret until its edge | the focused control's own ring | — |
| Tabs | `tablist` / `tab` / one `tabpanel`; the selected tab controls and names the panel; a count is part of the tab's name ("Updates 3") | ArrowLeft/Right select and focus (wrapping), Home/End; automatic activation | ring offset −1 inside the tab; the selected tab's underline is `panelTitle.activeBorder`, never `focusBorder` | — |
| Badge (count, tone) | text inside the name of what it labels (never a separate tab stop); a tone says its meaning in words (title or the parent's description) | none | none | — |
| Button (primary, secondary) | native `button`; disabled with `disabled` (not `aria-disabled`), drawn at opacity 0.4 (D51), plus the reason in its description (DS-STATE-7); labels Title Case, "..." when it opens UI | Enter and Space | 1 px `focusBorder`, offset +2 | — |
| Select | native `select` wrapped (Select primitive, native first), named by a visible or `aria-label` label | the native keys | 1 px `focusBorder`, offset −1 | — |
| Checkbox | native `input type=checkbox` drawn 18 px with `appearance: none`, labelled by its text; the row check mark is an `aria-hidden` span (the option carries `aria-selected`), in `checkbox.select*` on a selected row (D52) | Space | 1 px `focusBorder`, offset +2 | — |
| TextField, SearchBox | native `input`; SearchBox `role="combobox"` with `aria-expanded`, `aria-controls` → `search-suggestions`, `aria-activedescendant`, and its hidden keys in `aria-describedby` | SearchBox: Enter searches, ArrowDown opens and moves the suggestions, ArrowRight lists versions, Ctrl/Cmd+Enter installs the highlighted one, Escape clears then blurs | 1 px `focusBorder` on any focus (inputs show their ring on click too) | — |
| IconButton | `button` with `aria-label` and a matching tooltip; inside a row `tabIndex=-1` and `aria-hidden` through its container | Enter and Space (when focusable) | 1 px `focusBorder` around the 22/20 px box; HC dashed outline on hover | — |
| Banner | `role="alert"` for an error, `role="status"` otherwise; says its severity in words before the sentence; one action button | Tab reaches its action | the action's own ring | — |
| EmptyState | a region with the sentence; takes focus (`tabIndex=-1`, a visible ring) when the list it replaces empties under focus | Tab reaches its one action | 1 px `focusBorder` | — |
| Dialog, ConfirmDialog | `role="dialog"` (ConfirmDialog `alertdialog`), `aria-modal`, named by its heading; ConfirmDialog opens on Cancel | Tab and Shift+Tab wrap inside; Escape closes; focus returns to the opener, or to the list or its next row when the opener is gone (never `<body>`) | the focused control's ring | entry 150 ms; 0 under reduced motion; the scrim appears at once |
| Popover | non-modal `role="dialog"` named by its label, beside its anchor; the context menu itself is VS Code's `webview/context` menu | Escape or Tab past either end closes and returns focus to the anchor; an outside press closes | the focused control's ring | as Dialog |
| Skeleton, Spinner, ProgressBar | Skeleton `aria-hidden` (the status line says "Loading …"); Spinner is decoration unless given a label (the `loading` glyph titled, today's `Spinner.tsx`); ProgressBar `role="progressbar"` with `aria-label` ("Refreshing", "Searching again") | none | none | all three stand still: static skeleton, still `loading` glyph, stripe at the start (T-9) |
| Sash | `role="separator"`, `aria-orientation`, `aria-valuenow`/`min`/`max` of the split (pixel bounds per DS-OVERFLOW-5), `aria-label`, `aria-controls`, one tab stop | ArrowLeft/Right (ArrowUp/Down on a horizontal split) move one step, Shift ten; Home and End go to the bounds; Enter restores the default (today's `Sash.tsx` map, kept) | 1 px `focusBorder` on the separator line | the hover colour still waits 300 ms (a delay, not motion) |

## 8. Overflow table (DS-OVERFLOW-3)

Every container that holds a row of controls, its minimum width and its behaviour below it, in order.

| Container | Min width | Behaviour below it, in order | Today |
|---|---|---|---|
| Sidebar view title (VS Code draws it) | 170 (side-bar minimum) | at most 4 navigation actions; the rest in `...` | 6 actions; title reads "N" at 200 px |
| Sidebar header (search box) | 170 | the box shrinks; its Filter and Clear buttons stay inside it | holds |
| Sidebar section header | 170 | title ellipsis; the count badge and the actions stay | title ellipsis holds; Update all touches the edge (V3) |
| Sidebar compact row | 170 | version ellipsis first, then the name (DS-ROW-5); actions stay | holds |
| Main header (title, check boxes, selects, gear, refresh) | 220 (editor minimum) | wraps; then the check-box labels become icon toggles with tooltips; the title hides last | wraps |
| Tab strip (Installed/Updates) | list-pane minimum | count badges hide first, then labels ellipsize; never a sideways scroll | no rule |
| Bulk toolbar | list-pane minimum | the primary action stays at the end; Select All becomes an icon button | wraps |
| Main-list group header | list-pane minimum | title ellipsis; badges keep the 16 px end inset and may ellipsize their text | badges reach the edge (V3) |
| Comfortable row | list-pane minimum | ≤ 250 px icon 24, ≤ 200 px icon hidden; name ellipsis last; actions stay | no breakpoint |
| Details header (installed version, version select, buttons) | details-pane minimum | the grid becomes a wrapping flex row: label and value, then the buttons on their own line | a 4-column grid that cannot wrap |
| Details/README tabs | details-pane minimum | as the tab strip | as the tab strip |
| Details facts (DS-ALIGN-1) | details-pane minimum | the value column wraps under the label | ragged (V59) |
| Dialog footer | `min(32em, 100%)` | wraps, primary button last | wraps |
| Quick-search popup row | search-box width | name ellipsis; version and chevron stay | holds |

## 9. States per screen (DS-STATE-1)

What each cell shows and the `data-testid` marker the harness reads. Existing hooks are in the interaction model §8;
the others are proposed here and enter §8 in the change that renders them (the interaction-model test-id lint fails for
a listed hook nothing renders). Pattern for new markers: `<screen>-<state>` on the element that shows the state; the
revalidating marker is the screen's progress bar with `aria-busy` on its list. "n/a" = the state cannot occur.

| Screen | Loading (first) | Revalidating | Empty | Error | Partial | Unsupported |
|---|---|---|---|---|---|---|
| Main · Installed (single) | bar + 3 skeleton rows + "Loading …": `installed-loading` | bar, rows stay: `installed-progress` | "No packages installed." (DS-COPY-3): `installed-empty` | inline glyph + sentence + Retry: `installed-error` | provisional badge on Direct Packages: `installed-provisional` | banner with the reason: `installed-unsupported` |
| Main · Installed (All Projects, per project) | per project: `installed-loading-<name>` | `installed-progress` | per project: `installed-empty-<name>`; no projects: `installed-empty` | per project: `installed-error-<name>` | `installed-provisional-<name>` | `installed-unsupported-<name>` |
| Main · Transitive section | bar inside the section on expand: `transitive-loading` | `transitive-progress` | "No transitive packages.": `transitive-empty` | inline + Retry: `transitive-error` | not restored + Restore: `transitive-restore-banner` (exists) | n/a |
| Main · Updates (single and All Projects) | `updates-loading` | `updates-progress` | "No updates available.": `updates-empty` | `updates-error` | sources unreachable: `updates-unavailable-banner` (exists) | read-only note: `updates-unsupported` |
| Main · Browse results | the bar alone until the first rows arrive (`browse-loading`), then rows first under it, icons, authors and downloads filling in (D56): `browse-progress` with `aria-busy` | "Searching again" bar, previous rows stay: `browse-progress` | "No results for "x".": `browse-empty` | `browse-error` | `browse-unavailable-banner` (exists) | n/a |
| Main · Quick-search popup | "Searching..." row: `search-suggestions-loading` | previous suggestions stay, `aria-busy` | the popup closes (no row) | error row + "Press → to retry": `search-suggestions-error` | per-source error row: `search-suggestions-partial` | n/a |
| Main · Details (package) | bar in the header + skeleton facts: `details-loading` | n/a | "Select a package to see its details.": `details-empty` | inline + Retry: `details-error` | offline cache banner: `details-offline`; stale selection: `details-stale` | read-only note: `details-unsupported` |
| Main · README tab | `readme-loading` | n/a | "No README available.": `readme-empty` (exists) | inline + Retry: `readme-error` | images as links | n/a |
| Main · Transitive details | n/a (reads loaded slices) | n/a | "No longer listed as a transitive package.": `transitive-details-empty` | n/a | n/a | n/a |
| Main · Sources dialog | `source-settings-loading` | n/a | "No package sources.": `source-settings-empty` | `source-settings-error` | unreachable mark: `source-health-indicator` (exists) | n/a |
| Main · header (projects) | "Loading Projects…" option, selects disabled: `project-selector` disabled | refresh button busy: `refresh-button` `aria-busy` | "No .NET projects found in this workspace.": `projects-empty` | banner: `projects-error` | n/a | n/a |
| Sidebar · Installed (single and All Projects) | `sidebar-installed-loading` | `sidebar-installed-progress` | `sidebar-installed-empty` (exists) | `sidebar-installed-error` (exists) | `sidebar-installed-provisional` (exists) | `sidebar-unsupported` (exists) |
| Sidebar · Updates | `sidebar-updates-loading` | `sidebar-updates-progress` | `sidebar-updates-empty` (exists) | `sidebar-updates-error` | `sidebar-updates-unavailable` (exists) | read-only, no Update All: `sidebar-updates-unsupported` |
| Sidebar · Browse | the bar, then rows first under it (D56): `sidebar-browse-loading` | `sidebar-browse-progress` | `sidebar-browse-empty` | `sidebar-browse-error` | `sidebar-browse-unavailable` (exists) | n/a |
| Whole view (both surfaces) | n/a | n/a | n/a | "Something went wrong in this view." + Reload: `view-error` | n/a | n/a |

## 10. Microcopy

1. Labels of buttons, tabs, menu items, commands and group headers are Title Case with the minor-word list of
   DS-COPY-1 ("Select All", "Uninstall Selected (0)", "Update All", "Direct Packages", "Transitive Packages").
2. Tooltips, messages, banners and empty states are sentence case, whole sentences ending in a period (DS-COPY-3).
3. A label that opens further UI ends with "..." (DS-COPY-4): "Install in Projects...", "Manage Package Sources...".
4. Label–value pairs have no colon; one noun per field: "Authors" (DS-COPY-2).
5. One count style per surface: badges in headers, "N of M" while filtering (DS-COPY-5).
6. Verbs: Install, Update, Uninstall, Restore for packages; Remove for sources only; the pending forms Installing,
   Updating, Uninstalling, Restoring (DS-STATE-6).
7. Nouns: package (never reference, except "Its reference could not be resolved."), source (never feed), transitive
   package (never dependency, in list headers and empty states), project; "Pre-Release" in Title Case labels and
   "pre-release" in sentences, as VS Code writes it ("Switch to Pre-Release Version").
8. Failures name what failed and how, one pattern: "<What> could not be <loaded / listed / checked / searched / read>:
   <reason>." Never "failed" for a read.
9. Disabled controls say why (DS-STATE-7), in a sentence on the control's description.
10. Toast and status texts (failures and bulk summaries only, D-E) use one preposition per verb: "Uninstalled X from P", "Uninstall of X
    from P failed".

## 11. Motion

| Use | Duration | Easing | Token | Reduced motion |
|---|---|---|---|---|
| Hover and focus colour changes | 100 ms | ease-out | `duration-fast`, `easing` | 0 |
| Expand, collapse, layer entry | 150 ms | ease-out | `duration-normal`, `easing` | 0 |
| Skeleton breathe | 6 × `duration-normal` | ease-in-out | `duration-normal` | static |
| Spinner | 1.5 s per turn | steps(30) | `duration-spin`, `easing-spin` | still glyph (T-9) |
| Indeterminate progress | 4 s per pass | linear | `duration-progress` | stripe at the start (T-9) |
| Sash hover colour | after 300 ms | — | `delay-sash-hover` | unchanged (a delay) |

Both reduced-motion signals zero the four duration tokens: `@media (prefers-reduced-motion: reduce)` and
`body.vscode-reduce-motion` (DS-MOTION-2). The workbench keeps its spinner and progress bar moving under reduced motion;
nUIget stops them, as it does today, because `a11y-reduced-motion-both-signals` requires every duration at zero (T-9).

## 12. CSS baseline

The webviews run in Chromium 122 at the VS Code 1.90 floor (owner round 2, D54: Electron 29, Node 20.9; ADR-000 amended
under the sentinel). `src/test/lint/webview-css-baseline.test.ts` moves its threshold from 114 to 122 and retires the 16
entries Chromium 122 has: `scrollbar-color` and `scrollbar-width` (121), `@starting-style` (117), `@scope` (118), the
relative colour syntax (119), `animation-timeline`, `scroll-timeline`, `view-timeline` (115), `transition-behavior` and
`overlay` (117), `text-wrap: pretty` (117), `subgrid` (117), `:user-invalid` and `:user-valid` (119), `:dir()` (120)
and CSS nesting (120). Ten stay denied: `@position-try`, `anchor-name`, `round()`, `mod()` (125), `light-dark()`,
`field-sizing` (123), `interpolate-size`, `calc-size()` (129), `text-wrap: stable` and `text-wrap: auto` (130). The
versions are the MDN browser-compat-data keys the lint already records.

- No rule in this file needs a denied feature, and none needs an allowlist: DS-SCROLL-1's `:root { scrollbar-color:
  auto }` is plain CSS at the new threshold.
- Features the rules use, all at or below 122: custom properties, `:focus-visible` and `:focus-within`, `:is()`,
  attribute selectors on `:root`, `inset`, flex and grid `gap`, `outline` that follows `border-radius`,
  `@media (forced-colors: active)`, `::-webkit-scrollbar`, `scrollbar-color`, `steps()`. The scrim no longer needs
  `color-mix()`.
- The size-token fallbacks stay: 1.90 exports none of the size tokens (radii and codicon sizes from 1.110.1, spacing
  from 1.124.0, font sizes and weights from 1.129.0), so hosts 1.90–1.123 render the fallbacks.
- ExTester 8.28.1 runs 1.90.0, so a UI lane can render the floor's Chromium (N64), which the lint alone covered before.

### Lint changes the implementation item needs

| Test | Today | Change |
|---|---|---|
| `webview-tokens.test.ts:53` selector allowlist | `:root`, the two HC body classes, the two media queries | add `:root[data-look="modern"] {`, `:root[data-look="modern"][data-density="compact"] {`, `:root[data-look="modern"][data-uppercase-headers] {`, `body.vscode-reduce-motion {` |
| `webview-tokens.test.ts:56-65` colours are aliases | admits `var(--vscode-…)` and the `color-mix()` scrim | admit the scrim literal `rgba(0, 0, 0, 0.5)` on `--nuiget-color-scrim` only (one line); check the Modern UI block's colours the same way |
| `webview-tokens.test.ts:26-41` REQUIRED | 52 names | add the new names the primitives come to rely on (at least the semantic radius, size and colour tokens of §3) |
| `webview-tokens.test.ts:72-80` ROW_HEIGHT | 24 / 78 | `Listbox.tsx` `ROW_HEIGHT = { compact: 22, comfortable: 72 }` |
| `webview-tokens.test.ts:82-86` reduced motion | one media block with the two durations at 0 | still one media block; it and the new `body.vscode-reduce-motion` block each set the four durations (`fast`, `normal`, `spin`, `progress`) to 0ms |
| `webview-tokens.test.ts:96-100` HC block | three keys | unchanged: the new HC lines are `:root` tokens on HC-only keys (T-22) |
| `webview-css-baseline.test.ts` | `BASELINE = 114`, 26 entries | `BASELINE = 122` and the 16 entries at or below 122 retired (the test that every entry is newer than the baseline enforces it); no allowlist |
| `webview-stylesheets.test.ts` scrollbar pins | thumb, corner and size declarations pinned verbatim | add the thumb's `border-radius: var(--nuiget-radius-scrollbar)` and the `:root` reset to the pins |
| `webview-stylesheets.test.ts` sash pins | `::after` inset from `--nuiget-space-2` | unchanged if the sash stays 4 px (`--nuiget-sash-size` = `--nuiget-space-2`); update the pin if the rule moves to `--nuiget-sash-size` |

## 13. Rules owned elsewhere

These ids of `research/rules.json` belong to the harness, the lint baseline, the listing or the plan; the Design
System cites them and does not restate them.

| Id | One line |
|---|---|
| icons-match-pinned-codicons | The icon lint of DS-ICON-1 (paths and viewBox of the pinned codicons). |
| spacing-on-workbench-ramp | The token-file lint of DS-GRID-1. |
| radius-and-type-from-workbench-tokens | The token-file lint of DS-GRID-3. |
| MS-1 | Edges meant to coincide coincide (1 px). |
| MS-2 | Check box, icon and text block are centred on their card. |
| MS-3 | List children stay inside the scroll port with an inset. |
| MS-4 | A section header sits closer to its content than to the content before it. |
| MS-5 | Same-role gaps are equal everywhere. |
| MS-6 | Heights and colours equal their workbench analogues in the same session. |
| MS-7 | Names and authors are not cut at the default widths. |
| MS-8 | Persistent chrome does not move between named states. |
| MS-9 | The masked webview crop matches its pinned baseline. |
| MS-10 | No axe violation in the real webview. |
| pxLength | No literal length outside spacing in a stylesheet other than tokens.css. |
| duplicateSelector | A selector prelude is declared once per bundle. |
| specificity | No complex selector above (0,2,0). |
| override | No cross-stylesheet override of a declaration on the same class. |
| deadRule | Every styled class is rendered by product code. |
| disableComment | No lint-disable comment in a stylesheet. |
| CA-R1 | No feature stylesheet selector names a primitive class. |
| CA-R2 | Every primitives export has a production importer. |
| CA-R3 | The main-panel shell stays under 300 lines. |
| CA-R4 | Listbox row heights equal the row-height tokens. |
| CA-R5 | Every interaction-model hook is rendered, and the row keeps its triad. |
| a11y-focus-after-close | Focus never lands on `<body>` after a layer closes. |
| a11y-enter-not-destructive | Enter on a row never writes without a confirmation. |
| a11y-hint-truthful | Every key a hint names has a handler. |
| a11y-reduced-motion-both-signals | Durations are zero under both reduced-motion signals (the loop tokens included, T-9). |
| a11y-text-contrast-all-states | Text pairs reach 4.5:1 in every state and theme. |
| a11y-nontext-contrast | Control boundaries and state marks reach 3:1. |
| a11y-first-load-announced | A loading area puts "Loading …" in the live region. |
| a11y-full-axe-real-page | Zero axe violations in the real webview, every state, every layer. |
| a11y-sr-speech | What a screen reader speaks is understandable and not repeated. |
| LST-1 | The VSIX packages without vsce errors. |
| LST-2 | README images are pinned to an immutable ref. |
| LST-3 | The README tables follow the manifest. |
| LST-4 | The README renders in the Extensions view without loss. |
| LST-5 | The hero GIF stays within the peer range. |
| LST-6 | No developer-only content in the shipped README. |

## 14. Owner decisions

All decided in owner rounds 1 and 2 (DECISIONS.md, "Owner rounds"); this file applies them.

| # | Decision | Pick | Rules and tokens it changed |
|---|---|---|---|
| D-A | Comfortable row anatomy | Round 1, composition A: the Extensions row, 72 px, three lines in Browse and two in Installed and Updates (T-27), 36 px icon, actions inside the band; D15's 78 px card retired | DS-HEIGHT-3, DS-ROW-1, DS-ROW-3, DS-DIVIDER-1; `row-height-comfortable`; T-27 |
| D-B | Compact row height | Round 1: 22 px | DS-HEIGHT-2; `row-height-compact` |
| D-C | List model per view | Round 1: one grouped list per view, group headers M 28 capitalised / C 22 (about 7 more planned days) | DS-HEIGHT-1, DS-TYPE-3/5, DS-DIVIDER-1, §5, §6, §7 Listbox and SectionHeader, §9 |
| D-D | Enter in the sidebar | Round 1: opens the main panel on the row | §7 Listbox keyboard map |
| D-E | Success feedback | Round 1: in place and through the live region, no toast | DS-STATE-5, §10 |
| D-F | VS Code floor | Round 2 (D54): `^1.90.0`, Chromium 122, Node 20.9 | header, §12, DS-SCROLL-1, DS-ICON-1, DS-MOTION-2, T-28 |
| D-G | Disabled text buttons | Round 2 (D51): opacity 0.4, the workbench's | DS-COLOR-6, §4, §7 Button; `opacity-disabled` |
| D-H | Row check mark | Round 2 (D52): the 18 px box in `checkbox.*` plus `checkbox.selectBackground` / `checkbox.selectBorder` on a selected row | DS-HEIGHT-9, DS-COLOR-2, §4, §7 Checkbox; `color-checkbox-select-bg`, `color-checkbox-select-border` |
| F3 | Browse results while loading | Round 2 (D56): rows first under the 2 px bar, enrichment after | DS-STATE-2, §9 Browse cells, T-16 |
| Tabs | Tab strip of composition A | Round 1: 36 px, as composition A draws it (the Extensions editor navbar) | DS-HEIGHT-4; `tab-strip-height`; T-12 |

## 15. Decisions taken here

Taken by the closest-to-the-workbench rule where the research left a choice. The lead adopted T-1..T-26 as a block
(DECISIONS.md 2026-10-23, "Design System details"), with T-4 and T-9 recorded in rows of their own ("Focus rings per
look", "Reduced motion stops everything"). T-12, T-13, T-16 and T-23 were then changed by the owner rounds as marked;
T-27..T-29 follow from them.

| # | Decision | Ruling | Evidence |
|---|---|---|---|
| T-1 | Ids of the added rules | DS-TYPE-8, DS-TYPE-9, DS-RADIUS-1/2, DS-DIVIDER-5 (scrim), DS-DIVIDER-6 (sash), DS-SCROLL-1/2, DS-LOOK-1, DS-HC-1, DS-ALIGN-1. The visual audit's proposed DS-DIVIDER-5 (sash) is DS-DIVIDER-6 here and its DS-COLOR-8 (scrim) is DS-DIVIDER-5; DS-SCROLL-1, DS-HC-1, DS-ALIGN-1, DS-TYPE-8/9 keep the audit's ids | visual-audit.md §16; the brief's ids |
| T-2 | Rows under Modern UI | main-panel rows: radius 4, not inset (an editor list); sidebar rows: inset 4 on each side and radius 4 | `padding.css` scopes the inset to `.pane-body` lists; `M: settings.json settings[0]` (x unchanged, radius 4); `M: explorer.json list_rows[0]` (x 53 w 290, radius 4) |
| T-3 | Sidebar insets per look | header row symmetric 8/8 (Modern UI) or 20/20 (classic); section titles and row names at the pane-header title x, 28 or 20; DS-INSET-1's single inset holds per look in the classic sidebar, while under Modern UI the sidebar has two edges as the workbench does | `ext_search[0] .padding` M 4/8/4/8, C 5/12/6/20; `pane_headers[3] .rect.x` |
| T-4 | Focus after a pointer click | Adopted (DECISIONS.md "Focus rings per look"). the recorded premise ("Modern UI: keyboard only") applies to the sidebar only; the main panel, an editor, keeps rings after a click in both looks. Consequence for the owner: the main panel shows a ring after every click under Modern UI too, as the Settings editor does | `keyboardFocusOnly.css` header comment and selectors (side bar, panel, auxiliary bar, status bar) |
| T-5 | End insets split by element | row actions 6 inside the band; sidebar header trailers M 6 / C 12 inside the box; main headers and toolbars 16 (symmetric). The toolbar's end edge aligns with the search box's end and the group headers' trailing badges (all 16), not with the row actions, which sit 10 px further out inside the band: the workbench does the same (pane-header badge at 12, row action at 6) | `ext_rows[0]` vs `ext_parts[23]`; `pane_headers[0]` vs `[4]`; P-2 |
| T-6 | Field heights per exemplar | search boxes 26 (Search view, Extensions search box), selects 26 (Settings select), other text fields 25 (Settings input, quick input) | `search.json search[0]`, PNG `extSearchBox`, `settings[33]`, `settings[17]`, `quickinput[1]` |
| T-7 | Radius names | `--nuiget-radius-xs/sm/md/lg/xl/circle` follow the workbench tiers 2/4/6/8/12/9999 (sm 2 → 4, md 4 → 6); components use semantic tokens (`radius-control`, `-action`, `-row`, `-layer`, …) | `vars --vscode-cornerRadius-*` |
| T-8 | Type tokens | px aliases of the font ramp: xs 10, sm 11, label 12, md 13, lg 18 | `vars --vscode-fontSize-*`; DECISIONS.md "Token source" (em → px) |
| T-9 | Loops under reduced motion | Adopted (DECISIONS.md "Reduced motion stops everything"). every animation stops, loops included: the spinner shows the still `loading` glyph and the indeterminate stripe stands at the start, as nUIget does today. The workbench keeps its loops moving, but `a11y-reduced-motion-both-signals` (owned by the accessibility plan) requires every duration at zero and the harness proposal H5 expects no running animation, so the accessibility rule wins over parity. The loops get their own tokens (1.5 s, 4 s) zeroed in both reduced-motion blocks | `codicon-modifiers.css`, `progressbar.css` (no reduce-motion rule), `paneview.css:126`; `Spinner.tsx` and `primitives.css:602-606` (today); accessibility.md H5 |
| T-10 | Look attributes | `data-look`, `data-density` and `data-uppercase-headers` on `<html>` (ADR-011 Decision 2), written by `renderWebviewHtml` and updated live once a contract item adds a config field; `data-density="compact"` re-values `--nuiget-row-inset-x` to `--nuiget-space-1` (ADR-011 Decision 3, D53) | modern-ui.md §1.1, §7; DECISIONS.md "Which workbench look" |
| T-11 | Label badge shape | padding and radius of the probe's text count badge: M 4/6 pill, C 2/4 radius 2 | `extensions.json badges[3]` (hidden element: computed style only) |
| T-12 | Tab strip heights | Changed by owner round 1: both strips are 36 px, the Extensions editor navbar, as composition A draws them (was 33 for Installed/Updates, the Settings scope tabs of composition B); CSS-read and PNG-consistent, unbound until P0 | `png.extEditorNavbar`; DECISIONS.md round 1 (A: "36 px tab strip") |
| T-13 | Group header variants | Changed by owner round 1: main-list group headers take the pane-header metrics (M 28, 12/600 capitalize, radius 4, hover tint, not inset / C 22, 11/700 uppercase), as composition A draws them in one grouped list per view; details group headers stay 13/600, no transform, 22 px; Title Case text; a divider above every one but the first | DS-TYPE-5, DS-DIVIDER-1; DECISIONS.md round 1 (A: "28 px capitalised group headers") |
| T-14 | Divider roles | main panel `settings.headerBorder` → `panelSection.border` → `panel.border`; the split `settings.sashBorder`; layers `widget.border`; popup `pickerGroup.border` | PNG `settingsHeader.borderColour` #2b2b2b; `quickinput[16] .border` #3c3c3c = `pickerGroup.border` |
| T-15 | Scrim | literal black 50 % in all themes; forced colours keep `Canvas` | `dialog.css:19-20` |
| T-16 | First load | Changed by owner round 2 (D56): the 2 px bar at the list top in every view; Browse shows its rows first under it and fills in icons, authors and downloads; Installed, Updates, Transitive and the details pane add three skeleton rows and the "Loading …" status line; a revalidation keeps rows under the bar | DS-STATE-2; DECISIONS.md round 2 F3a; performance.md finding 6; a11y-first-load-announced |
| T-17 | Quick-search popup | quick-input metrics: layer radius M 8 / C 12, rows 22 with radius M 4 / C 3 and padding M 4 / C 6, separators per DS-DIVIDER-3 | `quickinput.json quickinput[0..16]` |
| T-18 | Layer shadow | `0 2px 8px widget.shadow` (the native hover) for dialogs and popovers; the quick input's `0 0 20px` uses a token webviews do not receive | `quickinput[0] .boxShadow`; `vars` has no `--vscode-shadow-*` |
| T-19 | Empty-state block gap | 8 px (the welcome view's 1em mapped onto P-1's between-group gap) | `views.css:92-130`; DS-GRID-1/2 |
| T-20 | Terms | Title Case group headers; "Authors"; "Pre-Release" in labels and "pre-release" in sentences; "transitive packages" in headers and empty states | DS-COPY-1/2; `extensionsActions.ts` "Switch to Pre-Release Version"; ux-inventory §5.3 M2, M7 |
| T-21 | Explicit fallbacks | aliases a high-contrast theme leaves unset get `transparent` (backgrounds) or `foreground` (text) fallbacks; no rendering change | `vars`: `list.activeSelectionBackground`, `button.secondaryBackground`, `textBlockQuote.background` unset in Dark High Contrast; `list.activeSelectionForeground` in both HC themes |
| T-22 | High-contrast lines | `:root` tokens on HC-only keys (`contrastActiveBorder`, `toolbar.hoverOutline`) with `transparent` fallbacks; the HC block stays three keys | `webview-tokens.test.ts:96-100`; `vars` (both keys unset outside HC) |
| T-23 | Row check mark | Decided by owner round 2 (D52): the 18 px box in `checkbox.*`, and `checkbox.selectBackground` / `checkbox.selectBorder` on a selected row (7.5:1 there in Dark Modern, where the plain border reads 1.5:1) | DECISIONS.md round 2 F1a; `vars` (both keys set in all six themes) |
| T-24 | Row alignment across views | DS-ROW-2 spans Installed, Updates and Browse rows of one pane (a row without a check box keeps the column) | V45, V58 |
| T-25 | Details header | 20 on all four sides (P-2 over the Extensions editor header's 12 px bottom) | `extensionEditor.css:19-26` (CSS-read) |
| T-26 | Section-header actions | 20 px hover box (padding 2), as the Explorer pane-header actions | `explorer.json pane_headers[5]` |
| T-27 | Lines per view | Corrected by the closest-to-the-workbench rule (lead's ruling after round 1): the Extensions row itself has three text lines in 72 px, so Browse rows keep the description as the middle line (line 1 name and badges, line 2 description, line 3 version · downloads · authors with the Verified mark); Installed and Updates rows have no description (D14 kept) and show two lines centred in the same 72 px box; the description also stays in `aria-describedby` | probe `extensions.json ext_parts[2..9]`: name line 18.2 in a 20 px header, description h 15, publisher line box 24, block 5.5–66.5 in 72; interaction model §1 (D14) |
| T-28 | Scrollbars at the 1.90 floor | the WebKit rules draw the token scrollbars (M 8 / C 10 px, thumb in `scrollbarSlider.*`), and the root declares `scrollbar-color: auto` beside them. A colour pair in `scrollbar-color` would switch the WebKit rules, and their 10 px width, off on Chromium 121 and later, which is the V15 defect itself; so the token colours stay on the thumb rules and `scrollbar-color` only cancels the host's inherited value | V15 verification (VS Code's own 10 px defaults are overridden by its `html { scrollbar-color }`, microsoft/vscode#213045); floor.md row 1; `webview-pre-index.html:119` |
| T-29 | Main-list group header box | not inset (an editor list, T-2); radius 4 and the `list.hoverBackground` tint under Modern UI, square without a tint in classic; the chevron at the 16 px inset; trailing badges end 16 from the edge | T-2, DS-INSET-1/3; `paneHeaders.css` |

## 16. Artboard A and this system

The round-1 artboard of composition A (`docs/design/artboards/round1/tokens-A.css`) differed from the adopted rulings in
three places. The lead's rulings (2026-10-23):

| Point | Artboard A | Ruling |
|---|---|---|
| Main-panel rows and group headers under Modern UI | rows and pane headers inset 4 px, row start padding 12 (`--nuiget-row-inset`, `--nuiget-row-padding`) | The Design System wins: neither inset (an editor list), row start padding 16 (T-2, T-29, DS-ROW-3). Artboard A is corrected to the system before its `spec.json` is written (plan P0.27 / P2) |
| Sidebar inset under Modern UI | 12 (`--nuiget-inset-sidebar`, the part title's text x) | The Design System wins: header 8 / 8, titles and rows at 28 (T-3, DS-INSET-1). Same correction before `spec.json` |
| Tab labels | 11 px uppercase, 10 px padding (`--nuiget-tab-font-size`, `--nuiget-tab-transform`, `--nuiget-tab-padding`; the navbar's labels, CSS-read by the artboard) | Bound by UX-P0.14's measurement of the Extensions editor navbar on VS Code 1.140.0: 11 px, weight 400, uppercase, 10 px side padding and a 1 px indicator in both looks, artboard A's values; no look switch (Tabs component) |

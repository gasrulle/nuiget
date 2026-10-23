# CSS audit of the 2.0 webview stylesheets (dimension: css-audit)

Research sweep of the nUIget UX overhaul, 2026-10-22. Repository `/Users/mattias/github/nuiget`, branch `main` at
`e4d6e97`, read-only. Nothing was written, built or staged in the repository (`git status --porcelain
--untracked-files=all` was empty after the esbuild run, which wrote only to the scratchpad).

## 1. Answer first

| Question | Answer (evidence in the sections below) |
|---|---|
| Do the existing lints pass? | Yes. `npx vitest run --project backend` on the four CSS lint files: exit 0, 4 files, 31 tests passed (§2). |
| What do they miss? | 116 exact hits under the six candidate rules: `pxLength` 58, `duplicateSelector` 1, `specificity` 41, `override` 16, `deadRule` 0, `disableComment` 0 (§12). |
| Is spacing on the scale? | Yes, lexically: 0 literal padding, margin or gap in any file since P9.fix-6 (§9). Colour: 0 literals. |
| Where do the literals live? | Lines (34 of the 58 `pxLength` hits are `1px` borders, outlines and offsets), README typography (13 hits in `main.css`), dialog and field widths in `em`, 11 `font-weight: 600` with no weight token (§3, §9). |
| Are the primitives used as primitives? | No. 17 feature rules set non-placement properties on 9 of the 70 primitive classes; 0 are placement-only; 12 of the 17 were introduced in P9.x, 2 in P9.fix-6, 3 in P5.4 (§5). `SectionHeader` alone takes 9 of them. |
| Did P9 patch on top of P3-P5? | Yes. 12 of the 16 cross-file overrides were introduced in P9.x or P9.fix (§6); 28 of the 41 high-specificity selectors were last changed in P9 (§5). |
| Can a static CSS lint see the owner's V1-V5? | No. All five sit on token values or on a missing declaration; a lexical gate reports at most the `1px` borders of those elements. V1-V5 need the geometric harness (§11). |
| Rebuild or refactor? | The token layer (`tokens.css`) is sound and lint-pinned. The primitive layer needs variants it does not have (section header kinds, a non-scrolling list, toolbar spacing, row indent, control primitives for button, input, select and check box). That is a refactor of `primitives.css` plus deletion of the per-surface patches, not a token rebuild (§13). |

Two cascade defects came out of the trace and are not lint matters: hover beats selection in every single-select list
(VS Code does the opposite), and the selection colour never drops to the inactive colour when the list loses focus
(§6.4).

## Method and reproducibility

- Stylesheets read in full: `src/webview/shared/tokens.css` (231 lines), `src/webview/shared/primitives/primitives.css`
  (844), `src/webview/main/main.css` (735), `src/webview/sidebar/sidebar.css` (136), `src/webview/shared/search/search.css`
  (108). These are all the `.css` files under `src/webview` (`find src/webview -name '*.css'`).
- Parsing: `postcss` 8.5.29 (transitive through `vite` 8.3.4) for rules and line numbers; `css-tree` 3.2.1 (transitive
  through `jsdom` 30.1.2) for selectors and specificity; the specificity count was cross-checked with
  `@bramus/specificity` 2.4.3 (also under `jsdom`): 41 of 323 complex selectors above (0,2,0) by both
  (`npm ls postcss css-tree jsdom`). Declaration total 956 equals the count of the repository's own `parseRules`
  algorithm (`src/test/lint/cssRules.ts`) ported to a script: tokens 153, primitives 368, main 325, sidebar 57,
  search 53.
- Cascade order: both entries built with the repository's `esbuild` into the scratchpad (non-minified, same options as
  `esbuild.mjs:68-89`). The CSS bundles concatenate in this order (file markers in the output):
  `dist/webview.css` = primitives.css (line 1) → tokens.css (638) → main.css (806) → search.css (1382);
  `dist/sidebar.css` = primitives.css (1) → tokens.css (638) → sidebar.css (806) → search.css (908). So `search.css`
  comes after the feature stylesheet and wins ties over it.
- Attribution: `git diff --quiet labs/2.0 main -- <file>` exits 0 for all five files, so `git blame -w -M -C labs/2.0`
  line numbers are valid on `main` (main's history has one squash commit, `7772aa2`, for all five). "Introduced by"
  uses `git log -L<range> labs/2.0` (the oldest commit of the range), checked with `git show` where blame's copy
  detection disagreed (blame gives P5.7 `f8bfe3f` for `main.css:703-704` because the two declarations were copied from
  `.nuiget-details-group h4`; `git log -L702,709` shows the rule was introduced by P9.11 `0e02690`).
- Strata used below: **P3-P8** (the 2.0 build, items P3.1-P5.11, P8.x), **P9.x** (the parity items P9.2-P9.11),
  **P9.fix-N** (the owner's screenshot review loop of 2026-10-17: P9.fix-2 `1784642`, P9.fix-3 `8c1f643`, P9.fix-4
  `b83316d`, P9.fix-5 `aacde06`, P9.fix-6 `c50d335`).
- Scripts (scratchpad, re-runnable): `css-audit-work/analyze.mjs` (all rules, writes `facts.json`), `trace.mjs` with
  `installed-screen.html` (cascade trace on a synthetic Installed screen matched by jsdom), `tables.mjs`,
  `counts.mjs`, `speccheck.mjs`, `dead.mjs`, `build.mjs`; the baseline is also in `css-audit-work/baseline.json`
  (sha256 `4417610df19a91ed2daad02bede1155638bafd7fdf6fe7a7a37bcdee6cf42823`, 116 entries). All under
  `/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/research/css-audit-work/`.

## 2. Baseline: what the existing lints deny (all green)

`npx vitest run --project backend src/test/lint/webview-stylesheets.test.ts src/test/lint/webview-colours.test.ts
src/test/lint/webview-tokens.test.ts src/test/lint/webview-css-baseline.test.ts` → exit 0, `Test Files 4 passed (4)`,
`Tests 31 passed (31)` (output in `css-audit-work/lint-baseline.txt`).

| Lint | Denies | Scope | Evidence |
|---|---|---|---|
| `webview-stylesheets.test.ts` | reduced-motion rules, `!important`, px font sizes, literal durations, class without `nuiget-`, px/em/rem in `padding*`/`margin*`/`gap`/`row-gap`/`column-gap`, pointer rule without `min-height: var(--nuiget-target-min)` | every `.css` under `src/webview/{shared,main,sidebar}` except `tokens.css` | `webview-stylesheets.test.ts:11-21,24-57,64-69` |
| `webview-colours.test.ts` | hex and colour functions | `.css/.ts/.tsx` under the same roots except `tokens.css` | `webview-colours.test.ts:14-15,32-37` |
| `webview-tokens.test.ts` | non-token declarations in `tokens.css`, colours that are not `--vscode-*` aliases, a missing required token, more than three keys in the high-contrast block | `tokens.css` | `webview-tokens.test.ts:26-41,48-100` |
| `webview-css-baseline.test.ts` | 26 CSS features newer than Chromium 114 | all five stylesheets | `webview-css-baseline.test.ts:36-63` |

What the ADRs rule: ADR-008 puts "spacing, radius, row heights, icon sizes, z-index scale, motion durations,
`em`-based typography on `--vscode-font-size`" in `tokens.css` and forbids hex colours outside it
(`docs/adr/008-webview-architecture.md:33-35`); it lists the primitives, `Popover` included, each with "RTL + axe tests"
(`:29-32`), and makes accessibility "a property of primitives, not of each feature" (`:44`). It says nothing about
line widths, font weights or other literal lengths. ADR-006 fixes the CSP as `style-src ${cspSource}` with styles set
through the CSSOM only (`docs/adr/006-icons-and-csp.md:19-23`); it does not constrain stylesheet content.

The `pxSpacing` length regex is `/(?<![\w.-])-?\d*\.?\d+(?:px|em|rem)\b/` and applies only when the property matches
`/^(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?$/` (`webview-stylesheets.test.ts:20-21,55`). Everything
below is outside that net.

Tests that pin literal CSS text and would collide with a new length gate:

| Test line | What it requires verbatim |
|---|---|
| `webview-stylesheets.test.ts:161` | `.nuiget-button` has `border: 1px solid var(--nuiget-color-button-border)` |
| `webview-stylesheets.test.ts:162` | `.nuiget-tab` has `border: 1px solid var(--nuiget-color-contrast-border)` |
| `webview-stylesheets.test.ts:163` | the row icon has `outline: 1px solid var(--nuiget-color-contrast-border)` |
| `webview-stylesheets.test.ts:166` | `.nuiget-main-select` has `border: 1px solid var(--nuiget-color-dropdown-border)` |
| `webview-stylesheets.test.ts:178,180-187` | 13 named selectors carry exactly `outline: 1px solid var(--nuiget-color-focus)` |
| `webview-stylesheets.test.ts:189` | every `outline:` is one of `none`, `1px solid var(--nuiget-color-focus)`, `1px solid var(--nuiget-color-contrast-border)` |
| `webview-stylesheets.test.ts:238` | the "allowed" sample contains `width: 1px` and must produce no defect |

Tests that read the first rule of a prelude with `.find()` and so cannot see a later duplicate:
`webview-stylesheets.test.ts:113,132,141,148`.


## 3. (a) Literal lengths outside padding, margin and gap

**Rule `pxLength` (exact).** In every stylesheet the existing lint scans (all `.css` under `src/webview/shared`,
`src/webview/main`, `src/webview/sidebar` except `src/webview/shared/tokens.css`), a declaration whose property is not
a custom property (`--*`) and does not match the existing `SPACING` regex, and whose value matches the existing
`LENGTH` regex `/(?<![\w.-])-?\d*\.?\d+(?:px|em|rem)\b/` at least once. One entry per declaration; `selector` is the
rule's whole prelude with whitespace collapsed to one space; `line` is the declaration's line. Declarations inside
`@keyframes` count (there are none with px/em/rem). `%`, `vh`, `vw`, `deg` and unitless numbers are out of the rule and
listed separately (T-a2, T-a3).

**Count: 58** (primitives.css 19, main.css 32, sidebar.css 4, search.css 3).

| Bucket | Hits | Note |
|---|---|---|
| `1px` in `border*`, `outline`, `outline-offset` (incl. `-1px`, `+1px`) | 34 | the hairline; pinned verbatim by the tests in §2 |
| `1px` box of a visually hidden element (`width`/`height`) | 4 | `primitives.css:10-11,330-331` |
| line wider than 1 px | 6 | checkbox mark `border-width: 0 2px 2px 0` (`main.css:78`), README `border-left: 4px/3px/3px` (`main.css:400,410,416`), blockquote `4px` (`main.css:486`), `hr` `2px` (`main.css:498`) |
| `box-shadow` offsets | 3 | `inset 3px 0 0` ×2 (`primitives.css:276,284`, the 1.x selection accent), `0 2px 8px` (`search.css:46`) while the two primitive shadows are built from tokens (`primitives.css:722,771`) |
| `em` font sizes | 5 | README headings `1.6em/1.4em/1.2em/1.05em/1em` (`main.css:401,411,417,421,427`); `pxFontSize` denies only px (`webview-stylesheets.test.ts:35-37`) |
| `em` box sizes | 6 | `.nuiget-dialog` `min(32em, 100%)`, `.nuiget-main-select` `max-width: 20em`, details labels `5em`/`7em`, `.nuiget-add-source` `min(28em, 80vw)`, `.nuiget-search-popup` `max-height: 16em` |

No ADR decides the hairline or the font weights (ADR-008 is silent on both, `008-webview-architecture.md:33-35`);
the README `em` font sizes sit outside the typography that ADR-008 assigns to `tokens.css`.

Without the hairline (34) and the visually hidden box (4), 20 literal lengths remain. That number decides the gate's
shape: a hairline exemption keeps the seven pinned test lines of §2 green; a `--nuiget-border-width` token changes all
seven and 34 declarations.

#### T-a1 pxLength hits (58)

| # | file:line | selector | property | value | rule first line (blame) | declaration line (blame) |
|---|---|---|---|---|---|---|
| 1 | shared/primitives/primitives.css:10 | `.nuiget-visually-hidden` | width | `1px` | P3.2 81ec41d | P3.2 81ec41d |
| 2 | shared/primitives/primitives.css:11 | `.nuiget-visually-hidden` | height | `1px` | P3.2 81ec41d | P3.2 81ec41d |
| 3 | shared/primitives/primitives.css:135 | `.nuiget-row-check` | border | `1px solid var(--nuiget-color-border)` | P5.4 4a083b5 | P5.1 d7a79ba |
| 4 | shared/primitives/primitives.css:240 | `.nuiget-row--comfortable` | border-bottom | `1px solid var(--nuiget-color-border)` | P3.2 81ec41d | P9.2 83afc1b |
| 5 | shared/primitives/primitives.css:263 | `.nuiget-row-icon img, .nuiget-row-icon svg` | outline | `1px solid var(--nuiget-color-contrast-border)` | P9.2 83afc1b | P9.11 c946043 |
| 6 | shared/primitives/primitives.css:264 | `.nuiget-row-icon img, .nuiget-row-icon svg` | outline-offset | `-1px` | P9.2 83afc1b | P9.11 c946043 |
| 7 | shared/primitives/primitives.css:276 | `.nuiget-row--comfortable .nuiget-row-option[aria-selected="true"]` | box-shadow | `inset 3px 0 0 var(--nuiget-color-focus)` | P9.2 83afc1b | P9.2 83afc1b |
| 8 | shared/primitives/primitives.css:284 | `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row--comfortable .nuiget-row-option[aria-current="true"]` | box-shadow | `inset 3px 0 0 var(--nuiget-color-focus)` | P9.2 83afc1b | P9.2 83afc1b |
| 9 | shared/primitives/primitives.css:330 | `.nuiget-row--compact .nuiget-row-authors, .nuiget-row--compact .nuiget-row-meta, .nuiget-row--compact .nuiget-row-description, .nuiget-row--compact .nuiget-row-status` | width | `1px` | P9.2 83afc1b | P3.2 81ec41d |
| 10 | shared/primitives/primitives.css:331 | `.nuiget-row--compact .nuiget-row-authors, .nuiget-row--compact .nuiget-row-meta, .nuiget-row--compact .nuiget-row-description, .nuiget-row--compact .nuiget-row-status` | height | `1px` | P9.2 83afc1b | P3.2 81ec41d |
| 11 | shared/primitives/primitives.css:361 | `.nuiget-row-option:focus-visible, .nuiget-icon-button:focus-visible, .nuiget-sash:focus-visible, .nuiget-section-toggle:focus-visible, .nuiget-button:focus-visible, .nuiget-tab:focus-visible, .nuiget-dialog:focus-visible, .nuiget-popover:focus-visible` | outline | `1px solid var(--nuiget-color-focus)` | P3.2 81ec41d | P3.2 81ec41d |
| 12 | shared/primitives/primitives.css:362 | `.nuiget-row-option:focus-visible, .nuiget-icon-button:focus-visible, .nuiget-sash:focus-visible, .nuiget-section-toggle:focus-visible, .nuiget-button:focus-visible, .nuiget-tab:focus-visible, .nuiget-dialog:focus-visible, .nuiget-popover:focus-visible` | outline-offset | `-1px` | P3.2 81ec41d | P3.2 81ec41d |
| 13 | shared/primitives/primitives.css:402 | `.nuiget-badge` | border | `1px solid transparent` | P3.2 81ec41d | P3.2 c48d30b |
| 14 | shared/primitives/primitives.css:510 | `.nuiget-button` | border | `1px solid var(--nuiget-color-button-border)` | P3.2 c48d30b | P9.11 c946043 |
| 15 | shared/primitives/primitives.css:714 | `.nuiget-dialog` | width | `min(32em, 100%)` | P5.1 d7a79ba | P5.1 d7a79ba |
| 16 | shared/primitives/primitives.css:718 | `.nuiget-dialog` | border | `1px solid var(--nuiget-color-border)` | P5.1 d7a79ba | P5.1 d7a79ba |
| 17 | shared/primitives/primitives.css:767 | `.nuiget-popover` | border | `1px solid var(--nuiget-color-border)` | P5.1 d7a79ba | P5.1 d7a79ba |
| 18 | shared/primitives/primitives.css:796 | `.nuiget-tablist` | border-block-end | `1px solid var(--nuiget-color-border)` | P5.1 d7a79ba | P5.1 d7a79ba |
| 19 | shared/primitives/primitives.css:806 | `.nuiget-tab` | border | `1px solid var(--nuiget-color-contrast-border)` | P5.1 d7a79ba | P9.11 c946043 |
| 20 | main/main.css:33 | `.nuiget-main-select` | max-width | `20em` | P5.3 7385eeb | P5.3 7385eeb |
| 21 | main/main.css:36 | `.nuiget-main-select` | border | `1px solid var(--nuiget-color-dropdown-border)` | P5.3 7385eeb | P9.11 c946043 |
| 22 | main/main.css:64 | `.nuiget-main input[type="checkbox"], .nuiget-dialog input[type="checkbox"]` | border | `1px solid var(--nuiget-color-checkbox-border)` | P9.11 c946043 | P9.11 c946043 |
| 23 | main/main.css:78 | `.nuiget-main input[type="checkbox"]:checked::after, .nuiget-dialog input[type="checkbox"]:checked::after` | border-width | `0 2px 2px 0` | P9.11 c946043 | P9.11 c946043 |
| 24 | main/main.css:90 | `.nuiget-main input[type="checkbox"]:focus-visible, .nuiget-dialog input[type="checkbox"]:focus-visible` | outline | `1px solid var(--nuiget-color-focus)` | P9.11 c946043 | P5.3 7385eeb |
| 25 | main/main.css:91 | `.nuiget-main input[type="checkbox"]:focus-visible, .nuiget-dialog input[type="checkbox"]:focus-visible` | outline-offset | `1px` | P9.11 c946043 | P9.11 c946043 |
| 26 | main/main.css:112 | `.nuiget-main-search` | border-block-end | `1px solid var(--nuiget-color-border)` | P5.3 7385eeb | P9.11 0e02690 |
| 27 | main/main.css:126 | `.nuiget-main-search-input` | border | `1px solid var(--nuiget-color-input-border)` | P5.3 7385eeb | P5.3 7385eeb |
| 28 | main/main.css:139 | `.nuiget-main-select:focus-visible, .nuiget-main-search-input:focus` | outline | `1px solid var(--nuiget-color-focus)` | P5.3 7385eeb | P5.3 7385eeb |
| 29 | main/main.css:140 | `.nuiget-main-select:focus-visible, .nuiget-main-search-input:focus` | outline-offset | `-1px` | P5.3 7385eeb | P5.3 7385eeb |
| 30 | main/main.css:308 | `.nuiget-details-row > .nuiget-details-label` | min-width | `5em` | P9.fix-5 aacde06 | P5.7 f8bfe3f |
| 31 | main/main.css:338 | `.nuiget-details-fact dt` | min-width | `7em` | P5.7 f8bfe3f | P5.7 f8bfe3f |
| 32 | main/main.css:400 | `.nuiget-readme h1` | border-left | `4px solid var(--nuiget-color-link)` | P9.8 b61ada2 | P9.8 b61ada2 |
| 33 | main/main.css:401 | `.nuiget-readme h1` | font-size | `1.6em` | P9.8 b61ada2 | P9.8 b61ada2 |
| 34 | main/main.css:410 | `.nuiget-readme h2` | border-left | `3px solid var(--nuiget-color-link)` | P9.8 b61ada2 | P9.8 b61ada2 |
| 35 | main/main.css:411 | `.nuiget-readme h2` | font-size | `1.4em` | P9.8 b61ada2 | P9.8 b61ada2 |
| 36 | main/main.css:416 | `.nuiget-readme h3` | border-left | `3px solid var(--nuiget-color-border)` | P9.8 b61ada2 | P9.8 b61ada2 |
| 37 | main/main.css:417 | `.nuiget-readme h3` | font-size | `1.2em` | P9.8 b61ada2 | P9.8 b61ada2 |
| 38 | main/main.css:421 | `.nuiget-readme h4` | font-size | `1.05em` | P9.8 b61ada2 | P9.8 b61ada2 |
| 39 | main/main.css:427 | `.nuiget-readme h5, .nuiget-readme h6` | font-size | `1em` | P9.8 b61ada2 | P9.8 b61ada2 |
| 40 | main/main.css:447 | `.nuiget-readme code` | border | `1px solid var(--nuiget-color-border)` | P9.8 b61ada2 | P5.7 f8bfe3f |
| 41 | main/main.css:463 | `.nuiget-readme table` | border | `1px solid var(--nuiget-color-border)` | P9.8 b61ada2 | P5.7 f8bfe3f |
| 42 | main/main.css:470 | `.nuiget-readme th, .nuiget-readme td` | border-bottom | `1px solid var(--nuiget-color-border)` | P9.8 b61ada2 | P5.8 69205e2 |
| 43 | main/main.css:486 | `.nuiget-readme blockquote` | border-left | `4px solid var(--nuiget-color-blockquote-border)` | P9.8 b61ada2 | P9.8 b61ada2 |
| 44 | main/main.css:498 | `.nuiget-readme hr` | border-top | `2px solid var(--nuiget-color-border)` | P9.8 b61ada2 | P9.8 b61ada2 |
| 45 | main/main.css:525 | `.nuiget-readme-copy` | border | `1px solid var(--nuiget-color-border)` | P5.7 f8bfe3f | P5.7 f8bfe3f |
| 46 | main/main.css:535 | `.nuiget-readme-copy:focus-visible` | outline | `1px solid var(--nuiget-color-focus)` | P5.7 f8bfe3f | P5.3 7385eeb |
| 47 | main/main.css:610 | `.nuiget-source-row` | border-bottom | `1px solid var(--nuiget-color-border)` | P5.8 69205e2 | P5.8 69205e2 |
| 48 | main/main.css:641 | `.nuiget-add-source` | min-width | `min(28em, 80vw)` | P5.8 69205e2 | P5.8 69205e2 |
| 49 | main/main.css:666 | `.nuiget-input` | border | `1px solid var(--nuiget-color-input-border)` | P5.8 69205e2 | P5.3 7385eeb |
| 50 | main/main.css:678 | `.nuiget-input:focus` | outline | `1px solid var(--nuiget-color-focus)` | P5.8 69205e2 | P5.3 7385eeb |
| 51 | main/main.css:679 | `.nuiget-input:focus` | outline-offset | `-1px` | P5.8 69205e2 | P5.3 7385eeb |
| 52 | sidebar/sidebar.css:35 | `.nuiget-sidebar-search` | border | `1px solid var(--nuiget-color-input-border)` | P3.4 8c95e9e | P3.4 8c95e9e |
| 53 | sidebar/sidebar.css:47 | `.nuiget-sidebar-search:focus-visible` | outline | `1px solid var(--nuiget-color-focus)` | P3.4 8c95e9e | P3.4 8c95e9e |
| 54 | sidebar/sidebar.css:48 | `.nuiget-sidebar-search:focus-visible` | outline-offset | `-1px` | P3.4 8c95e9e | P3.4 8c95e9e |
| 55 | sidebar/sidebar.css:103 | `.nuiget-sidebar-section > .nuiget-section-header` | border-top | `1px solid var(--nuiget-color-section-header-border)` | P9.10 8388bff | P9.10 8388bff |
| 56 | shared/search/search.css:39 | `.nuiget-search-popup` | max-height | `16em` | P9.6 eeef52d | P5.6 4dfa2e5 |
| 57 | shared/search/search.css:43 | `.nuiget-search-popup` | border | `1px solid var(--nuiget-color-border)` | P9.6 eeef52d | P5.6 4dfa2e5 |
| 58 | shared/search/search.css:46 | `.nuiget-search-popup` | box-shadow | `0 2px 8px var(--nuiget-color-shadow)` | P9.6 eeef52d | P5.6 4dfa2e5 |

#### T-a2 percent, viewport and angle literals (informational, outside pxLength)

| file:line | selector | property | value | literals |
|---|---|---|---|---|
| shared/primitives/primitives.css:15 | `.nuiget-visually-hidden` | clip-path | `inset(50%)` | 50% |
| shared/primitives/primitives.css:78 | `.nuiget-row` | width | `100%` | 100% |
| shared/primitives/primitives.css:260 | `.nuiget-row-icon img, .nuiget-row-icon svg` | inline-size | `100%` | 100% |
| shared/primitives/primitives.css:261 | `.nuiget-row-icon img, .nuiget-row-icon svg` | block-size | `100%` | 100% |
| shared/primitives/primitives.css:270 | `.nuiget-row--comfortable .nuiget-row-name` | min-width | `40%` | 40% |
| shared/primitives/primitives.css:307 | `.nuiget-row--compact .nuiget-row-name` | max-width | `70%` | 70% |
| shared/primitives/primitives.css:333 | `.nuiget-row--compact .nuiget-row-authors, .nuiget-row--compact .nuiget-row-meta, .nuiget-row--compact .nuiget-row-description, .nuiget-row--compact .nuiget-row-status` | clip-path | `inset(50%)` | 50% |
| shared/primitives/primitives.css:445 | `to` | transform | `rotate(360deg)` | 360deg |
| shared/primitives/primitives.css:496 | `.nuiget-section-toggle[aria-expanded="true"] .nuiget-section-chevron` | transform | `rotate(90deg)` | 90deg |
| shared/primitives/primitives.css:595 | `.nuiget-progress-bar` | height | `100%` | 100% |
| shared/primitives/primitives.css:604 | `.nuiget-progress--indeterminate .nuiget-progress-bar` | width | `30%` | 30% |
| shared/primitives/primitives.css:610 | `from` | transform | `translateX(-100%)` | -100% |
| shared/primitives/primitives.css:614 | `to` | transform | `translateX(334%)` | 334% |
| shared/primitives/primitives.css:714 | `.nuiget-dialog` | width | `min(32em, 100%)` | 100% |
| shared/primitives/primitives.css:715 | `.nuiget-dialog` | max-height | `100%` | 100% |
| shared/primitives/primitives.css:763 | `.nuiget-popover` | max-width | `calc(100vw - 2 * var(--nuiget-space-2))` | 100vw |
| shared/primitives/primitives.css:764 | `.nuiget-popover` | max-height | `calc(100vh - 2 * var(--nuiget-space-2))` | 100vh |
| main/main.css:15 | `.nuiget-main` | height | `100vh` | 100vh |
| main/main.css:79 | `.nuiget-main input[type="checkbox"]:checked::after, .nuiget-dialog input[type="checkbox"]:checked::after` | transform | `rotate(45deg)` | 45deg |
| main/main.css:123 | `.nuiget-main-search-input` | width | `100%` | 100% |
| main/main.css:155 | `.nuiget-main-list` | width | `var(--nuiget-split, 50%)` | 50% |
| main/main.css:382 | `.nuiget-readme img` | max-width | `100%` | 100% |
| main/main.css:461 | `.nuiget-readme table` | width | `100%` | 100% |
| main/main.css:597 | `.nuiget-source-list` | max-height | `50vh` | 50vh |
| main/main.css:641 | `.nuiget-add-source` | min-width | `min(28em, 80vw)` | 80vw |
| main/main.css:717 | `.nuiget-multi-install` | max-height | `50vh` | 50vh |
| sidebar/sidebar.css:15 | `.nuiget-sidebar` | height | `100vh` | 100vh |
| sidebar/sidebar.css:32 | `.nuiget-sidebar-search` | width | `100%` | 100% |
| shared/search/search.css:36 | `.nuiget-search-popup` | top | `100%` | 100% |

Of the 29 rows above, 15 are the "fill the box" idiom (`100%`, `100vh`, `100vw`), 2 are the visually hidden
`clip-path`, 3 are rotation angles and 9 are layout magic numbers: `min-width: 40%` and `max-width: 70%` on the row name
(`primitives.css:270,307`), the indeterminate stripe `30%` and its keyframes `-100%`/`334%`
(`primitives.css:604,610,614`), `max-height: 50vh` twice (`main.css:597,717`), `80vw` (`main.css:641`), the split
default `50%` (`main.css:155`).

#### T-a3 unitless numeric literals (informational)

| file:line | selector | property | value |
|---|---|---|---|
| shared/primitives/primitives.css:212 | `.nuiget-row-version-new` | font-weight | 600 |
| shared/primitives/primitives.css:271 | `.nuiget-row--comfortable .nuiget-row-name` | font-weight | 600 |
| shared/primitives/primitives.css:304 | `.nuiget-row--compact .nuiget-row-name` | flex-grow | 0 |
| shared/primitives/primitives.css:305 | `.nuiget-row--compact .nuiget-row-name` | flex-shrink | 0 |
| shared/primitives/primitives.css:311 | `.nuiget-row--compact .nuiget-row-version` | flex-grow | 0 |
| shared/primitives/primitives.css:312 | `.nuiget-row--compact .nuiget-row-version` | flex-shrink | 1 |
| shared/primitives/primitives.css:320 | `.nuiget-row--compact .nuiget-row-badges` | order | 1 |
| shared/primitives/primitives.css:464 | `.nuiget-section-heading` | font-weight | 600 |
| shared/primitives/primitives.css:578 | `from` | opacity | 1 |
| shared/primitives/primitives.css:582 | `to` | opacity | 0.5 |
| shared/primitives/primitives.css:736 | `.nuiget-dialog-title` | font-weight | 600 |
| main/main.css:99 | `.nuiget-main-title` | font-weight | 600 |
| main/main.css:394 | `.nuiget-readme h1, .nuiget-readme h2, .nuiget-readme h3, .nuiget-readme h4, .nuiget-readme h5, .nuiget-readme h6` | font-weight | 600 |
| main/main.css:395 | `.nuiget-readme h1, .nuiget-readme h2, .nuiget-readme h3, .nuiget-readme h4, .nuiget-readme h5, .nuiget-readme h6` | line-height | 1.25 |
| main/main.css:476 | `.nuiget-readme th` | font-weight | 600 |
| main/main.css:694 | `.nuiget-installed-folder-title` | font-weight | 600 |
| sidebar/sidebar.css:83 | `.nuiget-sidebar-folder-caption` | font-weight | 600 |
| shared/search/search.css:57 | `.nuiget-search-popup-header` | font-weight | 600 |
| shared/search/search.css:66 | `.nuiget-search-group-header` | font-weight | 600 |

`font-weight: 600` appears 11 times and `normal` 3 times; `tokens.css` has no weight token (`tokens.css:59-65`).
`line-height: 1.25` (`main.css:395`) is the only line height that is not `--nuiget-line-height`. Outside CSS the icon
sizes are TSX literals: the default 16 (`icons.tsx:24`), `VerifiedIcon` 14 (`icons.tsx:151`, not on the icon scale
12/16/24/32 of `tokens.css:36-39`), `CheckIcon size={12}` (`Row.tsx:135`).


## 4. (b) Selectors declared twice

**Rule `duplicateSelector` (exact).** Within one bundle in cascade order (main: primitives → tokens → main → search;
sidebar: primitives → tokens → sidebar → search), a style rule outside `@keyframes` whose whole prelude (whitespace
collapsed) and at-rule context equal those of an earlier rule. One entry per later rule, deduplicated across the two
bundles; `property` is null, `value` is `file:line` of the first rule, `line` is the later rule's first line. The
later rule must be in a linted stylesheet; `tokens.css` is read only as a possible earlier rule (its three `:root`
blocks differ in context, so it contributes nothing).

**Count: 1.** `.nuiget-row--comfortable` at `primitives.css:238` repeats `primitives.css:86` (P9.2 split the
comfortable card into a second block: `83afc1b`, then `8c1f643` P9.fix-3). Both bundles.

Across files: `body { margin: 0; padding: 0; }` is in `main.css:7-10` and `sidebar.css:7-10`; they never share a bundle
(§1 method), so the rule does not count them. No other prelude appears in two files.

Informational, the same complex selector in two rules (layering, not a patch; not in the baseline):

| Selector | Rules |
|---|---|
| `.nuiget-row--comfortable` | `primitives.css:86`, `primitives.css:238` |
| `.nuiget-row-description` | `primitives.css:156` (in a list), `primitives.css:163` |
| `.nuiget-sash:focus-visible` | `primitives.css:355` (focus ring list), `primitives.css:689` (with `:hover`) |
| `body` | `main.css:7`, `sidebar.css:7` (different bundles) |
| `.nuiget-readme h1` … `h6` | `main.css:387-392` (shared block) and `main.css:398,408,414,420,424-425` |
| `.nuiget-readme ul`, `ol` | `main.css:431-432`, `main.css:436-437` |
| `.nuiget-readme th` | `main.css:467`, `main.css:474` |

## 5. (c) Specificity and reaches into primitives

**Rule `specificity` (exact).** Every complex selector (one item of a selector list) outside `@keyframes` in the
linted stylesheets whose specificity (a,b,c) is lexicographically greater than (0,2,0). Specificity per Selectors
Level 4: `:not()`, `:is()`, `:has()` take their most specific argument, `:where()` counts 0, pseudo-elements count in
c, `:nth-child(even)` counts 1 in b. One entry per complex selector; `property` null; `value` `"(a,b,c)"`; `line` the
line the complex selector starts on.

**Count: 41** of 323 complex selectors (primitives.css 23, main.css 15, sidebar.css 2, search.css 1). 35 have b > 2;
6 have b = 2 with a type or pseudo-element tail. Maximum (0,5,0) (`primitives.css:279,283`). No id selector
anywhere. By blame of the selector line: P3-P8 13, P9.x 28.

Where the specificity comes from:

- **State as attributes on descendants.** The 12-selector `color: inherit` block (`primitives.css:172-185`) restyles
  six secondary text classes under `[aria-selected]` and `[aria-current]`, each (0,3,0); it grew from 6 selectors
  (P5.11 `a571f66`) to 12 (P9.2 `83afc1b`) and was edited again by P9.4 `803b93f` and P9.6 `fc8b150`
  (`git log -L172,185`; selector count per `git show <sha>:…primitives.css`).
- **Two selection models in one primitive.** `[aria-multiselectable="true"]` prefixes (`primitives.css:117,122,279,283`)
  override the single-select rules, and the comfortable card's accent needs (0,5,0) to undo and redo itself.
- **Feature-side context chains.** `main.css:702,707` and `sidebar.css:108,113` reach a primitive's inner part through
  a feature class and the primitive's outer class.
- **Element tails.** The check box rules (`main.css:55-92`) style `input[type="checkbox"]` under `.nuiget-main` and
  `.nuiget-dialog`; README rules end in type selectors.

#### T-c1 specificity above (0,2,0) (41)

| # | file:line | specificity | class | selector | selector line (blame) |
|---|---|---|---|---|---|
| 1 | shared/primitives/primitives.css:102 | (0,3,0) | b>2 | `.nuiget-row:hover .nuiget-row-option` | P3.2 81ec41d |
| 2 | shared/primitives/primitives.css:117 | (0,4,0) | b>2 | `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row-option[aria-selected="true"]` | P5.4 4a083b5 |
| 3 | shared/primitives/primitives.css:122 | (0,4,0) | b>2 | `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row-option[aria-current="true"]` | P5.4 4a083b5 |
| 4 | shared/primitives/primitives.css:145 | (0,3,0) | b>2 | `.nuiget-row-option[aria-disabled="true"] .nuiget-row-name` | P3.2 81ec41d |
| 5 | shared/primitives/primitives.css:172 | (0,3,0) | b>2 | `.nuiget-row-option[aria-selected="true"] .nuiget-row-version` | P5.11 a571f66 |
| 6 | shared/primitives/primitives.css:173 | (0,3,0) | b>2 | `.nuiget-row-option[aria-selected="true"] .nuiget-row-description` | P5.11 a571f66 |
| 7 | shared/primitives/primitives.css:174 | (0,3,0) | b>2 | `.nuiget-row-option[aria-selected="true"] .nuiget-row-status` | P5.11 a571f66 |
| 8 | shared/primitives/primitives.css:175 | (0,3,0) | b>2 | `.nuiget-row-option[aria-current="true"] .nuiget-row-version` | P5.11 a571f66 |
| 9 | shared/primitives/primitives.css:176 | (0,3,0) | b>2 | `.nuiget-row-option[aria-current="true"] .nuiget-row-description` | P5.11 a571f66 |
| 10 | shared/primitives/primitives.css:177 | (0,3,0) | b>2 | `.nuiget-row-option[aria-current="true"] .nuiget-row-status` | P9.2 83afc1b |
| 11 | shared/primitives/primitives.css:178 | (0,3,0) | b>2 | `.nuiget-row-option[aria-selected="true"] .nuiget-row-version-new` | P9.2 83afc1b |
| 12 | shared/primitives/primitives.css:179 | (0,3,0) | b>2 | `.nuiget-row-option[aria-selected="true"] .nuiget-row-authors` | P9.2 83afc1b |
| 13 | shared/primitives/primitives.css:180 | (0,3,0) | b>2 | `.nuiget-row-option[aria-selected="true"] .nuiget-row-meta` | P9.6 fc8b150 |
| 14 | shared/primitives/primitives.css:181 | (0,3,0) | b>2 | `.nuiget-row-option[aria-current="true"] .nuiget-row-version-new` | P9.2 83afc1b |
| 15 | shared/primitives/primitives.css:182 | (0,3,0) | b>2 | `.nuiget-row-option[aria-current="true"] .nuiget-row-authors` | P9.6 fc8b150 |
| 16 | shared/primitives/primitives.css:183 | (0,3,0) | b>2 | `.nuiget-row-option[aria-current="true"] .nuiget-row-meta` | P9.6 fc8b150 |
| 17 | shared/primitives/primitives.css:275 | (0,3,0) | b>2 | `.nuiget-row--comfortable .nuiget-row-option[aria-selected="true"]` | P9.2 83afc1b |
| 18 | shared/primitives/primitives.css:279 | (0,5,0) | b>2 | `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row--comfortable .nuiget-row-option[aria-selected="true"]` | P9.2 83afc1b |
| 19 | shared/primitives/primitives.css:283 | (0,5,0) | b>2 | `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row--comfortable .nuiget-row-option[aria-current="true"]` | P9.2 83afc1b |
| 20 | shared/primitives/primitives.css:344 | (0,3,0) | b>2 | `.nuiget-row:hover .nuiget-row-actions` | P3.2 81ec41d |
| 21 | shared/primitives/primitives.css:345 | (0,3,0) | b>2 | `.nuiget-row:focus-within .nuiget-row-actions` | P3.2 81ec41d |
| 22 | shared/primitives/primitives.css:495 | (0,3,0) | b>2 | `.nuiget-section-toggle[aria-expanded="true"] .nuiget-section-chevron` | P3.2 c48d30b |
| 23 | shared/primitives/primitives.css:530 | (0,3,0) | b>2 | `.nuiget-button:disabled:hover` | P5.1 d7a79ba |
| 24 | main/main.css:55 | (0,2,1) | b=2, c>0 | `.nuiget-main input[type="checkbox"]` | P9.11 c946043 |
| 25 | main/main.css:56 | (0,2,1) | b=2, c>0 | `.nuiget-dialog input[type="checkbox"]` | P9.11 c946043 |
| 26 | main/main.css:71 | (0,3,2) | b>2 | `.nuiget-main input[type="checkbox"]:checked::after` | P9.11 c946043 |
| 27 | main/main.css:72 | (0,3,2) | b>2 | `.nuiget-dialog input[type="checkbox"]:checked::after` | P9.11 c946043 |
| 28 | main/main.css:82 | (0,3,1) | b>2 | `.nuiget-main input[type="checkbox"]:disabled` | P9.11 c946043 |
| 29 | main/main.css:83 | (0,3,1) | b>2 | `.nuiget-dialog input[type="checkbox"]:disabled` | P9.11 c946043 |
| 30 | main/main.css:88 | (0,3,1) | b>2 | `.nuiget-main input[type="checkbox"]:focus-visible` | P9.11 c946043 |
| 31 | main/main.css:89 | (0,3,1) | b>2 | `.nuiget-dialog input[type="checkbox"]:focus-visible` | P9.11 c946043 |
| 32 | main/main.css:404 | (0,2,1) | b=2, c>0 | `.nuiget-readme h1:first-child` | P9.8 b61ada2 |
| 33 | main/main.css:479 | (0,2,2) | b=2, c>0 | `.nuiget-readme tbody tr:nth-child(even)` | P9.8 b61ada2 |
| 34 | main/main.css:491 | (0,2,2) | b=2, c>0 | `.nuiget-readme blockquote p:last-child` | P9.8 b61ada2 |
| 35 | main/main.css:543 | (0,3,0) | b>2 | `.nuiget-readme-copy[data-copied] .nuiget-readme-copy-icon--copy` | P9.8 b61ada2 |
| 36 | main/main.css:544 | (0,3,0) | b>2 | `.nuiget-readme-copy:not([data-copied]) .nuiget-readme-copy-icon--check` | P9.8 b61ada2 |
| 37 | main/main.css:702 | (0,3,0) | b>2 | `.nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-heading` | P9.11 0e02690 |
| 38 | main/main.css:707 | (0,3,0) | b>2 | `.nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-toggle` | P9.11 0e02690 |
| 39 | sidebar/sidebar.css:108 | (0,3,0) | b>2 | `.nuiget-sidebar-section > .nuiget-section-header .nuiget-section-toggle` | P9.10 8388bff |
| 40 | sidebar/sidebar.css:113 | (0,3,0) | b>2 | `.nuiget-sash--horizontal + .nuiget-sidebar-section > .nuiget-section-header` | P9.10 8388bff |
| 41 | shared/search/search.css:19 | (0,2,2) | b=2, c>0 | `.nuiget-search-box > input[type="search"]::-webkit-search-cancel-button` | P9.7 3bfc748 |

### 5.1 Rules outside primitives.css that set a property on a primitive

**Definition.** Primitive classes: every class in a `primitives.css` selector (70 classes). A hit is a rule outside
`primitives.css` whose subject compound (the part after the last combinator) contains a primitive class. Kind:
**placement** when every declaration is one of `grid-*`, `flex`, `flex-grow`, `flex-shrink`, `flex-basis`, `order`,
`align-self`, `justify-self`, `margin`, `margin-*`; otherwise **OVERRIDE**.

**17 rules, all OVERRIDE, 0 placement-only; 9 of the 70 primitive classes are reached.** By origin (`git log -L`):
P5.4 3, P9.7 1, P9.8 2, P9.10 7, P9.11 2, P9.fix-6 2.

| Primitive class | Feature rules that set a property on it |
|---|---|
| `nuiget-section-toggle` | `main.css:168` (padding-inline-start, P9.fix-6), `main.css:358` (text-transform, P9.8), `main.css:707` (text-transform, P9.11), `sidebar.css:108` (color, P9.10), `sidebar.css:128` (padding-inline-start, text-transform, P9.10) |
| `nuiget-section-heading` | `main.css:702` (font-size, font-weight, P9.11), `sidebar.css:123` (font-size, font-weight, P9.10) |
| `nuiget-section-header` | `sidebar.css:102` (border-top, background, color, P9.10), `sidebar.css:113` (border-top-color, P9.10) |
| `nuiget-row-option` | `sidebar.css:118`, `sidebar.css:133` (padding-inline-start, P9.10) |
| `nuiget-listbox` | `main.css:218` (flex, overflow; P5.4 as `--all`, widened by P9.fix-2), `main.css:230` (flex, overflow, P5.4) |
| `nuiget-toolbar` | `main.css:190` (flex, padding, padding-inline-end; P5.4, edited P9.fix-4 and P9.fix-6) |
| `nuiget-tablist` | `main.css:164` (padding-inline-start, P9.fix-6) |
| `nuiget-tabpanel` | `main.css:264` (overflow, P9.8) |
| `nuiget-progress` | `main.css:115` (position, inset-inline, bottom; P9.7, edited P9.fix-6) |
| the other 61 primitive classes | none |

`SectionHeader` (header, heading, toggle) takes 9 of the 17. The primitive has one look (`primitives.css:451-503`:
uppercase, `--nuiget-font-size-sm`, 600, no inline-end padding, no pane chrome) and every surface that needs another
one overrides it: the main list's inset, All Projects project headers in normal case, dependency groups in normal
case, the sidebar's pane-header colours and top line, the sidebar project headers indented by
`--nuiget-tree-indent`. The tokens for the pane-header look (`--nuiget-color-section-header-bg/-fg/-border`,
`tokens.css:93-95`) are used by one rule only (`sidebar.css:102-106`).

Reaches by element selector, outside the class definition above (same effect, invisible to a class-based rule):

| Rule | Reaches into | Effect |
|---|---|---|
| `main.css:56,72,83,89` `.nuiget-dialog input[type="checkbox"]…` | the `Dialog` primitive's content | the check box look lives in the main surface's stylesheet; it applies to dialogs of the main bundle only (P9.11 `c946043`) |
| `main.css:352-356` `.nuiget-details-group h4` | `SectionHeader` rendered with `level={4}` (`DetailsInfo.tsx:88`, `SectionHeader.tsx:35,38` renders `<h4 className="nuiget-section-heading">`) | (0,1,1) beats `.nuiget-section-heading` (0,1,0): margin, font-size md, font-weight normal (P5.7 `f8bfe3f`) |
| `search.css:11-17` `.nuiget-search-box > input` | the `className` the surface gives the input (`MainShell.tsx:261`, `SidebarView.tsx:150`) | (0,1,1) and later in the bundle: replaces the inline-end padding of `.nuiget-main-search-input` / `.nuiget-sidebar-search` (P9.7) |

#### T-c2 rules outside primitives.css whose subject is a primitive class (17)

| file:line | selector | primitive class | kind | declarations | rule introduced by (git log -L) |
|---|---|---|---|---|---|
| main/main.css:115 | `.nuiget-main-search .nuiget-progress` | nuiget-progress | OVERRIDE | `position: absolute; inset-inline: var(--nuiget-inset); bottom: 0` | P9.7 3bfc748 |
| main/main.css:164 | `.nuiget-main-list .nuiget-tablist` | nuiget-tablist | OVERRIDE | `padding-inline-start: calc(var(--nuiget-inset) - var(--nuiget-space-4) - var(--nuiget-space-hairline))` | P9.fix-6 c50d335 |
| main/main.css:168 | `.nuiget-main-list .nuiget-section-toggle` | nuiget-section-toggle | OVERRIDE | `padding-inline-start: var(--nuiget-inset)` | P9.fix-6 c50d335 |
| main/main.css:190 | `.nuiget-installed > .nuiget-toolbar` | nuiget-toolbar | OVERRIDE | `flex: none; padding: var(--nuiget-space-2) var(--nuiget-inset); padding-inline-end: var(--nuiget-space-3)` | P5.4 7f8dfd1 |
| main/main.css:218 | `.nuiget-installed--sections .nuiget-listbox` | nuiget-listbox | OVERRIDE | `flex: none; overflow: visible` | P9.fix-2 1784642 |
| main/main.css:230 | `.nuiget-transitive .nuiget-listbox` | nuiget-listbox | OVERRIDE | `flex: none; overflow: visible` | P5.4 7f8dfd1 |
| main/main.css:264 | `.nuiget-details .nuiget-tabpanel` | nuiget-tabpanel | OVERRIDE | `overflow: auto` | P9.8 b1ebfc7 |
| main/main.css:358 | `.nuiget-details-group .nuiget-section-toggle` | nuiget-section-toggle | OVERRIDE | `text-transform: none` | P9.8 b1ebfc7 |
| main/main.css:702 | `.nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-heading` | nuiget-section-heading | OVERRIDE | `font-size: var(--nuiget-font-size-md); font-weight: normal` | P9.11 0e02690 |
| main/main.css:707 | `.nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-toggle` | nuiget-section-toggle | OVERRIDE | `text-transform: none` | P9.11 0e02690 |
| sidebar/sidebar.css:102 | `.nuiget-sidebar-section > .nuiget-section-header` | nuiget-section-header | OVERRIDE | `border-top: 1px solid var(--nuiget-color-section-header-border); background: var(--nuiget-color-section-header-bg); color: var(--nuiget-color-section-header-fg)` | P9.10 8388bff |
| sidebar/sidebar.css:108 | `.nuiget-sidebar-section > .nuiget-section-header .nuiget-section-toggle` | nuiget-section-toggle | OVERRIDE | `color: inherit` | P9.10 8388bff |
| sidebar/sidebar.css:113 | `.nuiget-sash--horizontal + .nuiget-sidebar-section > .nuiget-section-header` | nuiget-section-header | OVERRIDE | `border-top-color: transparent` | P9.10 8388bff |
| sidebar/sidebar.css:118 | `.nuiget-sidebar-section-content .nuiget-row-option` | nuiget-row-option | OVERRIDE | `padding-inline-start: calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + var(--nuiget-space-2))` | P9.10 8388bff |
| sidebar/sidebar.css:123 | `.nuiget-sidebar-project .nuiget-section-heading` | nuiget-section-heading | OVERRIDE | `font-size: var(--nuiget-font-size-md); font-weight: normal` | P9.10 8388bff |
| sidebar/sidebar.css:128 | `.nuiget-sidebar-project .nuiget-section-toggle` | nuiget-section-toggle | OVERRIDE | `padding-inline-start: calc(var(--nuiget-space-2) + var(--nuiget-tree-indent)); text-transform: none` | P9.10 8388bff |
| sidebar/sidebar.css:133 | `.nuiget-sidebar-project .nuiget-row-option` | nuiget-row-option | OVERRIDE | `padding-inline-start: calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + var(--nuiget-space-2) + var(--nuiget-tree-indent))` | P9.10 8388bff |


## 6. (d) Override chains

**Rule `override` (exact, static).** Within one bundle, declaration D2 in rule R2 (complex selector S2) overrides
declaration D1 in rule R1 (complex selector S1) when all of these hold: (1) R1 and R2 are in **different files**; (2)
both are top-level style rules (no at-rule parent); (3) the subject compound of S1 contains at least one class and
every class of S1's subject compound is also in S2's subject compound; (4) both subject compounds carry the same
pseudo-element (or none); (5) S2 wins: higher specificity, or equal specificity and later in the bundle; (6) D1 and
D2 share a physical longhand after expanding shorthands and logical properties for horizontal LTR
(`padding`→four sides, `padding-inline-start`→`padding-left`, `border`→side × width/style/color,
`border-block-end-color`→`border-bottom-color`, `inset`→four sides, `inline-size`→`width`, `flex`→grow/shrink/basis,
`overflow`→x/y, `font`→style/weight/size/line-height/family, `background`→color/image, `gap`→row/column). One entry
per (D2, S2); `selector` is S2, `property`/`value` are D2's, `line` is D2's line.

**Count: 16** (main.css 9, sidebar.css 7). All 16 override a `primitives.css` declaration. By origin of the
overriding rule (`git log -L`): P5.4 4 (two of them widened by P9.fix-2), P9.8 1, P9.11 3, P9.10 7, P9.fix-6 1.
**12 of 16 were introduced in P9.x or P9.fix.**

#### T-d1 cross-file overrides (baseline rule `override`, 16)

| # | file:line | selector | declaration | overrides | bundle | rule introduced by (git log -L) | declaration line last changed by (blame) |
|---|---|---|---|---|---|---|---|
| 1 | main/main.css:169 | `.nuiget-main-list .nuiget-section-toggle` | `padding-inline-start: var(--nuiget-inset)` | `shared/primitives/primitives.css:474 .nuiget-section-toggle { padding: 0 var(--nuiget-space-2) }` | main | P9.fix-6 c50d335 | P9.fix-6 c50d335 |
| 2 | main/main.css:219 | `.nuiget-installed--sections .nuiget-listbox` | `flex: none` | `shared/primitives/primitives.css:56 .nuiget-listbox { flex: 1 }` | main | P5.4 7f8dfd1 as --all (widened to --sections by P9.fix-2 1784642) | P5.4 7f8dfd1 |
| 3 | main/main.css:220 | `.nuiget-installed--sections .nuiget-listbox` | `overflow: visible` | `shared/primitives/primitives.css:58 .nuiget-listbox { overflow: auto }` | main | P5.4 7f8dfd1 as --all (widened to --sections by P9.fix-2 1784642) | P5.4 7f8dfd1 |
| 4 | main/main.css:231 | `.nuiget-transitive .nuiget-listbox` | `flex: none` | `shared/primitives/primitives.css:56 .nuiget-listbox { flex: 1 }` | main | P5.4 7f8dfd1 | P5.4 7f8dfd1 |
| 5 | main/main.css:232 | `.nuiget-transitive .nuiget-listbox` | `overflow: visible` | `shared/primitives/primitives.css:58 .nuiget-listbox { overflow: auto }` | main | P5.4 7f8dfd1 | P5.4 7f8dfd1 |
| 6 | main/main.css:359 | `.nuiget-details-group .nuiget-section-toggle` | `text-transform: none` | `shared/primitives/primitives.css:480 .nuiget-section-toggle { text-transform: uppercase }` | main | P9.8 b1ebfc7 | P9.8 b1ebfc7 |
| 7 | main/main.css:703 | `.nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-heading` | `font-size: var(--nuiget-font-size-md)` | `shared/primitives/primitives.css:463 .nuiget-section-heading { font-size: var(--nuiget-font-size-sm) }` | main | P9.11 0e02690 | P5.7 f8bfe3f |
| 8 | main/main.css:704 | `.nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-heading` | `font-weight: normal` | `shared/primitives/primitives.css:464 .nuiget-section-heading { font-weight: 600 }` | main | P9.11 0e02690 | P5.7 f8bfe3f |
| 9 | main/main.css:708 | `.nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-toggle` | `text-transform: none` | `shared/primitives/primitives.css:480 .nuiget-section-toggle { text-transform: uppercase }` | main | P9.11 0e02690 | P9.11 0e02690 |
| 10 | sidebar/sidebar.css:109 | `.nuiget-sidebar-section > .nuiget-section-header .nuiget-section-toggle` | `color: inherit` | `shared/primitives/primitives.css:477 .nuiget-section-toggle { color: var(--nuiget-color-fg) }` | sidebar | P9.10 8388bff | P9.10 8388bff |
| 11 | sidebar/sidebar.css:119 | `.nuiget-sidebar-section-content .nuiget-row-option` | `padding-inline-start: calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + var(--nuiget-space-2))` | `shared/primitives/primitives.css:97 .nuiget-row-option { padding: 0 var(--nuiget-space-4) }`<br>`shared/primitives/primitives.css:247 .nuiget-row--comfortable .nuiget-row-option { padding: var(--nuiget-space-5) var(--nuiget-inset) }` | sidebar | P9.10 8388bff | P9.10 8388bff |
| 12 | sidebar/sidebar.css:124 | `.nuiget-sidebar-project .nuiget-section-heading` | `font-size: var(--nuiget-font-size-md)` | `shared/primitives/primitives.css:463 .nuiget-section-heading { font-size: var(--nuiget-font-size-sm) }` | sidebar | P9.10 8388bff | P9.10 8388bff |
| 13 | sidebar/sidebar.css:125 | `.nuiget-sidebar-project .nuiget-section-heading` | `font-weight: normal` | `shared/primitives/primitives.css:464 .nuiget-section-heading { font-weight: 600 }` | sidebar | P9.10 8388bff | P9.10 8388bff |
| 14 | sidebar/sidebar.css:129 | `.nuiget-sidebar-project .nuiget-section-toggle` | `padding-inline-start: calc(var(--nuiget-space-2) + var(--nuiget-tree-indent))` | `shared/primitives/primitives.css:474 .nuiget-section-toggle { padding: 0 var(--nuiget-space-2) }` | sidebar | P9.10 8388bff | P9.10 8388bff |
| 15 | sidebar/sidebar.css:130 | `.nuiget-sidebar-project .nuiget-section-toggle` | `text-transform: none` | `shared/primitives/primitives.css:480 .nuiget-section-toggle { text-transform: uppercase }` | sidebar | P9.10 8388bff | P9.10 8388bff |
| 16 | sidebar/sidebar.css:134 | `.nuiget-sidebar-project .nuiget-row-option` | `padding-inline-start: calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + var(--nuiget-space-2) + var(--nuiget-tree-indent))` | `shared/primitives/primitives.css:97 .nuiget-row-option { padding: 0 var(--nuiget-space-4) }`<br>`shared/primitives/primitives.css:247 .nuiget-row--comfortable .nuiget-row-option { padding: var(--nuiget-space-5) var(--nuiget-inset) }` | sidebar | P9.10 8388bff | P9.10 8388bff |

Same-file chains are left out of the rule: 64 more pairs by the same test inside one file (primitives.css 55, main.css
6, sidebar.css 2, search.css 1). In `primitives.css` they are the primitive's own state and modifier rules (hover,
selected, current, disabled, comfortable, compact). Two of them are redundant and one is a defect (§6.4). Full list:
T-d2 in the appendix.

### 6.1 Cascade on the main Installed screen

Method: a synthetic DOM that mirrors the TSX markup of `MainShell.tsx`, `Tabs.tsx`, `InstalledTab.tsx:213-226`,
`InstalledProjectSection.tsx:95-196`, `SectionHeader.tsx:35-55`, `Listbox.tsx:184-252`, `Row.tsx:110-170`,
`Badge.tsx:17` and `DetailsPane.tsx:164-202` (`css-audit-work/installed-screen.html`), matched with jsdom's
`Element.matches` against every rule of the main bundle in bundle order; `:hover`, `:focus-visible`,
`:focus-within` rules are matched with the state assumed (marked STATE). Every property set by two or more rules on
one element is listed, the winner last. "P9" marks a declaration whose line blame or rule origin is a P9 commit.

| Element | Property | Chain (loser → winner) | P9? |
|---|---|---|---|
| tab (`.nuiget-tab`) | border bottom width/style | `primitives.css:806` `border: 1px solid var(--nuiget-color-contrast-border)` (P9.11 `c946043`) → `:807` `border-block-end: var(--nuiget-space-1) solid transparent` (P5.1) | 806 is P9.11, written above the P5.1 underline |
| tab, selected | border-bottom-color | `:806` (P9.11) → `:807` (P5.1) → `:821` `[aria-selected]` `--nuiget-color-focus` (P5.1) | yes (806) |
| tab | color | `:809` muted → `:816` `:hover` fg → `:822` `[aria-selected]` fg | no |
| tab bar (`.nuiget-tablist`) | padding-inline-start | only `main.css:164` sets it (P9.fix-6 `c50d335`), a calc that subtracts the tab's padding and border to land the label on the inset | yes (P9.fix-6) |
| bulk toolbar | padding-right | `main.css:192` `padding: space-2 inset` (P9.fix-6) → `main.css:194` `padding-inline-end: space-3` (P9.fix-4 `b83316d`), same rule | yes, both |
| toolbar "Uninstall selected" | margin-inline-start | `primitives.css:843` `.nuiget-toolbar-end { margin-inline-start: auto }` (P9.fix-4) | yes |
| toolbar buttons | background, color, cursor | `.nuiget-button` → `--secondary` / `:disabled` → `:hover` variants, all `primitives.css:507-534` (P3.2) | no |
| section toggle (Direct, Transitive, project) | padding-left | `primitives.css:474` `padding: 0 space-2` (P3.2) → `main.css:169` `padding-inline-start: inset` (P9.fix-6) | yes |
| project section toggle (All Projects) | text-transform | `primitives.css:480` uppercase (P3.2) → `main.css:708` none (P9.11 `0e02690`) | yes |
| project heading (All Projects) | font-size, font-weight | `primitives.css:463-464` sm, 600 → `main.css:703-704` md, normal (rule P9.11; lines blamed to P5.7 by copy detection) | yes |
| provisional badge in the project header | (no chain) | `.nuiget-section-actions` (`primitives.css:499-503`) has no inline-end padding and no feature rule adds one (V3, §11) | n/a |
| project section, project content | flex | `main.css:201` `flex: 1` → `main.css:219` `flex: none` (P5.4, widened P9.fix-2) | P9.fix-2 widened |
| list (`.nuiget-listbox`) | flex, overflow | `primitives.css:56,58` `flex: 1; overflow: auto` → `main.css:219-220` `flex: none; overflow: visible` (P5.4 / P9.fix-2); transitive list also → `main.css:231-232` (P5.4), identical values | P9.fix-2 |
| row option (comfortable) | gap | `primitives.css:94` space-3 (P3.2) → `:246` space-5 (P9.2 `83afc1b`) | yes |
| row option (comfortable) | padding | `primitives.css:97` `0 space-4` (P3.2) → `:247` `space-5 inset` (P9.2, value P9.fix-6) | yes |
| row option, bulk-selected and current | background | `:107` `[aria-selected]` active (P3.2) → `:103` STATE hover (P3.2, wins by specificity) → `:118` multiselect selected inactive (P5.4) → `:123` multiselect current active (P3.2) | no |
| same | color | `:98` fg → `:108` active fg → `:119` inherit (P5.4) → `:124` active fg | no |
| same | box-shadow | `:276` `inset 3px 0 0` focus (P9.2) → `:280` none (P9.2) → `:284` `inset 3px 0 0` focus (P9.2) | yes, all three |
| row version, authors on a selected row | color | `:158`/`:225` muted (P3.2) → `:184` inherit (P5.11, selector list grown in P9.2/P9.6) | yes (selector list) |
| row actions | visibility | `:341` hidden → `:347` hover / focus-within visible | no |
| row badge with tone | border-color | `primitives.css:402` `1px solid transparent` (P3.2) → `:417/421/425` tone colour (P5.11) | no |
| details actions grid | (no chain) | `main.css:287-292` grid (P9.fix-5 `aacde06`), `.nuiget-details-label` (`main.css:294-297`); the version select borrows `.nuiget-main-select` from the header (`DetailsPane.tsx:184`) | n/a |
| details Uninstall / Update buttons | background, color | `.nuiget-button` → `--secondary` → `:hover` (P3.2) | no |
| search input | padding-right | `main.css:125` `padding: 0 space-3` (P5.3) → `search.css:12` `padding-inline-end: var(--nuiget-target-min)` (P9.7 `3e6a622`) → `search.css:16` `2 × target-min` when clearable (P9.7 `3bfc748`) | yes, invisible to the class-based rule (subject is `input`) |
| header title | margin-right | `main.css:96` `margin: 0` → `:97` `margin-inline-end: auto` (P9.7), same rule | yes |

Reading of the trace: the P3-P5 primitives set the base; P9.2 rebuilt the comfortable card inside the primitive
(gap, padding, accent); P9.10 and P9.11 restyled `SectionHeader` and the rows from the feature files; the P9.fix
loop then aligned edges by adding inline paddings from outside (`main.css:164,168,194`) and a margin utility
(`primitives.css:842-844`). The common left inset is produced by six independent declarations (header
`main.css:28`, search row `main.css:111`, tab bar `main.css:165`, section toggles `main.css:169`, toolbar
`main.css:192`, rows `primitives.css:247`), held together only by the P9.fix-6 UI test that measures the edges
(`src/test/ui/v2/main-shell.ui.test.ts:64-80`).

### 6.2 Overrides the static rule cannot see

| Override | Why the rule misses it |
|---|---|
| `search.css:11-17` over `main.css:125` and `sidebar.css:34` (inline-end padding of the search input) | subject is the type `input`; the class is on the element only in TSX |
| `main.css:352-356` `.nuiget-details-group h4` over `primitives.css:458-465` `.nuiget-section-heading` | subject is the type `h4` |
| `main.css:55-92` check box rules over the user agent | no project rule underneath |
| eight rules that set a shorthand and then one of its longhands, e.g. `main.css:192,194` (P9.fix-4) | same rule (T-d3) |

### 6.3 Redundant and shadowed declarations

- `main.css:230-233` `.nuiget-transitive .nuiget-listbox { flex: none; overflow: visible }` repeats `main.css:216-221`
  exactly. The transitive sections render only inside `InstalledTab`'s `nuiget-installed nuiget-installed--sections`
  (`InstalledTab.tsx:213,225`; `TransitiveSection` and `AllProjectsTransitiveSection` have no other caller), so the
  rule never changes a value. It predates P9.fix-2, which widened `--all` to `--sections` (`git show 1784642`).
- `primitives.css:387-390` `.nuiget-icon-button:disabled { color: var(--nuiget-color-fg-muted) }` restates the base
  value only to beat `:hover`.
- `primitives.css:332` re-sets `overflow: hidden` on compact authors and description, already set by
  `primitives.css:164,224`.

### 6.4 Two cascade defects found by the trace (measurable, not lint)

1. **Hover beats selection in single-select lists.** `.nuiget-row:hover .nuiget-row-option` is (0,3,0)
   (`primitives.css:102-104`); `.nuiget-row-option[aria-selected="true"]` is (0,2,0) (`primitives.css:106-111`). On
   a selected row under the pointer the hover colour wins. Only the multi-select lists escape it through their (0,4,0)
   rules (`primitives.css:117-126`). Single-select lists: every sidebar list (`ProjectPackages.tsx:88`,
   `ProjectUpdates.tsx:97`, `BrowseResults.tsx:147`, `UpdatesSection.tsx:85,196`), main Browse
   (`BrowseList.tsx:112`) and the transitive lists (`TransitiveSection.tsx:69`, `AllProjectsTransitiveSection.tsx:132`).
   VS Code does the opposite: hover applies only to `:not(.selected):not(.focused)` rows and the selected rule is
   repeated for `:hover` with the comment "overwrite :hover style in this case!" (`microsoft/vscode`
   `src/vs/base/browser/ui/list/listWidget.ts:922-923,963-964,972` at `ee2e492`, 2026-09-25, fetched with `gh api`).
2. **No inactive selection.** VS Code paints `listActiveSelectionBackground` only when the list has focus
   (`.monaco-list:focus .monaco-list-row.selected`, `listWidget.ts:922`) and `listInactiveSelectionBackground`
   otherwise (`listWidget.ts:963`). nUIget paints the active colour on `[aria-selected="true"]` regardless of focus
   (`primitives.css:106-111`), and the current row of a multi-select list likewise (`primitives.css:122-126`);
   `--nuiget-color-list-inactive-bg` is used only for the bulk set (`primitives.css:118`). The current row of
   `main-installed-single.png` is in the active colour while focus is elsewhere (judgement from the PNG).

Also visible in `main-installed-single.png` (judgement) and explained by the CSS: the selection band stops short of
the list's right edge, because the background is on `.nuiget-row-option` (`primitives.css:102-126`) while
`.nuiget-row-actions` is a flex sibling outside it that keeps its width when hidden (`primitives.css:73-80,337-342`;
`Row.tsx:110-170`).

#### T-d3 within-rule shorthand then longhand (informational, 8)

| file | selector | first | then | second line (blame) |
|---|---|---|---|---|
| shared/primitives/primitives.css | `.nuiget-tab` | `806 border: 1px solid var(--nuiget-color-contrast-border)` | `807 border-block-end: var(--nuiget-space-1) solid transparent` | P5.1 d7a79ba |
| main/main.css | `.nuiget-main input[type="checkbox"]:checked::after, .nuiget-dialog input[type="checkbox"]:checked::after` | `77 border: solid var(--nuiget-color-checkbox-fg)` | `78 border-width: 0 2px 2px 0` | P9.11 c946043 |
| main/main.css | `.nuiget-main-title` | `96 margin: 0` | `97 margin-inline-end: auto` | P9.7 3bfc748 |
| main/main.css | `.nuiget-installed > .nuiget-toolbar` | `192 padding: var(--nuiget-space-2) var(--nuiget-inset)` | `194 padding-inline-end: var(--nuiget-space-3)` | P9.fix-4 b83316d |
| main/main.css | `.nuiget-readme hr` | `497 border: 0` | `498 border-top: 2px solid var(--nuiget-color-border)` | P9.8 b61ada2 |
| main/main.css | `.nuiget-readme pre` | `507 padding: var(--nuiget-space-4)` | `508 padding-top: calc(var(--nuiget-target-min) + var(--nuiget-space-2))` | P9.8 b61ada2 |
| main/main.css | `.nuiget-readme-copy` | `529 font: inherit` | `530 font-size: var(--nuiget-font-size-sm)` | P5.4 7f8dfd1 |
| shared/search/search.css | `.nuiget-search-box > input[type="search"]::-webkit-search-cancel-button` | `20 -webkit-appearance: none` | `21 appearance: none` | P9.7 3bfc748 |


## 7. (e) Near-identical blocks between the stylesheets

Method: every rule with 3 or more declarations as a set of `property: value` strings; pairs with 3 or more shared
declarations and Jaccard ≥ 0.6 were listed (`facts.json` → `similar`), then grouped by hand. Declaration-level
frequency is in `facts.json` → `declFreq`.

| # | Cluster | Where | Overlap |
|---|---|---|---|
| E1 | Text input (the VS Code input look) | `main.css:121-131` `.nuiget-main-search-input`, `sidebar.css:30-40` `.nuiget-sidebar-search`, `main.css:662-671` `.nuiget-input` | first two identical (9 of 9); `.nuiget-input` 8 of 9 (no `width: 100%`) |
| E1a | its placeholder | `main.css:133-135`, `main.css:673-675`, `sidebar.css:42-44` | identical |
| E1b | its focus ring | `main.css:137-141` (`:focus`), `main.css:677-680` (`:focus`), `sidebar.css:46-49` (`:focus-visible`) | identical declarations, two different pseudo-classes; both selectors are named verbatim by the focus-ring test (`webview-stylesheets.test.ts:182,184`) |
| E2 | Scrolling list in a dialog | `main.css:593-602` `.nuiget-source-list`, `main.css:713-722` `.nuiget-multi-install` | identical (8 of 8) |
| E3 | Flex column that fills its parent (`display: flex; flex: 1; flex-direction: column; min-height: 0`) | `primitives.css:48,785,825`; `main.css:183,197` (3 selectors), `247,256`; `sidebar.css:52` (2 selectors), `66` | 9 blocks, 13 selectors, identical |
| E4 | Surface root | `main.css:12-20` `.nuiget-main`, `sidebar.css:12-20` `.nuiget-sidebar`; `body` reset `main.css:7-10`, `sidebar.css:7-10` | 6 of 7 (background differs); body identical |
| E5 | Visually hidden | `primitives.css:8-18` `.nuiget-visually-hidden`, `primitives.css:325-334` compact row's hidden text | 5 shared declarations (position, 1px box, overflow, clip-path) |
| E6 | Uppercase muted caption | `main.css:690-696` `.nuiget-installed-folder-title`, `sidebar.css:79-85` `.nuiget-sidebar-folder-caption`, `search.css:62-68` `.nuiget-search-group-header` | 4 shared (muted, sm, 600, uppercase); three different spacings: `margin: space-4 space-4 space-1 inset`, `margin: space-3 space-4 space-1`, `padding: space-2 space-3 space-1` |
| E7 | Section header as a tree level (normal case, body size) | `main.css:702-709` (P9.11), `sidebar.css:123-131` (P9.10), `main.css:352-360` (P5.7 + P9.8) | 3 copies of the same variant of `SectionHeader` |
| E8 | Bulk dialog lead and list | `main.css:236-243` `.nuiget-bulk-lead/-list`, `sidebar.css:92-99` `.nuiget-sidebar-bulk-lead/-list` | identical declarations under two names |
| E9 | Focus ring | `outline: 1px solid var(--nuiget-color-focus)` in 6 rules (`primitives.css:361`, `main.css:90,139,535,678`, `sidebar.css:47`) | three different offsets: `-1px` ×4 (`primitives.css:362`, `main.css:140,679`, `sidebar.css:48`), `+1px` (`main.css:91`), none (`main.css:534-536`) |
| E10 | Ellipsis triple (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) | `primitives.css:149,163(+155),222,310,484` | idiom, 5 places |

Most repeated declarations across the four linted files: `display: flex` 51, `align-items: center` 29,
`flex-direction: column` 25, `color: var(--nuiget-color-fg-muted)` 24, `flex: 1` 19, `flex: none` 19, `margin: 0` 18,
`min-height: var(--nuiget-target-min)` 15, `font-weight: 600` 11, `border: 1px solid var(--nuiget-color-border)` 7.

E1, E2 and E8 are controls and dialog parts that have no primitive. Related TSX facts: `.nuiget-button` is a class,
not a component; 24 raw `<button className="nuiget-button…">` elements carry it, 20 of them in seven feature files
(`grep -rnoE 'className="nuiget-button[^"]*"' src/webview --include='*.tsx'`, tests excluded).
`.nuiget-main-select`, named for the header's project selector, is used by four selects
(`MainShell.tsx:244`, `DetailsPane.tsx:184`, `SourceSettingsDialog.tsx:130`, `SourcesControl.tsx:38`). The check box
look exists only in `main.css:54-92`.

## 8. (f) Dead and unreachable rules

**Rule `deadRule` (exact).** A complex selector in a linted stylesheet that contains a class that no non-test source
renders. "Renders" = the class name occurs as a whole word (not preceded or followed by `[\w-]`) in a `.ts`/`.tsx` file
under `src/webview`, excluding `*.test.ts(x)`, `testSupport.ts` and `*.d.ts`, after removing comments; a class that
starts with a template prefix found in those files (`nuiget-x--${…}`: `nuiget-readme-copy-icon--`, `nuiget-badge--`,
`nuiget-banner--`, `nuiget-row--`, `nuiget-sash--`, `nuiget-skeleton-row--`) or with a quoted prefix string
(`'nuiget-hljs-'`, the highlight.js `classPrefix` at `markdown.ts:51`) counts as rendered. One entry per complex
selector; `value` = the dead class names.

**Count: 0.** All 175 styled classes are rendered: 139 literally, 13 through a template prefix, 21 through the
`nuiget-hljs-` prefix (`facts.json` → `classStatus`); the two `vscode-high-contrast*` classes of `tokens.css` are set
by VS Code and `tokens.css` is outside the scan. The variant values exist in the TSX unions: `BadgeTone`
(`Badge.tsx:4`), `BannerSeverity` (`Banner.tsx:5`), densities (`Listbox.tsx:17`, `Row.tsx:62`), orientations
(`Sash.tsx:14`).

What the grep rule cannot see (informational; candidate stronger rules for the plan):

| Finding | Evidence |
|---|---|
| **Popover is never rendered.** No product module renders `<Popover`; it is exported from `primitives/index.ts:17` and used by tests and `testSupport.ts:82`. esbuild drops its JS from both bundles (`grep -c nuiget-popover` → 0 in the built `webview.js` and `sidebar.js`), yet its 4 selectors ship in both CSS bundles (6 occurrences each). ADR-008 names `Popover` as a primitive (`008-webview-architecture.md:29-30`), so removing it is an ADR matter, not a lint fix. | `primitives.css:360,758,774,779`; build in `css-audit-work/build/` |
| `.nuiget-icon-button[aria-pressed="true"]` never matches: no caller passes `pressed` to `IconButton` (the only `aria-pressed` in features is on raw "Select all" buttons). | `primitives.css:383`; `IconButton.tsx:13,29`; `grep -rn pressed src/webview --include='*.tsx'` |
| Compact hidden text for authors, meta and description never matches: no compact (`density="compact"`, sidebar only) caller passes `authors`, `meta` or `description`; only `status` reaches it. | `primitives.css:325-327`; callers `BrowseList.tsx:134-137` (comfortable), sidebar `ProjectPackages.tsx:108-111`, `ProjectUpdates.tsx:114-117`, `BrowseResults.tsx:178-180` |
| `.nuiget-transitive .nuiget-listbox` is fully shadowed (§6.3). | `main.css:230-233` |
| Density is a surface, not a choice: `compact` is passed only by sidebar modules and `comfortable` only by main modules, so every `--compact`/`--comfortable` rule in the primitive is per-surface styling. | `grep -rn 'density="' src/webview --include='*.tsx'`, tests excluded: 13 `compact` in 5 sidebar files, 22 `comfortable` in 9 main files, Skeleton included |
| Three tokens are referenced nowhere (CSS 0, TS 0) but are REQUIRED by the token test: `--nuiget-icon-size-lg`, `--nuiget-z-sticky`, `--nuiget-z-toast`. | `tokens.css:38,49,52`; `webview-tokens.test.ts:30-31` |
| Classes rendered but never styled (hooks): `nuiget-main-refresh`, `nuiget-tab-label`, `nuiget-transitive-content`, `nuiget-transitive-framework`, `nuiget-updates`, `nuiget-bulk-project`, `nuiget-installed-folder`, `nuiget-sidebar-folder`, `nuiget-search-options`, `nuiget-source-name`. `nuiget-tab-label` is read by the P9.fix-6 UI test. | `facts.json` → `renderedNotStyled`; `main-shell.ui.test.ts:75` |
| A foreign class in TSX: `codicon-loading` (`icons.tsx:124`); the class-prefix lint reads only CSS. No rule styles it. | `icons.tsx:124`; `webview-stylesheets.test.ts:49-53` |

## 9. (g) Where spacing, size and colour come from

Per declaration, after removing `var(…)` arguments: **token** = uses a `--nuiget-*` token and no literal number;
**literal** = a non-zero number with or without unit and no token (unitless integers inside `calc()` are arithmetic
and not counted; `flex`, `flex-grow`, `flex-shrink`, `order` are layout factors and counted as keyword);
**mixed** = both; **keyword** = neither (`0`, `auto`, `none`, `inherit`, `transparent`, `flex`, …). Script
`css-audit-work/counts.mjs`; every non-token line is listed by `LIST=1 node counts.mjs`.

| File (declarations) | Spacing | Size, position | Line, radius, shadow | Type | Colour | Motion | Layout / other |
|---|---|---|---|---|---|---|---|
| primitives.css (368; 5 in keyframes) | token 29, keyword 7, literal 0 | token 31, literal 14, mixed 2, keyword 19 | token 12, mixed 11, literal 3, keyword 6 | token 7, `font-weight` 600 ×4, keyword 4 | token 54, keyword 5, literal 0 | token 7 | keyword 146, literal 2 (`clip-path: inset(50%)`) |
| main.css (325) | token 52, keyword 22, literal 0 | token 15, literal 11, keyword 10 | mixed 19, token 9, literal 4, keyword 3 | token 14, literal 6 (5 em font sizes, `line-height: 1.25`), `font-weight` 600 ×4, keyword 10 | token 43, keyword 1, literal 0 | — | keyword 101, literal 1 (`grid-column: 1`, a line index) |
| sidebar.css (57) | token 10, keyword 3, literal 0 | token 1, literal 2 (`100vh`, `100%`), keyword 2 | mixed 3, token 1, literal 1 | token 4, `font-weight` 600 ×1, keyword 4 | token 8, keyword 2, literal 0 | — | keyword 15 |
| search.css (53) | token 9, literal 0 | token 4, literal 2 (`top: 100%`, `16em`), keyword 4 | mixed 2, token 1 | token 1, `font-weight` 600 ×2, keyword 1 | token 9, keyword 2, literal 0 | — | keyword 16 |
| tokens.css (153) | the scale itself: 31 literal values, 1 token-of-token (`--nuiget-inset: var(--nuiget-space-6)`), 121 `--vscode-*` aliases or system colours | | | | | | |

Reading: spacing and colour are fully tokenised (consistent with the green `pxSpacing` and colour lints). Sizes are
62 % token (51 of 82 non-keyword size declarations across the four files: token 51, literal 29, mixed 2). Lines are
mostly "mixed": a literal `1px` width with a token colour (35 of the 66 line declarations that carry a number or a token; token 23, literal 8).
Type has no weight token and README headings carry their own scale.

## 10. (h) Disable comments

`grep -rnE "stylelint-disable|eslint-disable|@ts-ignore|@ts-expect-error|prettier-ignore" src/webview`:

- In stylesheets: **0** (`stylelint-disable` 0). No stylelint is installed (`ls node_modules/.bin | grep -c stylelint`
  → 0; no `stylelint` in `package.json`), so a CSS gate is a Vitest lint like the existing ones.
- In TSX/TS: 9 × `// eslint-disable-next-line react-hooks/exhaustive-deps` (`BrowseResults.tsx:56`,
  `SidebarView.tsx:116`, `Listbox.tsx:119`, `Popover.tsx:117`, `Toolbar.tsx:60`, `Dialog.tsx:68`,
  `store/details.tsx:122`, `MainShell.tsx:146`, `BrowseList.tsx:86`). Outside this dimension; listed for completeness.
- `disableComment` baseline: **0** entries. Rule (exact): a comment in a linted stylesheet whose text matches
  `/\b(?:stylelint|eslint)-disable\b/`. One entry per comment; `selector` null, `property` null, `value` the comment
  text, `line` the comment's first line.


## 11. The owner's V1-V5 against the stylesheets: what a lexical gate can and cannot see

Each owner finding traced to the rules that produce it (captures `main-installed-single.png`, `main-installed-all.png`,
`main-updates.png` of run 39025149785 viewed; the pixel reading is judgement, the rules are code).

| Owner finding | Rules that produce it | Baseline hits on those rules | Visible to a lexical CSS gate? |
|---|---|---|---|
| V1 tab bar and bulk toolbar squeezed | `.nuiget-tablist` gap `space-1`, no block padding (`primitives.css:792-797`); `.nuiget-tab` `min-height: target-min` (24 px), `padding: 0 space-4`, 1 px box + 2 px underline (`primitives.css:799-813`); tab bar inset calc (`main.css:164-166`, P9.fix-6); toolbar `padding: space-2 inset` (`main.css:192`), `gap: space-2` (`primitives.css:838`); buttons `min-height: target-min` (`primitives.css:508`) | `pxLength` `primitives.css:796,806,510` (the 1 px lines only) | No: every size is a token |
| V2 "Select all" and "Uninstall selected" misaligned | `padding-inline-end: space-3` after `padding: … inset` in the same rule (`main.css:192,194`, P9.fix-4) so the start edge is 16 px and the end edge 6 px; `.nuiget-toolbar-end { margin-inline-start: auto }` (`primitives.css:842-844`, P9.fix-4); the UI test accepts 8 px (`main-installed.ui.test.ts:92-102`) | none (within-rule override, not cross-file) | No |
| V3 "provisional" badge overlaps the list's right border | `.nuiget-section-actions` has no inline-end padding (`primitives.css:499-503`) and the grouped header puts the badges there (`InstalledProjectSection.tsx:160-165,180`); the sidebar solved the same badge with a wrapper `.nuiget-sidebar-fidelity { padding-inline-end: space-4 }` since P3.4 (`sidebar.css:60-63`, `InstalledSection.tsx:136`) | none (a missing declaration) | No |
| V4 section headers: small top margin, large bottom margin | header has `min-height: row-height-compact` and no padding (`primitives.css:451-455`); above it the toolbar's `padding-block-end: space-2` (4 px, `main.css:192`); below it the card's `padding-block-start: space-5` (12 px, `primitives.css:247`) | none | No |
| V5 no single spacing scale between header, toolbar, section headers and rows | vertical steps in order: header `space-4`/`space-2` (`main.css:28`), search `space-2` (`main.css:111`), tab 24 px minimum, toolbar `space-2` (`main.css:192`), section header 0, card `space-5` (`primitives.css:247`), card gap `space-5` (`primitives.css:246`) against compact gap `space-3` (`primitives.css:94`) | none | No: all values are tokens; the defect is which step goes where |

Consequence for the measurement harness: a lexical lint over the stylesheets reports none of V1-V5 beyond three
`1px` lines. The negative control has to be geometric: bounding boxes in the rendered webview, as five UI tests already
do (`main-shell.ui.test.ts:64-80` six left edges ±1 px; `main-installed.ui.test.ts:78-89` check box centre ±2 px,
`:92-102` right edge ±8 px, `:128-136` transitive gap; `main-details.ui.test.ts:35-45` buttons' left edge and height).


## 12. Candidate baseline for the planned lint gate

Rule definitions are the bold paragraphs of §3 (`pxLength`), §4 (`duplicateSelector`), §5 (`specificity`), §6
(`override`), §8 (`deadRule`) and §10 (`disableComment`). Scope of every rule: the four linted stylesheets
`src/webview/shared/primitives/primitives.css`, `src/webview/main/main.css`, `src/webview/sidebar/sidebar.css`,
`src/webview/shared/search/search.css` (the existing `stylesheets()` set of `webview-stylesheets.test.ts:71-76`);
No entry is ever reported in `tokens.css`; it is read only as a possible earlier rule for `duplicateSelector` and
`override`, and contributes no hit to either.
Paths are repository-relative with `/`. `line` is 1-based. Bundles and their order are those measured in §1 method.

Counts per rule and file:

| rule | primitives.css | main.css | sidebar.css | search.css | total |
|---|---|---|---|---|---|
| pxLength | 19 | 32 | 4 | 3 | 58 |
| duplicateSelector | 1 | 0 | 0 | 0 | 1 |
| specificity | 23 | 15 | 2 | 1 | 41 |
| override | 0 | 9 | 7 | 0 | 16 |
| deadRule | 0 | 0 | 0 | 0 | 0 |
| disableComment | 0 | 0 | 0 | 0 | 0 |
| **total** | **43** | **56** | **13** | **4** | **116** |

Notes for the negative control:

- The JSON is a pure function of the five stylesheets (and, for `deadRule`, of the non-test `.ts/.tsx` under
  `src/webview`). No git data, no judgement.
- Two rules have zero hits; their test needs planted samples, as the existing lints do
  (`webview-stylesheets.test.ts:199-232`): for example `.nuiget-not-rendered { color: inherit; }` (deadRule) and
  `/* stylelint-disable-next-line */` (disableComment).
- `parseRules` (`src/test/lint/cssRules.ts:13-46`) drops line numbers and comments, so it cannot produce `line` or
  `disableComment`. Parsers present today: `css-tree` 3.2.1 and `@bramus/specificity` 2.4.3 come with `jsdom` (a direct
  devDependency, `package.json:336`); `postcss` 8.5.29 only through `vite`. A gate that imports a transitive package
  breaks when that package moves; adding a direct devDependency or extending `cssRules.ts` is a plan decision.
- Interactions with existing tests: a `pxLength` gate without a hairline exemption collides with
  `webview-stylesheets.test.ts:161-163,166,178,189,238` (§2).
- Sorting: rule order as in the table, then file order as in the table, then `line`, then `selector`.

```json
[
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-visually-hidden","property":"width","value":"1px","line":10},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-visually-hidden","property":"height","value":"1px","line":11},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-row-check","property":"border","value":"1px solid var(--nuiget-color-border)","line":135},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-row--comfortable","property":"border-bottom","value":"1px solid var(--nuiget-color-border)","line":240},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-row-icon img, .nuiget-row-icon svg","property":"outline","value":"1px solid var(--nuiget-color-contrast-border)","line":263},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-row-icon img, .nuiget-row-icon svg","property":"outline-offset","value":"-1px","line":264},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-row--comfortable .nuiget-row-option[aria-selected=\"true\"]","property":"box-shadow","value":"inset 3px 0 0 var(--nuiget-color-focus)","line":276},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-listbox[aria-multiselectable=\"true\"] .nuiget-row--comfortable .nuiget-row-option[aria-current=\"true\"]","property":"box-shadow","value":"inset 3px 0 0 var(--nuiget-color-focus)","line":284},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-row--compact .nuiget-row-authors, .nuiget-row--compact .nuiget-row-meta, .nuiget-row--compact .nuiget-row-description, .nuiget-row--compact .nuiget-row-status","property":"width","value":"1px","line":330},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-row--compact .nuiget-row-authors, .nuiget-row--compact .nuiget-row-meta, .nuiget-row--compact .nuiget-row-description, .nuiget-row--compact .nuiget-row-status","property":"height","value":"1px","line":331},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-row-option:focus-visible, .nuiget-icon-button:focus-visible, .nuiget-sash:focus-visible, .nuiget-section-toggle:focus-visible, .nuiget-button:focus-visible, .nuiget-tab:focus-visible, .nuiget-dialog:focus-visible, .nuiget-popover:focus-visible","property":"outline","value":"1px solid var(--nuiget-color-focus)","line":361},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-row-option:focus-visible, .nuiget-icon-button:focus-visible, .nuiget-sash:focus-visible, .nuiget-section-toggle:focus-visible, .nuiget-button:focus-visible, .nuiget-tab:focus-visible, .nuiget-dialog:focus-visible, .nuiget-popover:focus-visible","property":"outline-offset","value":"-1px","line":362},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-badge","property":"border","value":"1px solid transparent","line":402},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-button","property":"border","value":"1px solid var(--nuiget-color-button-border)","line":510},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-dialog","property":"width","value":"min(32em, 100%)","line":714},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-dialog","property":"border","value":"1px solid var(--nuiget-color-border)","line":718},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-popover","property":"border","value":"1px solid var(--nuiget-color-border)","line":767},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-tablist","property":"border-block-end","value":"1px solid var(--nuiget-color-border)","line":796},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"pxLength","selector":".nuiget-tab","property":"border","value":"1px solid var(--nuiget-color-contrast-border)","line":806},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-main-select","property":"max-width","value":"20em","line":33},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-main-select","property":"border","value":"1px solid var(--nuiget-color-dropdown-border)","line":36},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-main input[type=\"checkbox\"], .nuiget-dialog input[type=\"checkbox\"]","property":"border","value":"1px solid var(--nuiget-color-checkbox-border)","line":64},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-main input[type=\"checkbox\"]:checked::after, .nuiget-dialog input[type=\"checkbox\"]:checked::after","property":"border-width","value":"0 2px 2px 0","line":78},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-main input[type=\"checkbox\"]:focus-visible, .nuiget-dialog input[type=\"checkbox\"]:focus-visible","property":"outline","value":"1px solid var(--nuiget-color-focus)","line":90},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-main input[type=\"checkbox\"]:focus-visible, .nuiget-dialog input[type=\"checkbox\"]:focus-visible","property":"outline-offset","value":"1px","line":91},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-main-search","property":"border-block-end","value":"1px solid var(--nuiget-color-border)","line":112},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-main-search-input","property":"border","value":"1px solid var(--nuiget-color-input-border)","line":126},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-main-select:focus-visible, .nuiget-main-search-input:focus","property":"outline","value":"1px solid var(--nuiget-color-focus)","line":139},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-main-select:focus-visible, .nuiget-main-search-input:focus","property":"outline-offset","value":"-1px","line":140},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-details-row > .nuiget-details-label","property":"min-width","value":"5em","line":308},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-details-fact dt","property":"min-width","value":"7em","line":338},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme h1","property":"border-left","value":"4px solid var(--nuiget-color-link)","line":400},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme h1","property":"font-size","value":"1.6em","line":401},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme h2","property":"border-left","value":"3px solid var(--nuiget-color-link)","line":410},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme h2","property":"font-size","value":"1.4em","line":411},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme h3","property":"border-left","value":"3px solid var(--nuiget-color-border)","line":416},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme h3","property":"font-size","value":"1.2em","line":417},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme h4","property":"font-size","value":"1.05em","line":421},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme h5, .nuiget-readme h6","property":"font-size","value":"1em","line":427},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme code","property":"border","value":"1px solid var(--nuiget-color-border)","line":447},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme table","property":"border","value":"1px solid var(--nuiget-color-border)","line":463},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme th, .nuiget-readme td","property":"border-bottom","value":"1px solid var(--nuiget-color-border)","line":470},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme blockquote","property":"border-left","value":"4px solid var(--nuiget-color-blockquote-border)","line":486},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme hr","property":"border-top","value":"2px solid var(--nuiget-color-border)","line":498},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme-copy","property":"border","value":"1px solid var(--nuiget-color-border)","line":525},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-readme-copy:focus-visible","property":"outline","value":"1px solid var(--nuiget-color-focus)","line":535},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-source-row","property":"border-bottom","value":"1px solid var(--nuiget-color-border)","line":610},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-add-source","property":"min-width","value":"min(28em, 80vw)","line":641},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-input","property":"border","value":"1px solid var(--nuiget-color-input-border)","line":666},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-input:focus","property":"outline","value":"1px solid var(--nuiget-color-focus)","line":678},
  {"file":"src/webview/main/main.css","rule":"pxLength","selector":".nuiget-input:focus","property":"outline-offset","value":"-1px","line":679},
  {"file":"src/webview/sidebar/sidebar.css","rule":"pxLength","selector":".nuiget-sidebar-search","property":"border","value":"1px solid var(--nuiget-color-input-border)","line":35},
  {"file":"src/webview/sidebar/sidebar.css","rule":"pxLength","selector":".nuiget-sidebar-search:focus-visible","property":"outline","value":"1px solid var(--nuiget-color-focus)","line":47},
  {"file":"src/webview/sidebar/sidebar.css","rule":"pxLength","selector":".nuiget-sidebar-search:focus-visible","property":"outline-offset","value":"-1px","line":48},
  {"file":"src/webview/sidebar/sidebar.css","rule":"pxLength","selector":".nuiget-sidebar-section > .nuiget-section-header","property":"border-top","value":"1px solid var(--nuiget-color-section-header-border)","line":103},
  {"file":"src/webview/shared/search/search.css","rule":"pxLength","selector":".nuiget-search-popup","property":"max-height","value":"16em","line":39},
  {"file":"src/webview/shared/search/search.css","rule":"pxLength","selector":".nuiget-search-popup","property":"border","value":"1px solid var(--nuiget-color-border)","line":43},
  {"file":"src/webview/shared/search/search.css","rule":"pxLength","selector":".nuiget-search-popup","property":"box-shadow","value":"0 2px 8px var(--nuiget-color-shadow)","line":46},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"duplicateSelector","selector":".nuiget-row--comfortable","property":null,"value":"src/webview/shared/primitives/primitives.css:86","line":238},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row:hover .nuiget-row-option","property":null,"value":"(0,3,0)","line":102},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-listbox[aria-multiselectable=\"true\"] .nuiget-row-option[aria-selected=\"true\"]","property":null,"value":"(0,4,0)","line":117},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-listbox[aria-multiselectable=\"true\"] .nuiget-row-option[aria-current=\"true\"]","property":null,"value":"(0,4,0)","line":122},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-disabled=\"true\"] .nuiget-row-name","property":null,"value":"(0,3,0)","line":145},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-selected=\"true\"] .nuiget-row-version","property":null,"value":"(0,3,0)","line":172},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-selected=\"true\"] .nuiget-row-description","property":null,"value":"(0,3,0)","line":173},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-selected=\"true\"] .nuiget-row-status","property":null,"value":"(0,3,0)","line":174},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-current=\"true\"] .nuiget-row-version","property":null,"value":"(0,3,0)","line":175},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-current=\"true\"] .nuiget-row-description","property":null,"value":"(0,3,0)","line":176},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-current=\"true\"] .nuiget-row-status","property":null,"value":"(0,3,0)","line":177},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-selected=\"true\"] .nuiget-row-version-new","property":null,"value":"(0,3,0)","line":178},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-selected=\"true\"] .nuiget-row-authors","property":null,"value":"(0,3,0)","line":179},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-selected=\"true\"] .nuiget-row-meta","property":null,"value":"(0,3,0)","line":180},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-current=\"true\"] .nuiget-row-version-new","property":null,"value":"(0,3,0)","line":181},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-current=\"true\"] .nuiget-row-authors","property":null,"value":"(0,3,0)","line":182},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row-option[aria-current=\"true\"] .nuiget-row-meta","property":null,"value":"(0,3,0)","line":183},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row--comfortable .nuiget-row-option[aria-selected=\"true\"]","property":null,"value":"(0,3,0)","line":275},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-listbox[aria-multiselectable=\"true\"] .nuiget-row--comfortable .nuiget-row-option[aria-selected=\"true\"]","property":null,"value":"(0,5,0)","line":279},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-listbox[aria-multiselectable=\"true\"] .nuiget-row--comfortable .nuiget-row-option[aria-current=\"true\"]","property":null,"value":"(0,5,0)","line":283},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row:hover .nuiget-row-actions","property":null,"value":"(0,3,0)","line":344},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-row:focus-within .nuiget-row-actions","property":null,"value":"(0,3,0)","line":345},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-section-toggle[aria-expanded=\"true\"] .nuiget-section-chevron","property":null,"value":"(0,3,0)","line":495},
  {"file":"src/webview/shared/primitives/primitives.css","rule":"specificity","selector":".nuiget-button:disabled:hover","property":null,"value":"(0,3,0)","line":530},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-main input[type=\"checkbox\"]","property":null,"value":"(0,2,1)","line":55},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-dialog input[type=\"checkbox\"]","property":null,"value":"(0,2,1)","line":56},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-main input[type=\"checkbox\"]:checked::after","property":null,"value":"(0,3,2)","line":71},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-dialog input[type=\"checkbox\"]:checked::after","property":null,"value":"(0,3,2)","line":72},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-main input[type=\"checkbox\"]:disabled","property":null,"value":"(0,3,1)","line":82},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-dialog input[type=\"checkbox\"]:disabled","property":null,"value":"(0,3,1)","line":83},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-main input[type=\"checkbox\"]:focus-visible","property":null,"value":"(0,3,1)","line":88},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-dialog input[type=\"checkbox\"]:focus-visible","property":null,"value":"(0,3,1)","line":89},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-readme h1:first-child","property":null,"value":"(0,2,1)","line":404},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-readme tbody tr:nth-child(even)","property":null,"value":"(0,2,2)","line":479},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-readme blockquote p:last-child","property":null,"value":"(0,2,2)","line":491},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-readme-copy[data-copied] .nuiget-readme-copy-icon--copy","property":null,"value":"(0,3,0)","line":543},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-readme-copy:not([data-copied]) .nuiget-readme-copy-icon--check","property":null,"value":"(0,3,0)","line":544},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-heading","property":null,"value":"(0,3,0)","line":702},
  {"file":"src/webview/main/main.css","rule":"specificity","selector":".nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-toggle","property":null,"value":"(0,3,0)","line":707},
  {"file":"src/webview/sidebar/sidebar.css","rule":"specificity","selector":".nuiget-sidebar-section > .nuiget-section-header .nuiget-section-toggle","property":null,"value":"(0,3,0)","line":108},
  {"file":"src/webview/sidebar/sidebar.css","rule":"specificity","selector":".nuiget-sash--horizontal + .nuiget-sidebar-section > .nuiget-section-header","property":null,"value":"(0,3,0)","line":113},
  {"file":"src/webview/shared/search/search.css","rule":"specificity","selector":".nuiget-search-box > input[type=\"search\"]::-webkit-search-cancel-button","property":null,"value":"(0,2,2)","line":19},
  {"file":"src/webview/main/main.css","rule":"override","selector":".nuiget-main-list .nuiget-section-toggle","property":"padding-inline-start","value":"var(--nuiget-inset)","line":169},
  {"file":"src/webview/main/main.css","rule":"override","selector":".nuiget-installed--sections .nuiget-listbox","property":"flex","value":"none","line":219},
  {"file":"src/webview/main/main.css","rule":"override","selector":".nuiget-installed--sections .nuiget-listbox","property":"overflow","value":"visible","line":220},
  {"file":"src/webview/main/main.css","rule":"override","selector":".nuiget-transitive .nuiget-listbox","property":"flex","value":"none","line":231},
  {"file":"src/webview/main/main.css","rule":"override","selector":".nuiget-transitive .nuiget-listbox","property":"overflow","value":"visible","line":232},
  {"file":"src/webview/main/main.css","rule":"override","selector":".nuiget-details-group .nuiget-section-toggle","property":"text-transform","value":"none","line":359},
  {"file":"src/webview/main/main.css","rule":"override","selector":".nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-heading","property":"font-size","value":"var(--nuiget-font-size-md)","line":703},
  {"file":"src/webview/main/main.css","rule":"override","selector":".nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-heading","property":"font-weight","value":"normal","line":704},
  {"file":"src/webview/main/main.css","rule":"override","selector":".nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-toggle","property":"text-transform","value":"none","line":708},
  {"file":"src/webview/sidebar/sidebar.css","rule":"override","selector":".nuiget-sidebar-section > .nuiget-section-header .nuiget-section-toggle","property":"color","value":"inherit","line":109},
  {"file":"src/webview/sidebar/sidebar.css","rule":"override","selector":".nuiget-sidebar-section-content .nuiget-row-option","property":"padding-inline-start","value":"calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + var(--nuiget-space-2))","line":119},
  {"file":"src/webview/sidebar/sidebar.css","rule":"override","selector":".nuiget-sidebar-project .nuiget-section-heading","property":"font-size","value":"var(--nuiget-font-size-md)","line":124},
  {"file":"src/webview/sidebar/sidebar.css","rule":"override","selector":".nuiget-sidebar-project .nuiget-section-heading","property":"font-weight","value":"normal","line":125},
  {"file":"src/webview/sidebar/sidebar.css","rule":"override","selector":".nuiget-sidebar-project .nuiget-section-toggle","property":"padding-inline-start","value":"calc(var(--nuiget-space-2) + var(--nuiget-tree-indent))","line":129},
  {"file":"src/webview/sidebar/sidebar.css","rule":"override","selector":".nuiget-sidebar-project .nuiget-section-toggle","property":"text-transform","value":"none","line":130},
  {"file":"src/webview/sidebar/sidebar.css","rule":"override","selector":".nuiget-sidebar-project .nuiget-row-option","property":"padding-inline-start","value":"calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + var(--nuiget-space-2) + var(--nuiget-tree-indent))","line":134}
]
```

## 13. What the counts mean for rebuild versus refactor (assessment)

Labelled as assessment: it interprets the measured facts above.

| Layer | State (measured) | Cost driver for the overhaul |
|---|---|---|
| `tokens.css` | 153 declarations, every colour an alias, lint-pinned shape; spacing and colour fully used through tokens | keep; add what is missing (a line-width policy, font weights, the README type steps), delete or use the 3 unreferenced tokens (the token test must change with them) |
| Primitive CSS (`primitives.css`) | 368 declarations; 23 of 41 high-specificity selectors; two selection models in one rule set; one look per primitive; Popover CSS shipped but unrendered | refactor: variants the surfaces now patch (SectionHeader pane/group/tree-level, Listbox inline mode, Toolbar spacing, Row indent), focus-scoped selection with hover below selection (§6.4) |
| Per-surface patches (`main.css`, `sidebar.css`) | 17 rules reach into 9 primitive classes, all overrides; 16 cross-file overrides, 12 of them from P9; the common inset made of six independent declarations | delete after the variants exist; most were added on 2026-10-16/17 (P9.x, P9.fix) |
| Controls that are not primitives | text input ×3 (+3 placeholder, +3 focus), check box only in `main.css`, `.nuiget-main-select` borrowed by 4 selects, `.nuiget-button` as a bare class on 24 buttons | new primitives (Button, TextField, Select, Checkbox) and their tests |
| README typography (`main.css:379-589`) | 15 of the 32 `pxLength` hits in `main.css` fall in this range (13 typography, 2 copy button), own em type scale and line widths | a separate concern (Markdown preview parity); can be ported as a block |

The physical/logical mix is uneven (physical directional properties: primitives 3, main 19, sidebar 2, search 5; logical:
12, 15, 5, 4, by `grep` of `padding|margin|border-(left|right|top|bottom)`, `left|right|top|bottom:`, `text-align`
versus `*-inline-*`, `*-block-*`, `inline-size`, `block-size`). Not a defect in an LTR-only workbench; a consistency
point for the rewrite.


## 14. Sources not reached and gaps

Not reached: none of the listed sources failed to open. Read for this dimension: ADR-006 and ADR-008 in full; the
plan, the findings ledger, the parity audit and the interaction model were not needed for a code audit and were not
read. The browser pane was not used (reserved), so nothing was
rendered in Chromium 114 or in VS Code; jsdom matched selectors but computes no layout.

Gaps (known, not covered):

- No rendered geometry. Pixel values in §11 come from the token values and the PNGs, not from a measurement.
- The `override` rule is static: it ignores selector context (ancestors) and cannot see type-subject overrides (§6.2).
  Its hits are "can override", confirmed for the Installed screen by the jsdom trace (§6.1) only.
- VS Code's own stylesheets were compared only for the list widget (`listWidget.ts`); pane headers, tabs, buttons,
  inputs and the Markdown preview were not fetched.
- TSX `style` props were not audited beyond noting that `cssVars` sets custom properties (`Row.tsx:117`); inline-style
  policy is ADR-006 and has its own tests.
- `icons.tsx` and the highlight.js theme mapping were not audited beyond the class prefix and the literal sizes.
- Blame attribution is line-level; rule origins were checked with `git log -L` only for the 17 reach rules, the 16
  overrides and the blocks named in §5.
- An empty scratch file `css-audit-work/count.test.ts` was left in the scratchpad (its deletion is refused by the
  repository's guard hook for `*.test.ts`); it is outside the repository.

## Appendix A. All same-file override pairs (informational)

#### T-d2 same-file overrides (informational, 64)

| file:line | selector | declaration | overrides | declaration line (blame) |
|---|---|---|---|---|
| shared/primitives/primitives.css:103 | `.nuiget-row:hover .nuiget-row-option` | `background: var(--nuiget-color-list-hover-bg)` | `shared/primitives/primitives.css:107 .nuiget-row-option[aria-selected="true"] { background: var(--nuiget-color-list-active-bg) }` | P3.2 81ec41d |
| shared/primitives/primitives.css:108 | `.nuiget-row-option[aria-selected="true"]` | `color: var(--nuiget-color-list-active-fg)` | `shared/primitives/primitives.css:98 .nuiget-row-option { color: var(--nuiget-color-fg) }` | P3.2 81ec41d |
| shared/primitives/primitives.css:118 | `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row-option[aria-selected="true"]` | `background: var(--nuiget-color-list-inactive-bg)` | `shared/primitives/primitives.css:103 .nuiget-row:hover .nuiget-row-option { background: var(--nuiget-color-list-hover-bg) }`<br>`shared/primitives/primitives.css:107 .nuiget-row-option[aria-selected="true"] { background: var(--nuiget-color-list-active-bg) }` | P5.4 4a083b5 |
| shared/primitives/primitives.css:119 | `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row-option[aria-selected="true"]` | `color: inherit` | `shared/primitives/primitives.css:98 .nuiget-row-option { color: var(--nuiget-color-fg) }`<br>`shared/primitives/primitives.css:108 .nuiget-row-option[aria-selected="true"] { color: var(--nuiget-color-list-active-fg) }` | P5.4 4a083b5 |
| shared/primitives/primitives.css:123 | `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row-option[aria-current="true"]` | `background: var(--nuiget-color-list-active-bg)` | `shared/primitives/primitives.css:103 .nuiget-row:hover .nuiget-row-option { background: var(--nuiget-color-list-hover-bg) }`<br>`shared/primitives/primitives.css:107 .nuiget-row-option[aria-selected="true"] { background: var(--nuiget-color-list-active-bg) }`<br>`shared/primitives/primitives.css:118 .nuiget-listbox[aria-multiselectable="true"] .nuiget-row-option[aria-selected="true"] { background: var(--nuiget-color-list-inactive-bg) }` | P3.2 81ec41d |
| shared/primitives/primitives.css:124 | `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row-option[aria-current="true"]` | `color: var(--nuiget-color-list-active-fg)` | `shared/primitives/primitives.css:98 .nuiget-row-option { color: var(--nuiget-color-fg) }`<br>`shared/primitives/primitives.css:108 .nuiget-row-option[aria-selected="true"] { color: var(--nuiget-color-list-active-fg) }`<br>`shared/primitives/primitives.css:119 .nuiget-listbox[aria-multiselectable="true"] .nuiget-row-option[aria-selected="true"] { color: inherit }` | P3.2 81ec41d |
| shared/primitives/primitives.css:125 | `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row-option[aria-current="true"]` | `forced-color-adjust: none` | `shared/primitives/primitives.css:110 .nuiget-row-option[aria-selected="true"] { forced-color-adjust: none }` | P3.2 81ec41d |
| shared/primitives/primitives.css:184 | `.nuiget-row-option[aria-selected="true"] .nuiget-row-version` | `color: inherit` | `shared/primitives/primitives.css:158 .nuiget-row-version { color: var(--nuiget-color-fg-muted) }` | P5.11 a571f66 |
| shared/primitives/primitives.css:184 | `.nuiget-row-option[aria-selected="true"] .nuiget-row-description` | `color: inherit` | `shared/primitives/primitives.css:158 .nuiget-row-description { color: var(--nuiget-color-fg-muted) }` | P5.11 a571f66 |
| shared/primitives/primitives.css:184 | `.nuiget-row-option[aria-selected="true"] .nuiget-row-status` | `color: inherit` | `shared/primitives/primitives.css:158 .nuiget-row-status { color: var(--nuiget-color-fg-muted) }` | P5.11 a571f66 |
| shared/primitives/primitives.css:184 | `.nuiget-row-option[aria-current="true"] .nuiget-row-version` | `color: inherit` | `shared/primitives/primitives.css:158 .nuiget-row-version { color: var(--nuiget-color-fg-muted) }` | P5.11 a571f66 |
| shared/primitives/primitives.css:184 | `.nuiget-row-option[aria-current="true"] .nuiget-row-description` | `color: inherit` | `shared/primitives/primitives.css:158 .nuiget-row-description { color: var(--nuiget-color-fg-muted) }` | P5.11 a571f66 |
| shared/primitives/primitives.css:184 | `.nuiget-row-option[aria-current="true"] .nuiget-row-status` | `color: inherit` | `shared/primitives/primitives.css:158 .nuiget-row-status { color: var(--nuiget-color-fg-muted) }` | P5.11 a571f66 |
| shared/primitives/primitives.css:184 | `.nuiget-row-option[aria-selected="true"] .nuiget-row-version-new` | `color: inherit` | `shared/primitives/primitives.css:211 .nuiget-row-version-new { color: var(--nuiget-color-version-new) }` | P5.11 a571f66 |
| shared/primitives/primitives.css:184 | `.nuiget-row-option[aria-selected="true"] .nuiget-row-authors` | `color: inherit` | `shared/primitives/primitives.css:225 .nuiget-row-authors { color: var(--nuiget-color-fg-muted) }` | P5.11 a571f66 |
| shared/primitives/primitives.css:184 | `.nuiget-row-option[aria-selected="true"] .nuiget-row-meta` | `color: inherit` | `shared/primitives/primitives.css:216 .nuiget-row-meta { color: var(--nuiget-color-fg-muted) }` | P5.11 a571f66 |
| shared/primitives/primitives.css:184 | `.nuiget-row-option[aria-current="true"] .nuiget-row-version-new` | `color: inherit` | `shared/primitives/primitives.css:211 .nuiget-row-version-new { color: var(--nuiget-color-version-new) }` | P5.11 a571f66 |
| shared/primitives/primitives.css:184 | `.nuiget-row-option[aria-current="true"] .nuiget-row-authors` | `color: inherit` | `shared/primitives/primitives.css:225 .nuiget-row-authors { color: var(--nuiget-color-fg-muted) }` | P5.11 a571f66 |
| shared/primitives/primitives.css:184 | `.nuiget-row-option[aria-current="true"] .nuiget-row-meta` | `color: inherit` | `shared/primitives/primitives.css:216 .nuiget-row-meta { color: var(--nuiget-color-fg-muted) }` | P5.11 a571f66 |
| shared/primitives/primitives.css:246 | `.nuiget-row--comfortable .nuiget-row-option` | `gap: var(--nuiget-space-5)` | `shared/primitives/primitives.css:94 .nuiget-row-option { gap: var(--nuiget-space-3) }` | P9.2 83afc1b |
| shared/primitives/primitives.css:247 | `.nuiget-row--comfortable .nuiget-row-option` | `padding: var(--nuiget-space-5) var(--nuiget-inset)` | `shared/primitives/primitives.css:97 .nuiget-row-option { padding: 0 var(--nuiget-space-4) }` | P9.fix-6 c50d335 |
| shared/primitives/primitives.css:280 | `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row--comfortable .nuiget-row-option[aria-selected="true"]` | `box-shadow: none` | `shared/primitives/primitives.css:276 .nuiget-row--comfortable .nuiget-row-option[aria-selected="true"] { box-shadow: inset 3px 0 0 var(--nuiget-color-focus) }` | P9.2 83afc1b |
| shared/primitives/primitives.css:284 | `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row--comfortable .nuiget-row-option[aria-current="true"]` | `box-shadow: inset 3px 0 0 var(--nuiget-color-focus)` | `shared/primitives/primitives.css:276 .nuiget-row--comfortable .nuiget-row-option[aria-selected="true"] { box-shadow: inset 3px 0 0 var(--nuiget-color-focus) }`<br>`shared/primitives/primitives.css:280 .nuiget-listbox[aria-multiselectable="true"] .nuiget-row--comfortable .nuiget-row-option[aria-selected="true"] { box-shadow: none }` | P9.2 83afc1b |
| shared/primitives/primitives.css:292 | `.nuiget-row--compact .nuiget-row-body` | `flex-direction: row` | `shared/primitives/primitives.css:190 .nuiget-row-body { flex-direction: column }` | P9.2 83afc1b |
| shared/primitives/primitives.css:294 | `.nuiget-row--compact .nuiget-row-body` | `gap: var(--nuiget-space-3)` | `shared/primitives/primitives.css:193 .nuiget-row-body { gap: var(--nuiget-space-1) }` | P9.2 83afc1b |
| shared/primitives/primitives.css:299 | `.nuiget-row--compact .nuiget-row-line` | `display: contents` | `shared/primitives/primitives.css:197 .nuiget-row-line { display: flex }` | P9.2 83afc1b |
| shared/primitives/primitives.css:300 | `.nuiget-row--compact .nuiget-row-line` | `overflow: visible` | `shared/primitives/primitives.css:201 .nuiget-row-line { overflow: hidden }` | P9.2 57b8273 |
| shared/primitives/primitives.css:304 | `.nuiget-row--compact .nuiget-row-name` | `flex-grow: 0` | `shared/primitives/primitives.css:269 .nuiget-row--comfortable .nuiget-row-name { flex: 0 1 auto }` | P9.2 83afc1b |
| shared/primitives/primitives.css:305 | `.nuiget-row--compact .nuiget-row-name` | `flex-shrink: 0` | `shared/primitives/primitives.css:269 .nuiget-row--comfortable .nuiget-row-name { flex: 0 1 auto }` | P9.2 83afc1b |
| shared/primitives/primitives.css:306 | `.nuiget-row--compact .nuiget-row-name` | `flex-basis: auto` | `shared/primitives/primitives.css:269 .nuiget-row--comfortable .nuiget-row-name { flex: 0 1 auto }` | P9.2 83afc1b |
| shared/primitives/primitives.css:332 | `.nuiget-row--compact .nuiget-row-authors` | `overflow: hidden` | `shared/primitives/primitives.css:224 .nuiget-row-authors { overflow: hidden }` | P3.2 81ec41d |
| shared/primitives/primitives.css:332 | `.nuiget-row--compact .nuiget-row-description` | `overflow: hidden` | `shared/primitives/primitives.css:164 .nuiget-row-description { overflow: hidden }` | P3.2 81ec41d |
| shared/primitives/primitives.css:347 | `.nuiget-row:hover .nuiget-row-actions` | `visibility: visible` | `shared/primitives/primitives.css:341 .nuiget-row-actions { visibility: hidden }` | P3.2 81ec41d |
| shared/primitives/primitives.css:347 | `.nuiget-row:focus-within .nuiget-row-actions` | `visibility: visible` | `shared/primitives/primitives.css:341 .nuiget-row-actions { visibility: hidden }` | P3.2 81ec41d |
| shared/primitives/primitives.css:347 | `.nuiget-row--busy .nuiget-row-actions` | `visibility: visible` | `shared/primitives/primitives.css:341 .nuiget-row-actions { visibility: hidden }` | P3.2 81ec41d |
| shared/primitives/primitives.css:384 | `.nuiget-icon-button:hover` | `color: var(--nuiget-color-fg)` | `shared/primitives/primitives.css:377 .nuiget-icon-button { color: var(--nuiget-color-fg-muted) }` | P3.2 81ec41d |
| shared/primitives/primitives.css:384 | `.nuiget-icon-button[aria-pressed="true"]` | `color: var(--nuiget-color-fg)` | `shared/primitives/primitives.css:377 .nuiget-icon-button { color: var(--nuiget-color-fg-muted) }` | P3.2 81ec41d |
| shared/primitives/primitives.css:388 | `.nuiget-icon-button:disabled` | `color: var(--nuiget-color-fg-muted)` | `shared/primitives/primitives.css:377 .nuiget-icon-button { color: var(--nuiget-color-fg-muted) }`<br>`shared/primitives/primitives.css:384 .nuiget-icon-button:hover { color: var(--nuiget-color-fg) }`<br>`shared/primitives/primitives.css:384 .nuiget-icon-button[aria-pressed="true"] { color: var(--nuiget-color-fg) }` | P3.2 81ec41d |
| shared/primitives/primitives.css:389 | `.nuiget-icon-button:disabled` | `cursor: default` | `shared/primitives/primitives.css:378 .nuiget-icon-button { cursor: pointer }` | P3.2 81ec41d |
| shared/primitives/primitives.css:519 | `.nuiget-button:hover` | `background: var(--nuiget-color-button-hover-bg)` | `shared/primitives/primitives.css:512 .nuiget-button { background: var(--nuiget-color-button-bg) }` | P3.2 c48d30b |
| shared/primitives/primitives.css:531 | `.nuiget-button:disabled` | `background: var(--nuiget-color-button-secondary-bg)` | `shared/primitives/primitives.css:512 .nuiget-button { background: var(--nuiget-color-button-bg) }`<br>`shared/primitives/primitives.css:519 .nuiget-button:hover { background: var(--nuiget-color-button-hover-bg) }` | P3.2 c48d30b |
| shared/primitives/primitives.css:532 | `.nuiget-button:disabled` | `color: var(--nuiget-color-fg-muted)` | `shared/primitives/primitives.css:513 .nuiget-button { color: var(--nuiget-color-button-fg) }` | P3.2 81ec41d |
| shared/primitives/primitives.css:533 | `.nuiget-button:disabled` | `cursor: default` | `shared/primitives/primitives.css:515 .nuiget-button { cursor: pointer }` | P3.2 81ec41d |
| shared/primitives/primitives.css:531 | `.nuiget-button:disabled:hover` | `background: var(--nuiget-color-button-secondary-bg)` | `shared/primitives/primitives.css:512 .nuiget-button { background: var(--nuiget-color-button-bg) }`<br>`shared/primitives/primitives.css:519 .nuiget-button:hover { background: var(--nuiget-color-button-hover-bg) }` | P3.2 c48d30b |
| shared/primitives/primitives.css:532 | `.nuiget-button:disabled:hover` | `color: var(--nuiget-color-fg-muted)` | `shared/primitives/primitives.css:513 .nuiget-button { color: var(--nuiget-color-button-fg) }` | P3.2 81ec41d |
| shared/primitives/primitives.css:533 | `.nuiget-button:disabled:hover` | `cursor: default` | `shared/primitives/primitives.css:515 .nuiget-button { cursor: pointer }` | P3.2 81ec41d |
| shared/primitives/primitives.css:604 | `.nuiget-progress--indeterminate .nuiget-progress-bar` | `width: 30%` | `shared/primitives/primitives.css:594 .nuiget-progress-bar { width: var(--nuiget-progress-value) }` | P3.2 c48d30b |
| shared/primitives/primitives.css:643 | `.nuiget-banner--warning .nuiget-banner-icon` | `color: var(--nuiget-color-warning)` | `shared/primitives/primitives.css:639 .nuiget-banner-icon { color: var(--nuiget-color-info) }` | P3.2 c48d30b |
| shared/primitives/primitives.css:647 | `.nuiget-banner--error .nuiget-banner-icon` | `color: var(--nuiget-color-error)` | `shared/primitives/primitives.css:639 .nuiget-banner-icon { color: var(--nuiget-color-info) }`<br>`shared/primitives/primitives.css:643 .nuiget-banner--warning .nuiget-banner-icon { color: var(--nuiget-color-warning) }` | P3.2 c48d30b |
| shared/primitives/primitives.css:690 | `.nuiget-sash:hover` | `background: var(--nuiget-color-focus)` | `shared/primitives/primitives.css:661 .nuiget-sash { background: var(--nuiget-color-border) }` | P3.2 c48d30b |
| shared/primitives/primitives.css:690 | `.nuiget-sash:focus-visible` | `background: var(--nuiget-color-focus)` | `shared/primitives/primitives.css:661 .nuiget-sash { background: var(--nuiget-color-border) }` | P3.2 c48d30b |
| shared/primitives/primitives.css:780 | `.nuiget-dialog-layer ~ .nuiget-popover` | `z-index: var(--nuiget-z-dialog)` | `shared/primitives/primitives.css:762 .nuiget-popover { z-index: var(--nuiget-z-popover) }` | P5.1 d7a79ba |
| shared/primitives/primitives.css:816 | `.nuiget-tab:hover` | `color: var(--nuiget-color-fg)` | `shared/primitives/primitives.css:809 .nuiget-tab { color: var(--nuiget-color-fg-muted) }` | P3.2 81ec41d |
| shared/primitives/primitives.css:821 | `.nuiget-tab[aria-selected="true"]` | `border-block-end-color: var(--nuiget-color-focus)` | `shared/primitives/primitives.css:806 .nuiget-tab { border: 1px solid var(--nuiget-color-contrast-border) }`<br>`shared/primitives/primitives.css:807 .nuiget-tab { border-block-end: var(--nuiget-space-1) solid transparent }` | P5.1 d7a79ba |
| shared/primitives/primitives.css:822 | `.nuiget-tab[aria-selected="true"]` | `color: var(--nuiget-color-fg)` | `shared/primitives/primitives.css:809 .nuiget-tab { color: var(--nuiget-color-fg-muted) }`<br>`shared/primitives/primitives.css:816 .nuiget-tab:hover { color: var(--nuiget-color-fg) }` | P3.2 81ec41d |
| main/main.css:44 | `.nuiget-main-select:disabled` | `color: var(--nuiget-color-fg-muted)` | `main/main.css:39 .nuiget-main-select { color: var(--nuiget-color-dropdown-fg) }` | P5.3 7385eeb |
| main/main.css:219 | `.nuiget-installed--sections .nuiget-installed-project` | `flex: none` | `main/main.css:201 .nuiget-installed-project { flex: 1 }` | P5.4 7f8dfd1 |
| main/main.css:219 | `.nuiget-installed--sections .nuiget-installed-project-content` | `flex: none` | `main/main.css:201 .nuiget-installed-project-content { flex: 1 }` | P5.4 7f8dfd1 |
| main/main.css:231 | `.nuiget-transitive .nuiget-listbox` | `flex: none` | `main/main.css:219 .nuiget-installed--sections .nuiget-listbox { flex: none }` | P5.4 7f8dfd1 |
| main/main.css:232 | `.nuiget-transitive .nuiget-listbox` | `overflow: visible` | `main/main.css:220 .nuiget-installed--sections .nuiget-listbox { overflow: visible }` | P5.4 7f8dfd1 |
| main/main.css:708 | `.nuiget-installed-project--grouped > .nuiget-section-header .nuiget-section-toggle` | `text-transform: none` | `main/main.css:359 .nuiget-details-group .nuiget-section-toggle { text-transform: none }` | P9.11 0e02690 |
| shared/search/search.css:107 | `.nuiget-search-option--active .nuiget-search-option-expand` | `color: inherit` | `shared/search/search.css:103 .nuiget-search-option-expand { color: var(--nuiget-color-fg-muted) }` | P5.6 4dfa2e5 |
| sidebar/sidebar.css:114 | `.nuiget-sash--horizontal + .nuiget-sidebar-section > .nuiget-section-header` | `border-top-color: transparent` | `sidebar/sidebar.css:103 .nuiget-sidebar-section > .nuiget-section-header { border-top: 1px solid var(--nuiget-color-section-header-border) }` | P9.10 8388bff |
| sidebar/sidebar.css:134 | `.nuiget-sidebar-project .nuiget-row-option` | `padding-inline-start: calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + var(--nuiget-space-2) + var(--nuiget-tree-indent))` | `sidebar/sidebar.css:119 .nuiget-sidebar-section-content .nuiget-row-option { padding-inline-start: calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + var(--nuiget-space-2)) }` | P9.10 8388bff |

# Component base for the UX overhaul: a costed decision

Research dimension: component-base · 2026-10-22 · repository `main` at `e4d6e97`, read-only · author: research agent

## 0. Answer first

**Keep the hand-rolled primitives. Do not adopt `@vscode-elements/elements`. Take the third option: refresh the
icons from the current codicon drawings (inline SVG, pinned, attributed) and rewrite the CSS against VS Code's own
design-system size tokens.** The costs differ materially, so this is a round-1 decision.

| Option | One-time cost | Ongoing cost | Fixes V1–V5? | Native-feel gain |
|---|---|---|---|---|
| A. Keep primitives, fix V1–V5 in the CSS as it is | 2–3 session-days | low | yes (layout only) | none beyond V1–V5: icons, radii, type sizes stay off-workbench |
| B. Partial adoption of `@vscode-elements/elements` for the leaf controls | 8–11 session-days, plus two owner rulings (bundle ceilings, ADR-006/008) | medium-high; unbounded under the current Dependabot auto-merge unless the owner pins and excludes the package | V1 in part; V2–V5 untouched | custom-drawn select list; a 2025-era snapshot of workbench controls; not the current workbench |
| **C. Keep primitives + current codicons inline + CSS on the workbench size tokens** | **4–5.5 session-days (+1.5–2 for an optional own Select)** | **low** | **yes** | **current glyphs, the workbench's spacing ramp, radii, type ramp and control metrics; it follows the host from VS Code 1.110** |

Four measured facts decide it:

1. **B can only be partial.** The library has no listbox/option component, no virtualization, and its row-like
   elements break the repository's listbox contract. `Listbox`, `Row`, `SectionHeader`, `Sash`, `Dialog`,
   `ConfirmDialog`, `Banner`, `EmptyState`, `Skeleton`, `LiveStatus`, `ErrorBoundary`, `IconButton` (row actions),
   `layers` and `cssVars` stay hand-rolled under every option (§2.3, §2.4).
2. **B crosses both bundle ceilings.** The adopted set adds 123,471 bytes to `dist/webview.js`, which has 28,823
   bytes of headroom. It adds 51,954 bytes to `dist/sidebar.js`, which has 17,993. The primitives it would replace
   weigh about 9.7 kB in the webview bundle and about 6.1 kB in the sidebar (§2.8, measured with the repository's own
   esbuild).
3. **B breaks the jsdom harness.** jsdom 30.1.2 has no `ElementInternals.setFormValue`, `setValidity`, `states` or
   `HTMLElement.showPopover`. The library calls `setFormValue` from `update()`. 33 of the 59 webview test files use
   189 role queries for controls that would move into shadow roots. Testing Library finds 0 controls in a shadow root
   (§2.9, probe run).
4. **C reaches what the owner asked for, and B does not.** VS Code exports its design-system size ramp (spacing,
   corner radius, font size and weight, codicon size, stroke) to every webview as `--vscode-*` variables since
   1.110. The repository uses none of them, and neither does the library (§3). The webview icons are the 2020
   codicon drawings. VS Code has shipped redrawn glyphs since 1.106, and the CI captures (VS Code **1.140.0**) show
   the two side by side (§4).

## 1. Scope, inputs, method

- Task: keep `src/webview/shared/primitives/` or adopt `@vscode-elements/elements`, or a third option (primitives
  plus codicons plus CSS rewritten against "the Design System"). `@vscode/webview-ui-toolkit` is archived and out of
  scope.
- **What "the Design System" means here.** No input defined it. I take it as VS Code's own design-system size tokens:
  `src/vs/platform/theme/common/sizes/baseSizes.ts`, exported to webviews by
  `src/vs/workbench/contrib/webview/browser/themeing.ts:72-90`, with the canonical rules in
  `.github/instructions/design-tokens.instructions.md` of microsoft/vscode. I also include the workbench widget CSS
  (`button.css`, `inputBox.css`, `toggle.css`, `countBadge.css`, `selectBox.css`). The values that tokens.css should
  take, and the layout per state, belong to the visual dimension. This report only costs the base.
- Read-only rules held. Nothing under the repository was written. Builds ran with `write: false`, or wrote to the
  scratchpad. Package sources were mirrored from jsDelivr into the scratchpad (`scratchpad/vnm`, `scratchpad/pkgdata`)
  and never installed: no install scripts ran.
- Scripts used (all in the scratchpad):
  - `minsizes.mjs`, `graph.mjs`, `closure.cjs`: the package's per-file sizes and import graph.
  - `fetchpkgs.mjs`: a mirror of the pinned package files.
  - `measure/bundle-elements.mjs`: bundles the element sets with the repository's esbuild 0.28.2 at `chrome114`,
    `iife`, minified.
  - `measure/bundle-repo.mjs`: the repository's two entries, with the metafile share per primitive.
  - `measure/bundle-icons.mjs`: the entries with refreshed codicon paths swapped in, in memory.
  - `denyscan.cjs`: the repository's Chromium-114 CSS denylist run over the package's Lit CSS.
  - `jsdom-probe.cjs`: what the repository's jsdom and Testing Library can do.
- Unit of cost: one **session-day**, one RUN.md-sized item with its gates, as the 2.0 plan sizes items.

## 2. `@vscode-elements/elements`: the evidence

### 2.1 Package facts

| Fact | Value | Evidence |
|---|---|---|
| Current version | 2.5.1 (dist-tag `latest`; `next` = 2.4.1-pre.1) | `npm view @vscode-elements/elements version dist-tags` → `2.5.1`; published 2026-02-21 |
| License | MIT | `npm view … license` → `MIT`; `gh api repos/vscode-elements/elements` → `"license":"MIT"` |
| Dependencies | `lit ^3.2.1`, `@lit/context ^1.1.3`; peer `@vscode/codicons >=0.0.40` | `npm view … dependencies peerDependencies` |
| Lit resolved today | lit 3.3.3 → `@lit/reactive-element ^2.1.0`, `lit-element ^4.2.0`, `lit-html ^3.3.0` | `npm view lit version dependencies` |
| Unpacked size | 2,022,392 bytes, 551 files; `dist/bundled.js` (all 38 elements + Lit, terser) 233,123 | `npm view … dist.unpackedSize dist.fileCount`; jsDelivr file listing `data.jsdelivr.com/v1/packages/npm/@vscode-elements/elements@2.5.1?structure=flat` |
| JS level | `"target": "es2021"` | `gh api repos/vscode-elements/elements/contents/tsconfig.json` |
| Declared browsers | `"browserslist": ["last 1 chrome versions"]` | `npm view … browserslist`; repository `package.json` |
| Elements | 38 (`src/vscode-*`) | `gh api repos/vscode-elements/elements/contents/src` |
| Maintainers | `bendera` 1,871 contributions; next human 14 (bots 88 + 45) | `gh api repos/vscode-elements/elements/contributors` |
| Cadence | releases 2.3.0 2025-08-26 · 2.3.1 2025-09-14 · 2.4.0 2025-12-26 · 2.5.0 2026-02-08 · 2.5.1 2026-02-22; `main` is 22 commits ahead of `v2.5.1` (mostly Renovate) | `gh api …/releases`, `gh api …/compare/v2.5.1...main` → `ahead_by 22` |
| Open issues | 44; "Add basic a11y tests" #358 still open | `gh api …/issues?state=open`; search API |
| React wrapper | `@vscode-elements/react-elements` 2.4.0 (`@lit/react`, peers React 17–19), one minor behind | `npm view @vscode-elements/react-elements version dependencies peerDependencies` |

### 2.2 Chromium 114 (D10)

| Question | Answer | Evidence |
|---|---|---|
| Does Lit declare 114? | No. Lit is "published as ES2021" and tested on "the current versions of Chromium … plus two major versions prior"; "Older versions may still work but will be at best efforts without guarantee." | https://lit.dev/docs/v3/tools/requirements/ |
| Does the package declare 114? | No: `browserslist: last 1 chrome versions` | §2.1 |
| Does the syntax build for 114? | Yes. esbuild 0.28.2 with `target: ['chrome114']` bundles all 38 elements with 0 errors and 0 warnings | `node measure/bundle-elements.mjs` → `"all": { "bytes": 237065, "warnings": 0 }` |
| CSS newer than 114? | One hit for the repository's denylist: `scrollbar-width: none` (Chromium 121) in `vscode-scrollable` | `node denyscan.cjs` (26 entries parsed from `src/test/lint/webview-css-baseline.test.ts:35-61`) |
| DOM APIs at the edge | `showPopover`/`popover` (Chrome **114**, exactly the floor) in `includes/vscode-select/vscode-select-base.js:208,597`. `:state()` (125) always paired with the legacy `:--state` (90) inside a forgiving `:is()`, and `states.add` falls back to `--name` in a `try/catch` (`vscode-tree-item.js:223-243`). `ElementInternals` 77, `CustomStateSet` 90, `adoptedStyleSheets` 73. | MDN BCD `api/HTMLElement.json`, `api/CustomStateSet.json`, `css/selectors/state.json`, `api/ElementInternals.json`, `api/ShadowRoot.json` read 2026-10-22 |
| Guarded by the repository? | No. `webview-css-baseline.test.ts` scans only `src/webview/{shared,main,sidebar}` (`:20`), never Lit `css` strings in `node_modules`, and no CI job renders on Chromium 114 (N64, `ARCHITECTURE.md:265-266`) | file read |

Verdict: version 2.5.1 runs on Chromium 114 **by inspection**, not by contract. Every bump needs the denylist rerun
over the package CSS. One plausible future change, anchor positioning for the select dropdown (Chromium 125),
would be dropped silently.

### 2.3 Inventory: primitives → elements

| Primitive (product uses, `grep` of JSX tags outside `primitives/`) | Element | Fit |
|---|---|---|
| `Badge` (main 17, sidebar 6) | `vscode-badge` (`default`, `counter`, `activity-bar-counter`, `tab-header-counter`) | close; no info/warning/error variants (repository has `--info`, `--warning`, `--error`, `primitives.css:416-424`) |
| `Banner` (main 25, sidebar 13) | none | — |
| `ConfirmDialog` (3), `Dialog` (3) | none | — |
| `EmptyState` (main 16, sidebar 6) | none | — |
| `ErrorBoundary` (2) | none (React concept) | — |
| `IconButton` (main 7, sidebar 4, shared 2) | `vscode-toolbar-button`, `vscode-icon action-icon` | **unusable for row actions** (§2.4) |
| `Listbox` (main 3, sidebar 3) | none. `vscode-tree` is `tree`/`treeitem`; the selects' `listbox`/`option` live inside their own shadow dropdown (`vscode-select-base.js:488,517`) | **no fit** |
| `LiveStatus` (2) | none | — |
| `Popover` (0 product uses; exported, `index.ts:17`) | `vscode-context-menu` (menu only) | partial |
| `ProgressBar` (4) | `vscode-progress-bar` | close |
| `Row` (main 5, sidebar 3) | `vscode-tree-item`, `vscode-table-row` | **no fit** (§2.4) |
| `Sash` (2) | `vscode-split-layout` | **a11y regression**: no role, no ARIA, no keys (`grep role=\|aria-\|tabindex\|keydown` on `vscode-split-layout.js` → empty), whereas `Sash.tsx:92-101` is `role="separator"` with `aria-value*` and arrow keys |
| `SectionHeader` (main 7, sidebar 4) | `vscode-collapsible` | **a11y regression**: the header is a `div tabindex="0"` with no role and no `aria-expanded`, and slotted actions sit inside the focusable header (`vscode-collapsible.js` render); `SectionHeader.tsx:39-42` is a `<button aria-expanded>` |
| `Skeleton` (18) | none | — |
| `Spinner` (inside `Row`, `SectionHeader`) | `vscode-progress-ring` | **conflict**: it sets `role="alert"`, `ariaLive="assertive"`, `ariaLabel="Loading"` on every ring (`vscode-progress-ring.js:19-21`) against the repository's one live region (`ARCHITECTURE.md:355`) |
| `Tabs` (main 2) | `vscode-tabs` + `vscode-tab-header` + `vscode-tab-panel` | close; keys ArrowLeft/Right/Enter only |
| `Toolbar` (main 3) | `vscode-toolbar-container` | close |
| icons (26 `React.memo`, `webview-icons-pure.test.ts:29`) | `vscode-icon` (codicon **font**) | different mechanism (§4) |
| `layers`, `cssVars` | none (`stylePropertyMap` is internal) | — |
| native `<button>` 27, `<input>` 11 (6 check boxes), `<select>` 4 in product files | `vscode-button`, `vscode-textfield`, `vscode-checkbox`, `vscode-single-select` + `vscode-option` | the real adoption surface |

Count command:
`for p in Badge …; do grep -rnE "<${p}[ >/]|<${p}$" main|sidebar|shared --include=*.tsx | grep -v .test. | wc -l; done`.
Native controls:
`grep -rn --include='*.tsx' '<button\|<input\|<select' src/webview | grep -v .test.`.

### 2.4 Listbox semantics against the repository's rules

The repository's rules are in `ARCHITECTURE.md:290-346`:

- a list is `role="listbox"` with `role="option"` rows;
- no button inside an option (axe `nested-interactive`, also at `tabIndex={-1}`);
- row actions sit in an `aria-hidden` sibling container with `IconButton tabIndex={-1}`;
- every action has a key (Enter, Ctrl/Cmd+Enter, Delete, Shift+F10, Space);
- roving tab stop, always virtualized with `aria-posinset`/`aria-setsize`.

| Rule | `@vscode-elements` | Evidence |
|---|---|---|
| A standalone listbox/option | none | §2.3 |
| Virtualization | none: `grep -i virtual` over all 136 dist modules → 0. `vscode-tree`, `vscode-table` render every item | `node -e` scan in §1 |
| Actions outside the item | `vscode-tree-item` slots `actions` **inside** the `treeitem` host (`vscode-tree-item.js:569-574`, `this.role = 'treeitem'` at `:163`) | source |
| Action buttons with `tabIndex -1` in an `aria-hidden` container | `vscode-toolbar-button` renders its own `<button type="button">` in its shadow root, with no tabindex pass-through and no host role (`vscode-toolbar-button.js` render). `vscode-icon action-icon` does the same (`vscode-icon.js` render, `<button class="button" aria-label=…>`). Inside an `aria-hidden` container they would be Tab-reachable: axe `aria-hidden-focus`, and the single tab stop is lost. Derived from source, **not executed in axe**. | source |
| Keys | `vscode-tree`: Space, ArrowUp/Down/Left/Right, Enter, Escape. No Home/End, Delete, Ctrl+Enter or Shift+F10/ContextMenu | key-literal scan of `vscode-tree.js` |
| Two selections (bulk `aria-selected` plus `aria-current`) | not modelled (`vscode-tree` has `multiSelect`, no current/selected split) | `vscode-tree.js:183` |

Consequence: under option B, `Listbox`, `Row` and `IconButton` stay as they are, and the 17 test files that call
`installFakeLayout()` are unaffected (`grep -rl installFakeLayout src/webview --include=*.test.ts*` → 17).

### 2.5 Shadow-root styles, the CSP and ADR-006

- **The CSP string** (`src/host/services.ts:111-118`; asserted verbatim at `src/host/handlers.test.ts:605-606`):
  `default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource}; font-src ${cspSource}; script-src 'nonce-…'; connect-src 'none'`.
  No `'unsafe-inline'` (`handlers.test.ts:608`).
- **Lit styles.** Lit adopts its `css` through constructable stylesheets (`adoptedStyleSheets`, Chrome 73).
  Constructable sheets are not restricted by `style-src`. Evidence: WICG/construct-stylesheets#98. tabatkins: "script-created
  CSSStyleSheets should be fine to stay un-restricted by CSP"; emilio: CSP "doesn't block CSSOM … matches Firefox's
  implementation" (`gh api repos/WICG/construct-stylesheets/issues/98/comments`). **Not verified in Chromium 114
  under this exact policy** (no browser run was allowed). This is consistent with ADR-006 ("styles are set through
  the CSSOM … never as `<style>` or a `style` attribute", `docs/adr/006-icons-and-csp.md:20-22`). It does put CSS
  into JavaScript, where none of the stylesheet lints reach.
- **Inline styles.** The package avoids the `style` attribute on purpose. Its `stylePropertyMap` directive calls
  `element.style.setProperty` ("instead of setting styles via the style attribute (which violates CSP)",
  `includes/style-property-map.js`), and `vscode-table` writes `el.style.x` (CSSOM). The scan found no static
  `style="…"` in any template.
- **Icons need a host change.** `vscode-icon` looks up `<link id="vscode-codicon-stylesheet">` in the document and
  re-inserts a `<link rel="stylesheet">` into **every icon's shadow root** (`vscode-icon.js`
  `_getStylesheetConfig`, `render`). `renderWebviewHtml` would add that link (`services.ts:126` has the one
  stylesheet link now) and ship `codicon.css` + `codicon.ttf` (38,876 + 149,508 bytes, jsDelivr listing of
  `@vscode/codicons@0.0.46-24`). Under `resources/` this passes `ALLOWED_PATTERNS` (`scripts/check-vsix-contents.mjs:10-18`).
  Under `dist/`, a `dist/*.ttf` pattern is needed. The policy string itself does not change.
- Under jsdom (no `adoptedStyleSheets`, probe in §2.9) Lit falls back to `<style>` elements, which is harmless in tests.

### 2.6 Theming

- The package reads `--vscode-*` directly: 70 distinct variables, **154 uses with a literal colour fallback**, and 4
  without (scan of all dist modules). An example is `vscode-badge.styles.js`:
  `background-color: var(--vscode-badge-background, #616161)`.
- It hard-codes px metrics: 129 padding/margin/gap/height/line-height/font-size declarations in px, for example
  badge `font-size: 11px; padding: 3px 6px`.
- This sits outside `tokens.css`. The invariants that tokens own every value, no colour literal, and spacing on the
  scale (`webview-colours.test.ts`, `webview-stylesheets.test.ts` `pxSpacing`) would hold for the repository's
  files and not for what ships.
- **Spacing ramp.** 51 of the 116 px lengths in the package's padding/margin/gap are off VS Code's spacing ramp
  (0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40). Examples: button `1px 13px`, tab header `7px 8px`, form
  group `12px 14px 18px`. Scan in §1.
- **Accessibility media.** No `forced-colors` rule (0 hits). `prefers-reduced-motion` appears only in
  `vscode-progress-bar.styles.js`. High contrast is handled only through `--vscode-contrastBorder` in the badge and
  `vscode-high-contrast` in the select. The repository has a full forced-colours and reduced-motion block
  (`src/webview/shared/tokens.css:162+`).
- **No size tokens.** 0 uses of `--vscode-spacing-*`, `--vscode-cornerRadius-*`, `--vscode-fontSize-*` (§3).
- **It lags the workbench.** `vscode-button` is `font-size: var(--vscode-font-size, 13px); line-height: 22px;
  padding: 1px 13px` with radius 4 (`vscode-button.styles.js:19-47`). Since microsoft/vscode `dccac35` "Polish
  buttons and inputs" (2026-01-14) the workbench button is `padding: 4px 8px; border-radius: 4px; line-height: 16px;
  font-size: 12px` (`src/vs/base/browser/ui/button/button.css:6-18`, patch via `gh api …/commits/dccac35`).
  Adopting the library therefore yields its snapshot, not the current workbench. The badge (`3px 5px`, radius 11)
  and the 18 px checkbox do match today's `countBadge.css:6-12` and `toggle.css:54-61`. The checkbox and the
  collapsible chevron still embed **pre-2025 codicon drawings** as inline SVG paths, for example the checkbox
  `M14.431 3.323l-8.47 10…`.

### 2.7 Virtualization

None in the package (§2.4). `Listbox` keeps `@tanstack/react-virtual`: 26,883 bytes in `dist/webview.js` and 26,882 in
`dist/sidebar.js` (metafile, §2.8).

### 2.8 Bundle delta (measured)

Ceilings in `esbuild.mjs:24`: webview 577,766, sidebar 351,245. Current sizes: 548,943 and 333,252. They are
reproduced exactly by `measure/bundle-repo.mjs`, and they equal `src/webview/main/STATUS.md:90` and
`docs/plans/STATUS.md:1225`. Headroom: **28,823** (webview) and **17,993** (sidebar).

| Set (esbuild 0.28.2, minify, iife, chrome114) | Bytes | of which Lit | Element code |
|---|---|---|---|
| Lit alone (one trivial element) | 15,549 | 14,934 | — |
| Main-panel set (badge, button, checkbox, single-select, option, textfield, tabs ×3, progress bar, progress ring, icon, toolbar button/container, divider) | **123,471** | 19,729 | 102,263 |
| Sidebar set (badge, button, textfield, progress bar/ring, icon, toolbar button) | **51,954** | 17,566 | 33,101 |
| Form controls only (button, checkbox, single-select, option, textfield) | 101,581 | 19,517 | 80,585 |
| Everything (`dist/main.js`) | 237,065 | 19,911 | 211,912 (+ `@lit/context` 3,434) |

The 237,065 here and the 233,123 of `dist/bundled.js` in §2.1 are about 4 kB apart. `bundled.js` is terser with
property mangling (`rollup.config.js` of the package). The esbuild figure is the one that counts against the
repository's ceilings.

What B could remove, from the metafile of the real entries (bytes in output):

- webview: Badge 313, IconButton 434, ProgressBar 422, Spinner 139, Tabs 1,226, Toolbar 1,287, icons 5,925 = **9,746**;
- sidebar: Badge, IconButton, ProgressBar and Spinner, plus icons 4,832 = **6,140**.

All 21 primitives together weigh 23,191 bytes (webview) and 19,665 (sidebar), 4.2 % and 5.9 % of the bundles.

**Net B ≈ +113.7 kB on webview (ceiling crossed by about 85 kB) and +45.8 kB on sidebar (crossed by about 28 kB).**
A crossing is a stop-and-ask with a metafile ruling (`esbuild.mjs:19-23`), not a technical block. It is a cost row:
an owner ruling plus a reset.

Option C, measured: the 23 named codicons swapped in memory for the current `microsoft/vscode-codicons` drawings at
`5a6ad49` (2026-10-20) give webview **555,146 (+6,203)** and sidebar **336,086 (+2,834)**. Both stay under their
ceilings, with 22,620 and 15,159 bytes left (`measure/bundle-icons.mjs`). The paths are unoptimized, so an svgo pass
at 2-decimal precision would shrink them (not measured).

### 2.9 Effect on the tests

jsdom probe (`node jsdom-probe.cjs`, using the repository's jsdom 30.1.2 and `@testing-library/dom` 10.4.2):

```text
setFormValue: undefined   setFormValueCall: throws TypeError   setValidity: undefined   states: undefined
showPopover: undefined    ShadowRoot.adoptedStyleSheets: false  Element.role reflection: works
queryAllByRole(body,'checkbox') with the checkbox in a shadow root → 0
queryAllByRole(body,'progressbar') in a shadow root → 0
queryAllByRole(body,'tab',{name}) on a host with role → 1
```

- `vscode-button.js:114-116` calls `this._internals.setFormValue(this.value)` in `update()`, and so do the checkbox,
  single-select, textfield, textarea and radio (12 call sites). Every form-associated element therefore throws in
  the frontend project unless `src/test/setup-frontend.ts` installs stubs or a polyfill. Which polyfill works is
  **not verified**. Opening a `vscode-single-select` calls `showPopover()` (`vscode-select-base.js:208`), so it
  needs a stub too.
- Role queries by class, counted by a node script over the 59 test files (53 `.tsx`):

| Role | Files | Queries | Under B |
|---|---|---|---|
| button | 32 | 136 | survives for `vscode-button` (host `role="button"`, `vscode-button.js:55`); lost for `vscode-toolbar-button` and `vscode-icon action-icon` (inner shadow `<button>`) |
| checkbox | 6 | 32 | lost: `<input type=checkbox>` inside the shadow root (`vscode-checkbox.js` render) |
| progressbar | 3 | 12 | lost: `role="progressbar"` inside the shadow root (`vscode-progress-bar.js` render) |
| textbox | 3 | 7 | lost: `<input>` inside the shadow root (`vscode-textfield.js` render) |
| combobox | 1 | 2 | lost: `role="combobox"` inside the shadow root (`vscode-single-select.js:278,306`) |
| tab / tabpanel | 2 / 3 | 14 / 6 | survive (host roles, `vscode-tab-header.js:32`, `vscode-tab-panel.js:28`) |
| option, listbox, dialog, alertdialog, separator, status, heading, region, alert | — | 91, 38, 24, 12, 10, 9, 13, 8, 6 | unaffected (primitives stay) |

  **33 files and 189 queries** hold a role that could move into a shadow root. Other counts: 9 native
  `select`/`option` queries, and 81 `user.type`/`fireEvent.change` calls whose targets would move into a shadow root
  for text fields. Class-name selectors: 98 `.nuiget-*` occurrences in 15 test files, mostly on primitives that stay.
- ExTester (`src/test/ui/v2`, 1,738 lines): 25 `By.css`/`By.xpath` selectors touch controls.
  `option[value="${ALL_PROJECTS}"]` (`main-all-projects.ui.test.ts:78`) and `By.css('option')` (`mainWebview.ts:64`)
  assume a native `<select>`. `main-search.ui.test.ts:26-110` types into the search box. `getShadowRoot` is used
  nowhere (`grep` empty). `theme.ui.test.ts` runs axe in six themes, and axe reads open shadow roots, but any new
  `incomplete` outside the details pane fails it (`theme.ui.test.ts:164-167`).
- Hypothesis, not verified: `LabelledCheckboxOrRadio` puts `aria-label` on a host without a role
  (`includes/form-button-widget/LabelledCheckboxOrRadio.js:19,28`). Axe may report it under
  `aria-prohibited-attr`, which every component test would catch.

## 3. The workbench's design system is now in the webview

- **What VS Code sends.** `themeing.ts:72-90` (microsoft/vscode main) exports every registered size as
  `--vscode-<id with dots as dashes>`. The registry, `src/vs/platform/theme/common/sizes/baseSizes.ts`, holds:
  - font sizes `fontSize.heading1/2/3` 26/18/13, `body1/body2` 13/11, `label1/2/3` 12/11/10;
  - font weights `fontWeight.regular/semiBold` 400/600;
  - codicon sizes `codiconFontSize` 16 and `.compact` 12;
  - corner radii `cornerRadius.xSmall/small/medium/large/xLarge/circle` 2/4/6/8/12/9999;
  - `strokeThickness` 1;
  - the spacing ramp `spacing.sizeNone…size400`: 0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40.
- **History.** The registry was added 2025-12-16 (`e42fd56`) and the webview export 2026-02-04 (`63cc68e`). It enters the release line at **1.110** (tested on tag `1.110.1`; tag `1.110.0` is absent from the API): `gh api repos/microsoft/vscode/compare/63cc68e...1.110.1` → `ahead`;
  `…1.109.0` → `diverged`.
- **The workbench's own rules** (`.github/instructions/design-tokens.instructions.md`, last change 2026-09-09):
  - use the token, or an on-scale literal: "What breaks visual rhythm is an off-scale value";
  - radius 4 is for "controls (buttons, inputs)";
  - "Codicons are only ever 16px or 12px";
  - one stroke, 1 px;
  - `bodyFontSize*` is deprecated in favour of `fontSize.*`.
- **Not public API.** The variables are absent from the public webview docs as far as a search shows (WebSearch
  returned only mirrors of the VS Code repository's own skills). Names have changed once already (`bodyFontSize*`
  deprecated). Hosts below 1.110, the 1.85 floor included, do not set them, so every alias needs a literal fallback.
  `tokens.css` is the one file where px literals are allowed (`webview-stylesheets.test.ts`).
- **Where the repository stands:**

| Token | `tokens.css` | Workbench ramp |
|---|---|---|
| spacing | 2, 4, 6, 8, 12, 16 + hairline 1 (`:14-21`) | a subset of the ramp, without 10/20/24 |
| radius | `sm` 2, `md` 4 (`:26-27`) | controls use 4 (`cornerRadius.small`) |
| font size | 0.85 em / 1 em / 1.15 em (`:60-62`) | 12/11/10/13/18 px roles |
| codicon size | 12/16/24/32 (`:36-39`; 32 is the package icon, not a codicon) | 16/12 |

  `grep -rn -- "--vscode-cornerRadius\|--vscode-spacing\|--vscode-fontSize" src/webview` → 0.
- **What this means for V5.** V5 ("the spacing … follows no single scale") has an external referee now: the
  workbench ramp. Option C uses it, and option B adds a second, partly off-ramp system inside shadow roots (§2.6).

## 4. Icons

- **Old drawings.** `icons.tsx` holds 26 icons, 23 of them named codicons, all as **2020 drawings**. Example: the
  chevron-right path `M5.7 13.7L5 13l4.6-4.6L5 3.7l.7-.7 5.3 5.3-5.3 5.4z` (`icons.tsx:30`). The current
  `src/icons/chevron-right.svg` is a different, rounded path (`gh api …/vscode-codicons/contents/src/icons/chevron-right.svg`).
- **When the workbench changed.** The codicons were refreshed on 2025-10-07 ("codicon refresh - iteration 1",
  `9d6c6e5`) and again on 2026-02-02 (`ea857bf`). The refresh enters the release line at **1.106**:
  `compare/38f8842…1.106.0` → `ahead`; `…1.105.1` → `diverged`.
- **The captures run on VS Code 1.140.0, not a 1.105-era build.** The UI job log of run 39025149785 says
  "WARNING: You are using the outdated VS Code version '1.140.0'" (`gh run view 39025149785 --job 117375049808 --log`).
  ExTester 8.28.1 declares `vscode-max` 1.140.0 (`node_modules/vscode-extension-tester/package.json`).
- **Visible side by side** (crops in `scratchpad/crops/`):
  - `webview-gear-refresh-x4.png`: the webview gear (old eight-lobed outline) next to its sync icon;
  - `workbench-gear-x4.png`: the activity bar's gear (refreshed six-tooth glyph);
  - `sidebar-titlebar-x4.png`: the view title bar in refreshed codicons, above webview rows in old ones.
- **Two ways to refresh:**
  - **Inline SVG, recommended.** Regenerate `icons.tsx` from a pinned `@vscode/codicons` by a script, plus a lint
    that compares each path with the pinned SVG. It keeps tree-shaking (`webview-icons-pure.test.ts`), has no CSP
    or VSIX change, and is SVG rather than text (no axe text checks). Cost: +6,203 / +2,834 bytes (§2.8). One
    detail: the new `settings-gear` has `viewBox="0 0 24 24"`, so the viewBox must come from the SVG.
  - **The font**, the workbench's own mechanism. `codicon.ttf` 149,508 + `codicon.css` 38,876 bytes, glyphs through
    `.codicon-x:before { content: "\ea60" }` (`codicon.css:60`, 746 `content:` rules). `font-src ${cspSource}`
    already admits it (ADR-006). It adds a second icon path and non-`nuiget-` class names, which conflict with the
    class-prefix lint (`webview-stylesheets.test.ts:105-106`) if any repository stylesheet targets them. Because
    the glyph is `::before` content rather than a DOM text node, axe's private-use check (`getUnicodeNonBmpRegExp`
    with `-`, axe-core 4.12.1) should not see it. **Not verified by an axe run.**
- **No version matches every host.** A webview cannot use the workbench's font: the workbench does not export it.
  `icons.tsx:3` says "Codicon fonts are NOT available in webviews", which is inaccurate: a bundled copy is admitted
  by `font-src`. So any shipped set matches only some hosts. Refreshed glyphs match 1.106+, and hosts from 1.85 to
  1.105 see the reverse mismatch.
- **License.** `icons.tsx:6` says "SVG paths sourced from VS Code codicon set (MIT license)". The codicons
  repository licenses its content under **CC-BY-4.0** and only its code under MIT ("license to the Microsoft
  documentation and other content … under the Creative Commons Attribution 4.0 … any code … under the MIT
  License", README of microsoft/vscode-codicons, lines 97-100; `gh api repos/microsoft/vscode-codicons` →
  `"license":"CC-BY-4.0"`). `grep -i codicon\|CC-BY\|attribution LICENSE README.md` → nothing. CC-BY requires
  attribution. The VSIX can carry it only in `LICENSE`, `README.md` or `CHANGELOG.md`, unless `ALLOWED_PATTERNS`
  grows (`check-vsix-contents.mjs:10-18`). This applies under every option, since the 2.0.0 VSIX already ships the
  drawings. It is a legal question for the owner, not verified with counsel.

## 5. Options, costed

### 5.1 Decision table

| Option | What changes | One-time (session-days) | Ongoing | Risk | What it buys visually |
|---|---|---|---|---|---|
| **A. Status quo + V1–V5 fixes** | page CSS only | 2–3 | low | low | V1–V5 fixed; icons stay 2020; radius 2, 24 px controls, em type stay off-workbench |
| **B. Partial `@vscode-elements` (leaf controls)** | +Lit runtime beside React; 42 native control sites and the Badge/Tabs/ProgressBar/Toolbar internals move to elements; codicon font + host link; jsdom stubs; tests; lints; ADR-006/008; docs | **8–11**, + rulings: ceilings (+113.7 kB / +45.8 kB), ADR amendments (frozen `docs/adr/**`, sentinel) | medium-high: rescan CSS vs 114 per bump, check stubs, review pixels; single maintainer; upstream lags workbench (button); Dependabot auto-merges minor bumps unseen (`.github/dependabot.yml:24-30`, `dependabot-auto-merge.yml:34-36`) | medium-high: 114 not declared; a11y conflicts (§2.3, §2.4); two styling systems; 154 literal colour fallbacks outside the lint | custom-drawn select list (the one gain CSS cannot reach on Chromium 114: `appearance: base-select` is Chrome 135, MDN BCD `css.properties.appearance.base-select`); 2025-era control metrics; tab look. V2–V5 untouched; lists, rows, section headers, details pane unchanged |
| **C. Keep primitives + current codicons + CSS on workbench tokens** | `icons.tsx` regenerated (pinned, scripted, linted, attributed); `tokens.css` aliases `--vscode-spacing-*`, `--vscode-cornerRadius-*`, `--vscode-fontSize-*`, `--vscode-fontWeight-*`, `--vscode-codiconFontSize*`, `--vscode-strokeThickness` with fallbacks; controls restyled to workbench metrics; V1–V5 laid out on the ramp | **4–5.5** (+1.5–2 for an optional Select on `Popover`) | low: rerun the icon script when codicons redraw (no Dependabot drift, no runtime dependency); sizes follow the host from 1.110 | low-medium: size variables are internal workbench names (fallbacks keep rendering); hosts 1.85–1.105 see new glyphs beside old workbench icons | current glyphs; 4 px control radius; 12 px button/label type; 18 px checkbox with the codicon check; badge as `countBadge.css`; one spacing ramp shared with the workbench; V1–V5 fixed against it |

### 5.2 Option B, item by item

| Item | Work | Count basis | Days |
|---|---|---|---|
| B1 Platform | dependency + JSX typing or `react-elements`; `codicon.css`/`.ttf` under `resources/`; `<link id="vscode-codicon-stylesheet">` in `renderWebviewHtml`; `handlers.test.ts` update; ceiling measurement and stop-and-ask | `services.ts:103-133`, `esbuild.mjs:19-24` | 1.0 + ruling |
| B2 Harness | `setup-frontend.ts` stubs for `setFormValue`, `setValidity`, `states`, `showPopover`; shadow-aware query helper; axe over shadow roots | probe §2.9; 12 `setFormValue` call sites | 1.0–1.5 |
| B3 Product | 42 native control sites (27 button, 11 input, 4 select) + internals of Badge (23 uses), Tabs (2), ProgressBar (4), Toolbar (3), with props kept | §2.3 | 3.0–4.0 |
| B4 Tests | 33 files / 189 role queries, 9 select/option queries, 81 type/change calls; ExTester `option[value]` ×2, search typing, theme axe | §2.9 | 2.0–3.0 |
| B5 Guards | run the denylist over Lit CSS in CI; pin and take the package out of the auto-merge group | §2.2, `dependabot.yml:24-30` | 0.5–1.0 |
| B6 A11y | do not use progress ring, collapsible, split layout or toolbar button in rows | §2.3, §2.4 | 0.5 |
| Fork: `vscode-checkbox` | if axe reports the host `aria-label` without a role (§2.9 hypothesis) under the mandatory per-component axe assertion, either wrap it and add a host role (changing upstream semantics: +0.5–1.0) or leave the 6 check boxes native (B3 −0.5, B4 −0.5: the 32 checkbox queries survive) | §2.9 | −1.0 to +1.0 |
| B7 Docs | ADR-006 (constructable sheets, codicon link), ADR-008 (primitive list), ARCHITECTURE primitives section, gotchas, interaction model §8 | — | 0.5–1.0 |
| **Total** | | | **8.0–12.0** before the checkbox fork, quoted as 8–11 with B3/B4 overlap; the fork moves it by about one day either way |

### 5.3 Option C, item by item

| Item | Work | Count basis | Days |
|---|---|---|---|
| C1 Icons | `scripts/sync-codicons.mjs` (pinned `@vscode/codicons` as a devDependency, or vendored SVGs) regenerates the 23 codicon icons with each SVG's viewBox; lint compares paths; CC-BY attribution line; `icons.tsx` header corrected | §4; +6,203 / +2,834 bytes measured | 1.0 |
| C2 Tokens | `tokens.css` aliases the workbench size tokens with fallbacks; `webview-tokens.test.ts` names; spacing lint unchanged | §3 | 0.5–1.0 |
| C3 Controls | button (12 px, `4px 8px`, radius 4), input (radius 4, `4px 6px`), checkbox (18 px, radius 3, codicon check), badge (`countBadge.css`), tabs (label1 12 px), select chrome | workbench CSS §2.6; repository `primitives.css:507-511`, `main.css:31-41,55-80,662-670` | 1.0–1.5 |
| C4 Layout | V1–V5 on the ramp; capture review (D18) | owner rows V1–V5 | 1.5–2.0 |
| C5 (optional) | own `Select` on the existing (unused) `Popover`/`layers` for a workbench-style dropdown list | `Popover.tsx` 172 lines, 0 product uses | 1.5–2.0 |
| **Total** | | | **4.0–5.5** (+1.5–2.0) |

### 5.4 V1–V5 under each option

| Row | A | B | C |
|---|---|---|---|
| V1 tab bar and bulk toolbar squeezed | CSS | partly, through `vscode-tabs`/`vscode-toolbar-container` look | CSS on the ramp, label1 type |
| V2 "Select all"/"Uninstall selected" misaligned | CSS | untouched (page layout) | CSS on the ramp |
| V3 "provisional" badge over the list border | CSS | untouched (All Projects header layout) | CSS |
| V4 section header margins | CSS | untouched (`SectionHeader` stays) | CSS on the ramp |
| V5 no single spacing scale | CSS, own scale | worse: a second, partly off-ramp scale inside shadow roots (51/116 off-ramp) | CSS on the workbench ramp, the external referee |

## 6. Recommendation and reasoning

**Option C.** The owner's direction is "native-feeling polish … the exemplar for every rule is the workbench itself …
where no rule decides, the alternative closest to the workbench wins". The workbench now publishes its own rules to
webviews: the size ramp (§3) and the current glyphs (§4). Option C adopts both at about half of B's one-time cost,
with low ongoing cost, inside both bundle ceilings, without touching the CSP, the test harness or the frozen ADRs.

Option B buys a 2025-era snapshot of a dozen leaf controls. It cannot replace any part of the list, row, section and
split machinery that carries V1–V5. It costs about 8–11 session-days plus two owner rulings, and it brings an
undeclared Chromium-114 dependency, a single-maintainer upstream, a second styling system out of reach of the lints,
and four accessibility conflicts that the repository's axe gates would have to work around.

**B's ongoing cost is not merely medium. It is unbounded unless the package is pinned exactly and taken out of the
auto-merge group.** `.github/dependabot.yml:24-30` groups every npm minor and patch, and
`.github/workflows/dependabot-auto-merge.yml:34-36` merges a green pull request by itself. No CI job renders
Chromium 114 (N64), and no CI job compares pixels. A `2.5.1 → 2.6.0` bump would therefore land new CSS, metrics
and DOM in `main` with no human look and no 114 check. Pinning and excluding the package is an owner change to
`.github/`, which sessions cannot make. This argument does not depend on any estimate in this report. Option C has
no runtime dependency to drift: the icons are a pinned, script-generated copy, and the size tokens come from the
host.

What would change this:

- **The owner wants the custom-drawn dropdown list.** The workbench draws one on Windows and Linux, and macOS uses
  the native select (`selectBox.ts:106`). C5 builds one on the existing `Popover` for 1.5–2 days, still cheaper than B.
- **`@vscode-elements` ships a virtualized listbox and declares Chromium 114.** That would need a listbox whose row
  actions live outside the option, a declared 114 support, and use of the `--vscode-*` size tokens. Re-evaluate then.
- **The owner raises the D10 floor** above 1.85, so that the sizes and glyphs are guaranteed on every host. Option C
  only gets simpler.

## 7. Findings (ledger candidates)

| Letter | Severity | Decision-relevant | Claim |
|---|---|---|---|
| H | high | yes | Recommendation: option C (keep primitives, current codicons inline, CSS on workbench size tokens), 4–5.5 sd and low ongoing cost; reject B (8–11 sd + rulings, medium-high ongoing) |
| H | high | yes | `@vscode-elements` has no listbox/option and no virtualization; tree-item actions sit inside the treeitem; toolbar/icon buttons render inner shadow buttons that cannot take `tabIndex -1`. Listbox, Row and IconButton stay under every option, so B is partial |
| H | high | yes | B adds 123,471 / 51,954 bytes (measured, chrome114 esbuild) against 28,823 / 17,993 headroom, net about +113.7 kB / +45.8 kB, crossing both ceilings |
| H | high | yes | jsdom 30.1.2 lacks `setFormValue`, `setValidity`, `states` and `showPopover`; the elements call `setFormValue` in `update()`; RTL finds 0 shadow-root controls; 33 test files / 189 queries affected |
| H | medium | yes | Neither Lit nor the package declares Chromium 114; it builds and runs by inspection only (`scrollbar-width` 121 in `vscode-scrollable`, popover at exactly 114); the repository lint does not scan package CSS |
| X | medium | yes | Elements conflict with the repository's a11y contract: progress ring `role=alert` assertive per instance, collapsible header without role/`aria-expanded` and with nested actions, split layout without role/keys |
| H | high | yes | VS Code exports its design-system size ramp (spacing, radius, font, codicon, stroke) to webviews since 1.110; neither the repository nor the package uses it; it is the external referee for V5 |
| H | medium | yes | Webview icon paths are the 2020 codicon drawings (`icons.tsx:30` vs current `src/icons/*.svg`); the refresh enters VS Code at 1.106; refreshing costs +6,203 / +2,834 bytes (measured) |
| V | low | no | In the 1.140.0 captures the webview gear and the workbench gear are different drawings side by side (crops; judge-only) |
| H | medium | yes | `icons.tsx` labels the codicon paths MIT; codicon content is CC-BY-4.0 and the VSIX carries no attribution (all options) |
| H | medium | yes | The P9 captures ran on VS Code 1.140.0 (UI job log), not a 1.105-era build. "Native" in those PNGs is therefore 1.140's native: refreshed codicons, and the size tokens are exported. The harness and the V1–V5 negative control measure against that host, not against 1.105 |
| V | medium | yes | The repository's controls differ from current workbench metrics: button 24 px / `0 12px` / radius 2 vs 26 px / `4px 8px` / radius 4 / 12 px; checkbox 16 px radius 2 vs 18 px radius 3; input radius 2 vs 4 |
| V | medium | no | The package's metrics are a snapshot that lags the workbench (button 13 px / `1px 13px` vs 12 px / `4px 8px` since 2026-01-14); 51/116 spacing lengths off the ramp; 154 literal colour fallbacks; no forced-colors rules |
| H | high | yes | Under B, Dependabot's minor-and-patch group auto-merges green bumps of the package with no pixel review and no Chromium-114 render; only an owner change to `.github/` (exact pin + exclusion) bounds it. Upstream has one maintainer (1,871 of about 2,040 contributions), last release 2026-02-22, a11y tests issue still open |
| H | low | no | CSP: Lit's constructable sheets are outside `style-src` (WICG #98); `stylePropertyMap` uses the CSSOM; `vscode-icon` needs a document `<link id="vscode-codicon-stylesheet">`, a host change; policy string unchanged. Not verified on Chromium 114 |
| H | low | no | `Popover` is exported but has 0 product uses; it is the base for an optional own Select (C5) |
| H | low | no | `icons.tsx:3` claims codicon fonts are unavailable in webviews; a bundled copy is admitted by `font-src` (ADR-006) |

## 8. Not reachable, and gaps

Not reachable:

- `https://lit.dev/docs/browser-support/` → HTTP 404 (the requirements page was used instead).
- MDN BCD `html/global_attributes/popover.json` → HTTP 404 (`api/HTMLElement.json` was used instead).
- bundlephobia API for `@vscode-elements/elements` and `@tanstack/react-virtual` → HTTP 429 (replaced by local
  esbuild measurement).
- No browser run: the browser pane is reserved. The CSP behaviour of constructable sheets on Chromium 114 and the
  axe outcome of a shadow-root checkbox or label are therefore source-derived, not executed.
- `vscode-elements.github.io` pages carry no CSP or browser-support statement (the getting-started and icon pages
  were fetched).

Gaps:

- No element was rendered in VS Code. The "what it buys visually" column comes from CSS metrics and source, not from
  screenshots of elements in the panel.
- No polyfill was trialled for ElementInternals in jsdom, and React 19 boolean-property behaviour on these elements
  was not tested.
- The size-token values the overhaul should pick per state, and the exact V1–V5 layout fixes, are for the visual and
  measurement dimensions.
- I did not check whether the size variables survive the VS Code versions between 1.110 and 1.140. The source was
  read on `main` only, and the capture build is 1.140.0.
- The session-day estimates are arithmetic over counted sites at the plan's item granularity. They were not
  dry-run by an implementer.
- The CC-BY attribution requirement is stated from the license text and not verified with counsel.

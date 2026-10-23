# ADR-011: Follow the host's look; size tokens alias VS Code's exported tokens

Status: accepted · Date: 2026-10-23 · Amends: ADR-008 (its typography bullet: type moves from `em` to px) and ADR-000
(its floor sentence: `engines.vscode` is raised from `^1.85.0` to `^1.90.0` by the owner's round-2 pick of
2026-10-23; a P0 item edits ADR-000 under the D6 sentinel).

## Context

The overhaul's direction is native-feeling polish: the panel and the sidebar should read as built-in views, and the
workbench is the exemplar for every rule. The research of 2026-10-23 (`docs/research/2026-10-23-ux-research.md`, §3,
§16 and Appendices E and F) found that the workbench now has two looks:

- **Modern UI** (`workbench.experimental.modernUI`) is the compiled default of every stable VS Code from 1.139
  (`default: true` with `experiment: { mode: 'auto' }`, so an experiment may assign it off for a user); classic stays
  available through the setting. It toggles `modern-ui*` classes on `.monaco-workbench`, never in a webview: no
  signal of it reaches a webview, whose `body` carries only the theme-kind class.
- Measured on 1.142.0 in both looks, the differences are few: the pane header is 22 px with an 11 px bold uppercase
  title in classic and 28 px with a 12 px semibold title in the host's casing under Modern UI (uppercase again with
  `workbench.experimental.modernUIUppercaseViewHeaders`), with a hover tint; list rows get a 4 px radius and a 4 px
  inset (2 px under `window.density.layout: compact`); part titles go from 35 to 32 px; scrollbars from 10 to 8 px;
  the count badge to 10 px; focus rings show for keyboard focus only. Extensions rows (72 px), tree rows (22 px),
  buttons (26 px, 12 px label, radius 4), inputs, check boxes, codicons, the exported size-token values and the theme
  colours are the same in both.
- ExTester writes `workbench.experimental.modernUI: false` and disables experiments, so every capture so far, CI or
  local, is classic.
- VS Code exports its size tokens to webviews: `--vscode-cornerRadius-*`, `--vscode-bodyFontSize*`,
  `--vscode-codiconFontSize` and `--vscode-strokeThickness` first ship in 1.110.1; `--vscode-spacing-size*` in
  1.124.0; `--vscode-fontSize-*` and `--vscode-fontWeight-*` in 1.129.0. VS Code 1.85 and 1.90 export none. The values
  are constants (identical in all six probed themes and in both looks); no line-height token exists;
  `--vscode-font-size` is fixed at 13 px.
- `tokens.css` today holds literal spacing (2 to 16 px) and radii (2, 4), `em` typography that compounds (a count
  badge renders at 9.4 px in a sidebar header, V17), 24 px compact and 78 px comfortable rows, 10 px scrollbars that
  VS Code's own `html { scrollbar-color }` disables on every host from Chromium 121 (V15), and lacks the colour roles
  the workbench uses (the research's colour-role table).
- The floor analysis found no technique the design needs that Chromium 114, Node 18.15 or the 1.85 API blocks without
  a correct fallback, and named 1.90.0 (Electron 29, Chromium 122, Node 20.9) as the option if one Chromium generation
  is wanted: the lowest release with both Chromium 121 or later and Node 20. The owner took that option in round 2
  (D-F). Hosts 1.85 to 1.89 stay on the last release that supports them.
- The owner's round-1 picks fixed the row anatomy: the Extensions row (72 px, two lines, a 36 px icon, actions inside
  the band) in the main panel and 22 px compact rows in the sidebar.

## Decision

1. **Follow the host.** The webviews match whichever look the host shows: Modern UI first (the default the design is
   drawn in), classic as the fallback, both supported. Closest-to-the-workbench is satisfiable only this way.
2. **The look reaches the webview as attributes on the document element** (`<html>`), so that dialogs and popovers
   portalled to `body` inherit it:
   - `data-look`: `modern` when `workbench.experimental.modernUI` is true, otherwise `classic`;
   - `data-density`: `compact` or `default`, from `window.density.layout`;
   - `data-uppercase-headers`: present when `workbench.experimental.modernUIUppercaseViewHeaders` is true (it
     matters under Modern UI only).

   The host reads the three keys as it reads `workbench.tree.indent`, and writes the attributes into the page in
   `renderWebviewHtml`, so the first paint is right without a contract change. Live changes reach an open webview
   through `config/changed`: `ExtensionConfig` gains the three values in the UX plan's contract item (sentinel
   procedure, regenerated `docs/protocol.md`), and each entry writes them onto the document element. Until that item
   lands, or if it is cut, an open webview shows a changed look at its next render.
3. **Only the metrics that differ switch, and they switch as tokens.** `tokens.css` re-values a small set of look
   tokens under `:root[data-look="modern"]` and the density and uppercase attributes; no primitive declares a second
   rule per look (ADR-010, single owner). The switched set is exactly what the probe found different: the pane-style
   section header's height (22 → 28 px) and title type (11 px, 700, uppercase → 12 px, 600, the host's casing); the
   pane header's hover tint; the row corner radius (0 → 4 px) and row inset (0 → 4 px, 2 px under compact density);
   the tab strip, which plays the part title's role (35 → 32 px); the scrollbar thickness (10 → 8 px); the count
   badge type (11 → 10 px); and the focus ring after a pointer press (classic draws the list outline after a click,
   Modern UI only for keyboard focus). The numbers live in the Design System (`docs/design/design-system.md`), bound
   to the probe.
4. **Size tokens alias VS Code's exported tokens, with literal fallbacks.** A size token with a VS Code counterpart
   takes the form `var(--vscode-<id>, <value>)`, the fallback being the exported value (which is also the classic
   value): spacing `var(--vscode-spacing-size160, 16px)`, radius `var(--vscode-cornerRadius-small, 4px)`, type
   `var(--vscode-fontSize-body1, 13px)`, weight `var(--vscode-fontWeight-semiBold, 600)`, codicon size
   `var(--vscode-codiconFontSize, 16px)`, line width `var(--vscode-strokeThickness, 1px)`. The fallbacks carry every
   host below 1.129.0, the 1.90 floor included, which exports no size token either. Tokens without a counterpart stay
   literal: the row heights (72 px comfortable, the Extensions row, and 22 px compact, the owner's round-1 picks), the
   pane-header heights (22 and 28 px), the 1.4 line height and the 24 px pointer target.
5. **Type in px.** Font sizes are px tokens on VS Code's ramp (10, 11, 12, 13, 18 and 26 px, aliasing
   `--vscode-fontSize-*`); weights are 400 and 600, and 700 only on classic pane headers. No `em` font size remains,
   and no relative size sits on an element that contains another sized element (V17). This replaces ADR-008's
   "`em`-based typography on `--vscode-font-size`"; the rest of ADR-008 stands.
6. **The floor is `^1.90.0`** (Electron 29, Chromium 122, Node 20.9), the owner's round-2 pick. It amends ADR-000's
   floor sentence; ADR-000's other decisions stand. With Chromium 122 the scrollbars are 10 px token scrollbars
   (8 px under Modern UI, Decision 3): the `::-webkit-scrollbar` rules give the thickness and the token colours, and
   a `scrollbar-color` declaration beside them on the scrolling elements stops the value VS Code's default stylesheet
   sets on `html` from switching those rules off (V15). The CSS-baseline lint admits `scrollbar-color` because its
   threshold is 122; no progressive-enhancement allowlist is needed. The UI job measures the scrollbar's thickness
   and colour once in the item that lands it; if the host's stylesheet still wins, V15 is recorded as a host
   limitation.
7. **Colour roles.** `tokens.css` gains, as aliases, the roles the rules need and it lacks: `disabledForeground`,
   `textLink.activeForeground`, `icon.foreground`, `toolbar.hoverBackground`, `toolbar.activeBackground`,
   `list.focusOutline`, `list.inactiveSelectionForeground`, `list.activeSelectionIconForeground`,
   `panelTitle.activeForeground`, `panelTitle.inactiveForeground`, `panelTitle.activeBorder`,
   `button.secondaryHoverBackground`, `extensionIcon.verifiedForeground`, `checkbox.selectBackground` and
   `checkbox.selectBorder` (every key exists at 1.85, so at the floor). With them:
   - selection follows list focus (the active selection colours while the list has focus, the inactive ones
     otherwise); hover never paints over selection; `focusBorder` marks focus only, so no accent bar and no tab
     underline borrows it; tabs take `panelTitle.*`; icon buttons hover with `toolbar.hoverBackground`; one divider
     role per surface;
   - **the row check mark (D52)** is the workbench's 18 px check box, in the `checkbox.*` colours at rest and in
     `checkbox.selectBackground` and `checkbox.selectBorder` on a selected row, as the workbench draws a check box
     inside a selected list row;
   - **disabled controls (D51, DS-COLOR-6)**: a disabled text button is drawn at opacity 0.4, as the workbench's text
     button is; a disabled action label or icon button takes `disabledForeground` at full opacity.
8. **Reduced motion follows the host too.** The duration tokens go to zero under `body.vscode-reduce-motion`
   (VS Code's own signal, set since 1.68) as well as under `prefers-reduced-motion: reduce` (A4).

## Consequences

- The floor raise is one P0 item of about a session-day, mechanical, with the D6 sentinel for ADR-000:
  `package.json` `engines.vscode` `^1.90.0` and `@types/vscode` pinned to `1.90.0` (`check:vsix` enforces that it is
  not newer than the engine); `esbuild.mjs` targets `node20` and `chrome122`, and the three bundle ceilings are
  re-measured; the host's Node declarations move from `@types/node` 18 to 20 (the `@types-host/node` alias,
  `npm:@types/node@20.9.5`, and the `tsconfig.json` comment); the E2E matrix's minimum moves from `1.85.0` to
  `1.90.0`; `webview-css-baseline.test.ts` raises its threshold from 114 to 122 and retires the 16 of its 26 denylist
  entries at or below 122 (its own test requires every entry to be newer than the threshold); ADR-000 gains the
  amendment and the "Extension-host baseline" decision (D10) is restated for 1.90. Users on VS Code 1.85 to 1.89 are
  offered the last release that supports their host.
- `webview-tokens.test.ts` learns the new selectors (`:root[data-look="modern"]`, the density and uppercase variants,
  `body.vscode-reduce-motion`) and the alias form: a size token with a VS Code counterpart must use it. Its list of
  required token names changes with the `em` type tokens it replaces and the colour roles of Decision 7.
- The scrollbar pins of `webview-stylesheets.test.ts` change with Decision 6.
- The harness writes the look explicitly in `src/test/ui/settings.json` (ExTester spreads it last over its own
  defaults): `workbench.experimental.modernUI: true`, `window.density.layout: default` and
  `workbench.experimental.modernUIUppercaseViewHeaders: false` for the primary goldens, and one classic pass for the
  theme-sensitive subset. Every capture states its look. ExTester also sets `workbench.reduceMotion: on`, so once
  Decision 8 lands every capture is a reduced-motion capture; a motion capture sets the key itself.
- Pixels are identical to today wherever a token aliases a constant; the visible changes come from Decisions 3, 5, 6
  and 7 and are re-approved state by state against the artboards.
- `Listbox`'s `ROW_HEIGHT` and the row-height tokens stay literal and equal (ADR-010); both change to 72 and 22 px in
  the items that build the new rows. The pane header's 28 px under Modern UI is a look token, not a second row height.
- The live switch depends on the contract item; without it a user who flips Modern UI sees the old look until the
  panel is reopened or the window reloads. The webview never shows a mixed state, because every switched metric
  reads the same attribute.
- ADR-008's header records this amendment, and ADR-000's header the floor amendment, each under the sentinel. If
  VS Code later exports a look signal to webviews, this record is revisited. A further raise (1.110.1, 1.124.0 or
  1.129.0) would only delete token fallbacks and needs its own record.

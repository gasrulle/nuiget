# VS Code "Modern UI": what it is, how it rolls out, what nUIget should target

Verification of the design-rules and component-base claims (H1, H6, H24, V9, V36, DS-GRID-3, DS-HEIGHT-1,
DS-TYPE-5, DS-DENSITY-2) against primary sources · 2026-10-23 · repository `main` at `e4d6e97`, read-only.

Short names: `VSC@main` = local byte-for-byte copies under `research/vscode-src/` of microsoft/vscode `main`
(`package.json` 1.144.0); `wc-1.1NN.ts` = `src/vs/workbench/browser/workbench.contribution.ts` of `release/1.1NN`;
tag fetches are `gh api -H 'Accept: application/vnd.github.raw+json' repos/microsoft/vscode/contents/<path>?ref=<tag>`;
`BIN` = the VS Code 1.142.0 ExTester downloaded for the probe, `/tmp/nuiget-ui/Visual Studio Code.app/Contents/Resources/app`
(`product.json`: `quality: stable`, `commit 6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1`, `date 2026-10-15T03:02:17Z`).

## 0. Answer first

1. **Modern UI is one setting, `workbench.experimental.modernUI`, that toggles the class `modern-ui` (plus
   `modern-ui-tabs`, `modern-ui-notifications-dialogs`, and conditionally `modern-ui-compact`,
   `modern-ui-uppercase-view-headers`, `modern-ui-connected-editor-tabs`) on the `.monaco-workbench` container, and
   three JS-side metrics: pane header 22 → 28 px, scrollbar 10 → 8 px, compact notification rows.** Fifteen CSS modules
   gated by `.modern-ui` then re-skin the chrome: pane headers (28 px, Label1 12 px/600, `capitalize` instead of
   `uppercase`, hover tint, 4 px radius, 4 px side margins), rounded corners (controls 4, inner 6, outer 8 px), padding
   (rows inset 4 px, part titles 32 px instead of 35), font ramp, keyboard-focus-only, floating panels with gaps, tabs,
   status bar, title bar, shadows, sash handles. Companion settings: `window.density.layout` (`default` | `compact`),
   `workbench.experimental.modernUIUppercaseViewHeaders`, `workbench.experimental.modernUIEditorTabStyle`
   (`connected` | `pill`), `workbench.modernUIFrostedGlass`(+`Opacity`). It changes **no codicon glyph or size** and
   **no exported token value**.
2. **Rollout:** experimental, default `false`, Insiders-on since 1.129 (release notes "Modern UI preview
   (Experimental)"); default flipped to `true` on `main` 2026-09-21 (`eaeb8d9be2`) with `experiment: { mode: 'auto' }`
   (`88f4cfe9f8`), one day before tag `1.139.0` (2026-09-22). **Every stable tag from 1.139.0 to 1.143.1 compiles
   `default: true`** (verified at tags 1.139.0, 1.140.0, 1.143.0, 1.143.1 and in the 1.142.0 binary). The VS Code blog of
   2026-10-15 ("Modernizing the VS Code UI") says it ran as a controlled Stable experiment for a subset of users and is
   now enabled by default with the classic UI available through the setting "during the transition". `mode: 'auto'`
   means the experiment service can still assign `false` to a user at any time; no public source states the current
   assignment, so "every stable 1.142/1.143 user sees it" is **not** verifiable; "a stable 1.142/1.143 user with
   experiments off, or with no assignment, sees Modern UI" **is** (code default).
3. **The exported `--vscode-*` size tokens are constants.** 33 keys (14 spacing, 6 cornerRadius, 8 fontSize, 2
   fontWeight, 2 codiconFontSize, 1 strokeThickness; plus 3 deprecated `bodyFontSize*` and a mirrored
   `--vscode-agents-*` set; **no `lineHeight` token exists**). They are registered with `sizeForAllThemes(n, 'px')`,
   resolved by `theme.type` only, and identical across the six probe themes. **Neither Modern UI nor
   `window.density.layout` changes a value**; Modern UI changes which rules *consume* them (`--pane-header-size` =
   `size280`, rows inset by `size40`, compact rows by `size20`). Aliasing them therefore does **not** make a webview
   "follow the host either way"; that part of V9/H6/DS-GRID-3 is false. Exported to webviews since `release/1.110`
   (commit `63cc68e088`, 2026-02-04; absent in `release/1.109`).
4. **Both captured hosts rendered classic chrome, for one reason: ExTester.** ExTester ≥ 8.27.0 writes
   `"workbench.experimental.modernUI": false` and `"workbench.enableExperiments": false` into the user `settings.json`
   it generates (`codeUtil.ts`, commit `4fc75b9bc8`, 2026-09-11; absent at `v8.26.0`, present at `v8.27.0`) and launches
   with `--disable-experiments --disable-telemetry`. The probe's generated file on this Mac carries the key; the CI run
   `39025149785` (head `c50d335`) locked ExTester 8.28.1. A user-level `false` beats the compiled default `true`. The
   probe measurements confirm classic: pane header **22 px**, title **11 px / 700 / uppercase**, part title **35 px**,
   list-row radius **0**; the screenshots show EXPLORER / E2E-WORKSPACE / OUTLINE / TIMELINE in caps and flush square
   panels on both 1.142.0 (Mac) and 1.140.0 (ubuntu). The probe's 12 px quick-input radius is **not** a Modern UI tell:
   `.quick-input-widget { border-radius: var(--vscode-cornerRadius-xLarge) }` is ungated in the 1.142.0 CSS.
5. **Recommendation: follow the host (GitLens pattern), with classic as the fallback**, because the workbench is the
   exemplar and the workbench itself now has two looks that the user picks: (a) alias spacing/radius/type tokens to the
   exported sizes with literal fallbacks (cheap, future-proofs the values, no behaviour change today); (b) mirror
   `workbench.experimental.modernUI`, `window.density.layout` and `modernUIUppercaseViewHeaders` from the host onto the
   webview root and switch the handful of metrics that differ (header 22/28, header type, row radius, row inset,
   scrollbar 10/8) under `[data-modern-ui]`. The webview gets no signal from VS Code (themeing.ts exports styles only;
   GitLens's own comment says the same), so the mirror is the extension's job: either `renderWebviewHtml`'s `dataset`
   (no contract change; refreshes only on re-render) or an `ExtensionConfig` field (frozen `src/protocol/domain.ts`,
   sentinel). **Harness consequence:** today's goldens pin classic *implicitly* through ExTester's default. The look is
   decided by one key in `src/test/ui/settings.json`, which ExTester spreads **last** over its defaults
   (`browser.js:146`); make it explicit, capture Modern UI as the primary goldens (the stable default look), and keep
   one classic pass. Every bound rule in `rules-bound.md` currently binds the **classic** side; the probe must be re-run
   with the key set to `true` before any M value can be bound.

## 1. What Modern UI is

### 1.1 Setting ids (`src/vs/workbench/services/layout/browser/layoutService.ts`, release/1.142 lines 54–59)

| Setting | Type / default | Registered where | Effect |
|---|---|---|---|
| `workbench.experimental.modernUI` | boolean, **`true`** since 1.139 (`false` ≤ 1.138), `experiment: { mode: 'auto' }` | `workbench.contribution.ts:834-839` (main, 1.139–1.143) | Master switch; see 1.2 |
| `window.density.layout` | `'default'` \| `'compact'`, default `'default'` | `workbench.contribution.ts:260-269` | Adds `modern-ui-compact`; "Applies in the Agents window and when modernUI is enabled" |
| `workbench.experimental.modernUIUppercaseViewHeaders` | boolean, `false`, tag `experimental` | `:840-845` | Adds `modern-ui-uppercase-view-headers`: restores `text-transform: uppercase` on view/part/composite headers |
| `workbench.experimental.modernUIEditorTabStyle` | `'connected'` \| `'pill'`, default `'connected'` (since 1.139) | main `:862-871`, 1.139 `:846-856` | Adds `connected-editor-tabs` |
| `workbench.modernUIFrostedGlass` / `…Opacity` | boolean `true` / 50–100 default 80 | main `:846-861`; migrated from `workbench.experimental.modernUIFrostedGlass*` (`:1033-1034`) | Blurred overlays (quick input, menus, hovers); desktop only, GPU-gated |

Migration: the older `workbench.experimental.floatingPanels` and `workbench.experimental.styleOverrides` are folded into
`modernUI` (`workbench.contribution.ts:1114-1135`).

### 1.2 Mechanism (`src/vs/workbench/contrib/modernUI/browser/modernUI.contribution.ts`)

- `isEnabled()` is `configurationService.getValue(LayoutSettings.MODERN_UI) === true` (release/1.142 lines 154–155);
  there is no quality, platform or telemetry gate.
- `applyTo(container, …)` toggles `modern-ui`, `modern-ui-compact`, `modern-ui-tabs`,
  `CONNECTED_EDITOR_TABS_CLASS` (= `'modern-ui-connected-editor-tabs'`, `src/vs/workbench/browser/parts/editor/editor.ts:32`
  at release/1.142), `modern-ui-notifications-dialogs`, `modern-ui-uppercase-view-headers` on every workbench
  container (the `.monaco-workbench` element of the main and auxiliary windows), never on `document.body` and never
  inside a webview.
- JS-side metrics (release/1.142 line numbers): `MODERN_UI_PANE_HEADER_SIZE = 28` (line 25; `paneview.css`
  `--pane-header-size: 22px` is the default), `MODERN_UI_SCROLLBAR_SIZE = 8` (line 22; `DEFAULT_SCROLLBAR_SIZE = 10`,
  `src/vs/base/browser/ui/scrollbar/scrollableElement.ts:27` at release/1.142), and `COMPACT_NOTIFICATION_ROW_HEIGHT`
  (value not read). `paneHeaders` is the one `layoutAffecting` module: toggling it relayouts the workbench
  (`layout()`), so the setting applies live without a reload.
- Module catalogue (lines 80–94, identical on main and release/1.142): `activityBar`, `commandCenter`, `editorBorder`,
  `fontRamp`, `keyboardFocusOnly`, `padding`, `paneHeaders`, `roundedCorners`, `sashHandles`, `scrollShadows`,
  `shadows`, `statusBar`, `tabs`, `titlebar`, `notificationsDialogs`. **No codicon module.**
- The stable 1.142.0 CSS carries all of it: 1 184 occurrences of `.modern-ui` in `BIN/out/vs/workbench/workbench.desktop.main.css`.

### 1.3 What changes, with the values (classic → Modern UI), read in `BIN`'s compiled CSS and `VSC@main` modules

| Surface | Classic (ungated rule) | Modern UI (`.modern-ui`-gated rule) | Source |
|---|---|---|---|
| Pane header height | `--pane-header-size: 22px` | `var(--vscode-spacing-size280, 28px)` | BIN css `.monaco-pane-view{…}` / `.modern-ui .monaco-pane-view{…}`; `paneHeaders.css:95` |
| Pane header title | 11 px / 700 / `uppercase` (`.monaco-pane-view .pane>.pane-header>.title{text-transform:uppercase}`) | `fontSize-label1` 12 px / `fontWeight-semiBold` 600 / `capitalize`; Explorer's workspace name keeps its own casing; uppercase only with `modernUIUppercaseViewHeaders` | BIN css; `fontRamp.css:56-60, 111-125, 146-152` |
| Pane header chrome | 1 px top border, no hover | `border: none`, inset separator `::before` (`size40` margins, `strokeThickness`), `cornerRadius-small` 4 px, hover `list.hoverBackground !important`, header margin `0 size40`, padding-left `size40` | `paneHeaders.css:41-43, 79, 95-101`; `padding.css:35-39` |
| List/tree rows | radius 0, full width | `border-radius: cornerRadius-small` (4 px); rows inset `left/right: size40` (compact: `size20`) | BIN css `.modern-ui .monaco-list .monaco-list-row:not(.separator)`; `padding.css:42-45, 71-74` |
| Part (side bar) title | 35 px (probe `sidebar_title` rect h 35) | `height: 32px`, padding `size40` | BIN css `.modern-ui.monaco-workbench .part>.title{height:32px…}` |
| Count badge | 11 px, pill radius 11, padding 3/5 | `fontSize-label3` 10 px, padding `size40 size60`, min 19×19 | BIN css `.modern-ui .monaco-count-badge…` |
| Workbench base font | 13 px | `font-size: var(--vscode-fontSize-body1)` (13 px, same value) | BIN css `.modern-ui.monaco-workbench{…}` |
| Corner tiers | – | controls 4 px (`inputbox`, `select-box`, rows, action labels), inner 6, outer 8 (overlays) | `roundedCorners.css:12-18, 31-55` |
| Floating panels | flush parts | gaps + rounded cards (`--modern-ui-floating-card-margin`), `activitybar` radius `cornerRadius-large`; compact density sets every margin to `sizeNone` and radius 0 | BIN css `.monaco-workbench.floating-panels.modern-ui-compact{…}` |
| Scrollbars | 10 px (`DEFAULT_SCROLLBAR_SIZE = 10`, `scrollableElement.ts:27`) | 8 px (`setGlobalDefaultScrollbarSize(MODERN_UI_SCROLLBAR_SIZE)`) | `modernUI.contribution.ts:22` (release/1.142) |
| Webview panel's outer corners | square | the host rounds the webview overlay: `.monaco-workbench.floating-panels .webview-overlay-content{border-radius:var(--vscode-cornerRadius-large, 8px)}`; compact density sets it back to 0 | BIN css |
| Focus | – | `keyboardFocusOnly` module: focus ring on keyboard focus only | `keyboardFocusOnly.css` |
| Density (`compact`) | – | `modern-ui-compact`: zero outer margins/radii, rows inset `size20`, 24 px tab hitboxes, shorter Agents title bar | `padding.css:71-74`; README "Layout density" |

Things Modern UI does **not** change: codicon glyphs and sizes (`--vscode-codiconFontSize` 16 / `-compact` 12 are
registry constants, `baseSizes.ts:80-86`; the 2025-10 and 2026-02 codicon redraws are independent of the setting:
design-rules DS-ICON-1 cites the codicons repo, not Modern UI); the exported token values (§3); the theme's colours.
Modern UI adds colour ids (`surface.*`, `modernPanel.border`, `modernTab.*`, `modernEditorTab.*`,
`editorGroupHeader.connectedTabsBackground`, `modernUI.shellBackground`…; `modernUI/README.md` "Colors") which are
registry colours and therefore reach webviews whether or not the setting is on: the probe's `dark-modern.json`, taken
with Modern UI **off**, holds 21 of them (`--vscode-surface-background=#181818`, `--vscode-modernTab-activeBackground=#37373d`, …).
`.monaco-text-button` (12 px, line-height 16, padding 4/8, radius 4, i.e. 26 px) and `.quick-input-widget`
(`cornerRadius-xLarge` 12 px) are **ungated** in 1.142.0: current values of classic, not Modern UI tells.

## 2. When it shipped and how it rolls out

| Version (tag date) | `workbench.experimental.modernUI` in source | Public word |
|---|---|---|
| 1.129 | `default: false`, `tags: ['experimental']` (`release/1.129 workbench.contribution.ts:813-817`) | Release notes "Modern UI preview (Experimental)": "enable with the setting… enabled by default in Insiders builds" |
| 1.136–1.138 | `default: false`, `experiment: { mode: 'auto' }` (`wc-1.136.ts:836-838`, `wc-1.138.ts:836-838`) | – |
| **1.139.0** (2026-09-22) | **`default: true`**, `experiment: { mode: 'auto' }` (tag `1.139.0:834-838`; flip commits `eaeb8d9be2` and `88f4cfe9f8`, 2026-09-21; `modernUIEditorTabStyle` added) | v1_139 notes: nothing |
| 1.140.0 (2026-09-30) | `default: true` (tag `1.140.0:834-838`) | v1_140 notes: two contributor PR titles only |
| 1.141.0 (2026-10-06) | (not fetched; between two `true` tags) | v1_141 notes: compact density in the Agents window; frosted glass "also available in editor windows when the modernized UI is enabled with `workbench.experimental.modernUI`"; tab style "(Experimental)" |
| **1.142.0** (2026-10-14; build 2026-10-15) | **compiled `default:!0, experiment:{mode:"auto"}`** in `BIN/out/vs/workbench/workbench.desktop.main.js`; `product.json` has no `configurationDefaults` | Blog 2026-10-15 (Lee Murray, "Modernizing the VS Code UI"): experimental in Stable → default in Insiders → "controlled experiment in Stable for a subset of users" → "enabled by default", classic UI available through the setting "during the transition", removal date unset |
| 1.143.0 (2026-10-20), 1.143.1 | `default: true` (tags `1.143.0:836`, `1.143.1:836`) | v1_143 notes: one contributor PR title |

The release notes 1.139–1.143 contain **no announcement of the default flip**; the blog is the only public statement.
The update API lists `1.143.1` as the newest stable (2026-10-23).

How `experiment: { mode: 'auto' }` resolves (release/1.140 sources): `configurationRegistry.ts:299-305` ("the setting
value is updated to the experiment value automatically whenever it changes"); `configurationService.ts:1441` asks
`getTreatmentWithAssignment('config.workbench.experimental.modernUI')`; `:1495-1503` `shouldOverride` returns `false`
for an `undefined` treatment, so the schema default stands; `assignmentService.ts:331-333` returns `undefined` whenever
`experimentsEnabled` is false (telemetry off, `--disable-experiments`, `workbench.enableExperiments: false`). Hence:
with experiments on, Microsoft can still assign `false` (the staged rollout); with experiments off, 1.139+ runs Modern UI
unless the user sets the key. Which fraction of stable users currently gets `false` is **not verifiable** from any source
opened here.

## 3. The exported `--vscode-*` size tokens

From `probe/out/themes/dark-modern.json` (VS Code 1.142.0, DPR 2, webview root `style` properties):

| Group | Keys = values |
|---|---|
| `--vscode-spacing-*` (14) | `sizeNone` 0, `size20` 2, `size40` 4, `size60` 6, `size80` 8, `size100` 10, `size120` 12, `size160` 16, `size200` 20, `size240` 24, `size280` 28, `size320` 32, `size360` 36, `size400` 40 px |
| `--vscode-cornerRadius-*` (6) | `xSmall` 2, `small` 4, `medium` 6, `large` 8, `xLarge` 12, `circle` 9999 px |
| `--vscode-fontSize-*` (8) | `heading1` 26, `heading2` 18, `heading3` 13, `body1` 13, `body2` 11, `label1` 12, `label2` 11, `label3` 10 px |
| `--vscode-fontWeight-*` (2) | `regular` 400, `semiBold` 600 |
| `--vscode-lineHeight-*` | **none registered** (0 keys) |
| `--vscode-codiconFontSize*` (2) | `codiconFontSize` 16, `codiconFontSize-compact` 12 px |
| `--vscode-strokeThickness` (1) | 1 px |
| deprecated `--vscode-bodyFontSize*` (3) | 13 / `small` 12 / `xSmall` 11 px (`baseSizes.ts:11-28`, "use fontSize.body1/label1/body2") |
| `--vscode-agents-*` mirror | same fontSize/fontWeight values plus `agents-layout-floatingPanelGap` 4 px and a per-theme `agents-background` |
| plus the long-standing | `--vscode-font-family`, `--vscode-font-weight: normal`, `--vscode-font-size: 13px` (hard-coded, `themeing.ts:84`), editor font family/weight/size/feature-settings |

Do the values change?

- Registration: every size is `sizeForAllThemes(n, 'px')` (`baseSizes.ts:12-178`), i.e. the same value for the four
  theme types; `resolveDefaultSize` reads `defaults[theme.type]` and nothing else (`sizeUtils.ts:231-238`); the webview
  export maps every registered size through it (`themeing.ts:72-79`). No code path reads `modernUI` or
  `window.density.layout`.
- Measurement: the six probe dumps (Dark/Light Modern, Dark/Light High Contrast, Dark/Light 2026) differ in **zero**
  size-token values; the only `--vscode-agents-*` difference is the colour `agents-background`.
- Consequence: an alias such as `--nuiget-space-6: var(--vscode-spacing-size160, 16px)` evaluates to 16 px in a classic
  host, a Modern UI host and a compact host alike. DS-GRID-3's probe criterion ("in a Modern UI host, computed
  `--nuiget-space-6` = computed `--vscode-spacing-size160`") passes in every host and proves nothing about the look.
- Availability: `release/1.110` `themeing.ts:72-74` has `getSizeRegistry()` / `exportedSizes`; `release/1.109` has none;
  commit `63cc68e088` "feat: add size registry support to webview theme data provider" is dated 2026-02-04. Hosts
  1.85–1.109 need the literal fallback.
- No signal: the webview root receives `styles` (custom properties), the body class `vscode-light|dark|high-contrast|high-contrast-light`
  (`themeing.ts:107-112`) and `data-vscode-theme-kind/-name`; the probe's webview `bodyClass` is
  `vscode-dark vscode-reduce-motion`. GitLens `hostEnvironment.ts:4-8`: "VS Code only applies its Modern UI classes
  … to its own workbench container and gives webviews no signal."

## 4. What this Mac's 1.142.0 rendered: classic, pinned off by ExTester

Evidence chain:

1. `BIN` is stable 1.142.0 with the compiled default `true` (§2) and no `configurationDefaults` in `product.json`.
2. ExTester 8.28.1 (`node_modules/vscode-extension-tester/package.json`, lockfile 8.28.1) launches with
   `--disable-updates --disable-workspace-trust --disable-telemetry --disable-experiments` (`out/browser.js:179-182`)
   and writes `getDefaultSettings()` merged with `--code_settings` into the profile (`out/browser.js:129-151`; custom
   settings are spread **last**, line 146). Its defaults include `'workbench.enableExperiments': false` and
   `'workbench.experimental.modernUI': false` (`out/util/codeUtil.js:196-197`), plus `workbench.reduceMotion: 'on'`,
   `workbench.hover.delay: 604_800_000`, `editor.stickyScroll.enabled: false`, `window.menuStyle: 'custom'`.
3. The generated profile on this Mac, `/tmp/nuiget-ui/settings/User/settings.json`, contains
   `"workbench.experimental.modernUI": false` (and the repository's seven keys from `src/test/ui/settings.json`, which
   do not mention the setting). A user-scope `false` wins over the registered default.
4. The probe measurements are classic: `workbench/explorer.json` `pane-header` rect h **22**, `.title` 11 px / 700 /
   `uppercase`, line-height 22, radius 0; `monaco-list-row` h 22; `sidebar_title` (`composite title`) h **35**;
   `monaco-count-badge` 11 px radius 11; `quickinput.json` `quick-input-widget` radius 12 (ungated in 1.142.0, see §1.3),
   input box radius 6, list row radius 3.
5. The screenshots agree: `probe-workbench-explorer.png` shows "EXPLORER", "E2E-WORKSPACE", "OUTLINE", "TIMELINE" in
   capitals, the side bar flush against the editor with square corners and no gutter, the status bar flush at the
   bottom; `probe-workbench-quickinput.png` shows the rounded command palette (ungated radius) over the same chrome.

The pin entered ExTester with commit `4fc75b9bc8` "fix: add more workbench default user settings" (2026-09-11):
`packages/extester/src/util/codeUtil.ts` has no `modernUI` at tag `v8.26.0` and has it at `v8.27.0` (published
2026-09-14) and `v8.28.1`. `v8.26.0` already launched with `--disable-telemetry --disable-experiments`
(`packages/extester/src/browser.ts:181-182` at that tag), so with 8.26.0 on VS Code ≥ 1.139 nothing would have
overridden the compiled default: **such a run would have rendered Modern UI** (inferred from the code paths in §2, not
run). Dependabot minor bumps of ExTester also move `supportedVersions.vscode-max` (8.28.1: 1.138.0–1.140.0) and with
it the VS Code the job downloads under `--code_version max` (`package.json:310`).

## 5. What the CI captures (run 39025149785, ubuntu, VS Code 1.140.0, DPR 1) rendered: classic, same cause

- Head `c50d335f71f81b0ecb3e12a867867d0928117226` (`labs/2.0`, 2026-10-17); `git show c50d335:package-lock.json` locks
  `vscode-extension-tester` **8.28.1**, so the same `modernUI: false` was written on the runner. The job log
  (`gh run view 39025149785 --job 117375049808 --log`) reads "Downloading VS Code: 1.140.0 / stable" and "WARNING: You
  are using the outdated VS Code version '1.140.0'. The latest stable version is '1.142.0'."
- `main-installed-single.png`: "EXPLORER", "E2E-WORKSPACE", "OUTLINE", "TIMELINE" in capitals; side bar, editor and
  status bar flush with square corners; the tab strip is the classic 35 px band. `sidebar-sections.png`: nUIget's own
  "INSTALLED 2" / "UPDATES 2" section headers are uppercase by nUIget's CSS (`primitives.css:480` per design-rules), and
  the workbench chrome around them is the same classic chrome.
- 1.140.0's source default is `true` (tag `1.140.0:836`), so the report's puzzle ("default on from 1.139 yet classic")
  is resolved: not an experiment assignment (experiments were disabled) but ExTester's injected user setting.

## 6. Claims checked

| Claim | Verdict | Evidence |
|---|---|---|
| H1 / design-rules §1: default `false` ≤ 1.138, `true` from 1.139 with `experiment: { mode: 'auto' }` | **Holds**, and now with tags: 1.139.0, 1.140.0, 1.143.0, 1.143.1 all `default: true` | `wc-1.138.ts:836`; tag fetches §2 |
| H1: "why 1.140.0 rendered classic is not verified" | **Resolved**: ExTester ≥ 8.27.0 writes `workbench.experimental.modernUI: false` | `codeUtil.js:197`; `/tmp/nuiget-ui/settings/User/settings.json`; ExTester `4fc75b9bc8` |
| H1: the D18 look is unpinned and can flip with ExTester's max version or the experiment | **Partly**: experiments are off (`--disable-experiments`), so TAS cannot flip it; an ExTester change (the pin's removal, or a version < 8.27.0) or a VS Code change can. The look is pinned only implicitly. | `browser.js:181-182`; `codeUtil.js:196-197` |
| H6 / V9 / DS-GRID-3: VS Code exports the size ramp to webviews since 1.110 | **Holds** (values, keys and the 1.110 boundary verified) | §3 |
| H6 / V9 / DS-GRID-3: aliasing them makes the webview "follow Modern UI" | **False** for sizes: the values are constants that no setting changes; what GitLens follows is its own mirror of three host settings onto `<body>` | `baseSizes.ts`, `sizeUtils.ts:231-238`, probe diff; GL `hostEnvironment.ts`, `tokens.scss:117-122` |
| H6: "codicons only 16 or 12 px" tokens | **Holds** (`codiconFontSize` 16, `.compact` 12), and Modern UI leaves them alone | `baseSizes.ts:80-86`; module list |
| Task checklist: keys starting `--vscode-lineHeight` | **None exist** (0 keys in the dump; no `lineHeight` size in `baseSizes.ts`); line heights are not tokenised | §3 |
| H24: the captures ran on 1.140.0 | **Holds**, re-fetched: the job log says "Downloading VS Code: 1.140.0 / stable" | `gh run view 39025149785 --job 117375049808 --log`; ExTester 8.28.1 max 1.140.0 |
| V36 / DS-HEIGHT-1: native pane header 22 (classic) vs 28 (Modern UI) | **Holds**; probe binds 22 | `explorer.json`; BIN css `--pane-header-size` |
| DS-TYPE-5: classic 11 px bold uppercase, M 12 px 600 capitalize unless the uppercase setting | **Holds** | BIN css; `fontRamp.css:56-60, 111-152` |
| DS-DENSITY-2: compact density shrinks spacing tokens | **Wrong mechanism**: tokens keep their values; compact changes consumers (rows `size40` → `size20`, card margins → `sizeNone`, radii 0) | `padding.css:71-74`; BIN css `.modern-ui-compact` |
| design-rules: "quick input radius" as a Modern UI discriminator (task's suggested check) | **Not a discriminator**: `cornerRadius-xLarge` on `.quick-input-widget` is ungated in 1.142.0 | BIN css |
| design-rules: Modern UI view headers not uppercase unless `modernUIUppercaseViewHeaders` | **Holds** | `workbench.contribution.ts:840-845`; `fontRamp.css:146-152` |
| GitLens aliases every size token with a fallback and mirrors three settings | **Holds** | GL `tokens.scss:12-14,19-20,30-35,49-61`; `hostEnvironment.ts:1-40` |

## 7. Recommendation

**Target: follow the host, classic as the fallback.** Reasons, in the owner's order: the workbench is the exemplar and
the exemplar now has two looks chosen per user (code default Modern UI since 1.139; classic reachable through the
setting and, in CI, forced by ExTester); "closest to the workbench" is therefore only satisfiable by matching whichever
look the host shows. Targeting classic alone would make nUIget the one uppercase, square, 22 px-header panel in a
28 px-header, capitalized, rounded workbench for every default-configured stable user; targeting Modern UI alone would
do the reverse for every user who turned it off and for every 1.85–1.138 host.

What "follow the host" costs, concretely:

1. **Token aliases (DS-GRID-3, V9, component-base C2)**: `tokens.css` spacing (`--nuiget-space-1..6` =
   `size20/40/60/80/120/160`), radii (`xSmall`, `small`), type (`body1`, `label1`, `body2`, weights `regular`/`semiBold`,
   `codiconFontSize*`, `strokeThickness`) as `var(--vscode-<id>, <px>)`. Lint today: `webview-tokens.test.ts:49-50`
   accepts any `--nuiget-*: <value>;` declaration, `:56-65` constrains **colour** tokens only (every `var(` must name a
   `--vscode-`/`--nuiget-` variable, `:59`; colours must be pure aliases, `:64`), and `:78-79` compares the two row
   heights to px literals in `primitives.css`; the `pxSpacing` rule lives in `webview-stylesheets.test.ts` and exempts
   `tokens.css` (`:12`). So design-rules' "the tokens lint allows `var()` only for colours" is wrong and V9's "extend
   the lint to allow size aliases" is unneeded; what the lint should gain is a rule that *requires* the alias form with a
   fallback. Honest value: identical pixels today; a documented mapping to the workbench ramp; future-proof if VS Code
   ever varies a size per theme type.
2. **Host mirror**: read `workbench.experimental.modernUI`, `window.density.layout`,
   `workbench.experimental.modernUIUppercaseViewHeaders` in the host (as `readExtensionConfig` already reads
   `workbench.tree.indent`, `src/host/services.ts:97`) and put `data-modern-ui`, `data-modern-ui-compact`,
   `data-modern-ui-uppercase-view-headers` on the webview root. Two routes: (a) `renderWebviewHtml`'s `dataset`
   (`services.ts:103-108`), no contract change, but stale until the webview is rendered again (a toggle mid-session
   relayouts the workbench live while the webview keeps the old look until reopened); (b) one `ExtensionConfig` field per
   setting in `src/protocol/domain.ts` so `config/changed` updates live, which is a frozen-contract change under the
   sentinel (claim H15). Recommend (b) folded into the overhaul's one D6 item, (a) as the stopgap.
3. **Two value sets for the handful of metrics that differ**, switched by `[data-modern-ui]` on the root (GitLens
   `body[data-modern-ui]`): section header height 22 → 28 (`size280`), header type 11/700/uppercase →
   `label1`/`semiBold`/capitalize (uppercase again under the uppercase attribute), header hover tint, row radius 0 →
   `small`, row inset 0 → `size40` (compact `size20`), part-title-like toolbars 35 → 32, scrollbar 10 → 8, badge 11 →
   `label3`. Everything else (buttons 26 px, inputs, quick-input-like popovers at `xLarge`, count-badge pill) is ungated
   in current VS Code and the same in both looks. The host also rounds the main panel's outer corners itself under
   Modern UI default density (`.webview-overlay-content` radius `cornerRadius-large` 8 px, 0 under compact), so the
   root's opaque `--nuiget-color-bg` is clipped by the host; nothing in the webview needs to draw that edge.
4. **Floor:** nothing above needs more than the 1.85 floor (a settings read in the host, a `dataset` attribute, CSS
   attribute selectors); raising the floor to 1.110 would only retire the fallback literals of item 1. The owner's
   floor-raise clause is not triggered by Modern UI.

**Harness consequence (D18, the goldens):**

- The look is decided by **one key in `src/test/ui/settings.json`**, because ExTester spreads the repository's file
  last over its defaults (`browser.js:146`) and `modernUI` is not one of the flag-shadowed keys (`codeUtil.js:268-275`).
  Today the goldens pin **classic** only because ExTester's default says so; write the key explicitly whichever way the
  decision goes, so an ExTester or VS Code change cannot move the goldens silently.
- Recommended pinning: `"workbench.experimental.modernUI": true` as the primary goldens (the look of a
  default-configured stable 1.139+ host, which is also the look the Design System's M values describe), with
  `"window.density.layout": "default"` and `"workbench.experimental.modernUIUppercaseViewHeaders": false` written
  explicitly; plus one classic capture of the same named states. Cheapest form of the second pass: toggle the setting at
  runtime inside the UI suite (the contribution re-applies and relayouts on `onDidChangeConfiguration`; ExTester's
  `SettingsEditor` page object or a settings-JSON edit, the way `theme.ui.test.ts` switches themes) and screenshot again;
  this runtime toggle is **not verified** in a run. The alternative is a second `--code_settings` file and a second job.
- `rules-bound.md` / `rules-bound.json` bind **classic** values only (every `workbench/*.json` measurement is 22 / 11 px
  700 uppercase / 35 / radius 0). Before any M value is bound, re-run `probe/zz-probe.ui.test.ts` with
  `workbench.experimental.modernUI: true` in the code settings; also record `document.querySelector('.monaco-workbench').className`
  in `__document` so the look is in the data, not inferred.
- Record the VS Code version and the ExTester version with every capture set (H24), and consider pinning
  `--code_version` instead of `max`, since Dependabot's auto-merged ExTester bumps move it.
- Keep `workbench.enableExperiments: false` / `--disable-experiments` as they are: they are what makes the default
  deterministic (`shouldOverride(undefined)` is `false`).

## 8. Not verified

- Whether the TAS experiment currently assigns `false` to any stable population (needs telemetry-enabled hosts; the
  blog says the experiment phase ended; no source gives numbers).
- The 1.141.x tags' source (the fetched tags on both sides compile `true`).
- The runtime settings toggle inside an ExTester run (plausible from `modernUI.contribution.ts`, not run).
- Exact pixel values of Modern UI surfaces on this Mac: no probe ran with the key on; the M values above are CSS reads of
  the 1.142.0 binary and of `VSC@main`, not rect measurements.
- Whether `codeUtil.ts` in ExTester 8.27.0's **published tarball** carries the pin (verified at the git tag `v8.27.0`,
  not the npm artifact).

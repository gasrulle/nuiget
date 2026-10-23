# The VS Code floor for the nUIget UX overhaul

Date: 2026-10-23. Repository `/Users/mattias/github/nuiget` at `e4d6e97` (main), read-only. Every fact below was
checked against the tree, the microsoft/vscode history (`gh api`, raw.githubusercontent.com), the Electron release
pages, MDN browser-compat-data or the Marketplace; the research reports' claims were treated as hypotheses.

## 0. Answer

**Stay at `^1.85.0` for the UX overhaul.** Nothing a Design System rule needs is blocked by Chromium 114, Node 18
or the 1.85 API in a way that lacks a correct fallback on the floor:

- The one real defect tied to the floor, the inert scrollbar rules on current hosts (V15, DS-SCROLL-1), is fixed by a
  `scrollbar-color` declaration that Chromium 114 drops harmlessly (CSS error handling: an unknown declaration is
  discarded, the rest of the block applies). What blocks the fix is the repository's lint policy, not the floor.
  Raising the floor would not even simplify that fix: on every Chromium ≥ 121 host the 10 px look still needs the
  `::-webkit-scrollbar` rules plus a `scrollbar-color: auto` reset of VS Code's inherited `html { scrollbar-color }`.
- The exported size tokens (`--vscode-spacing-*`, `--vscode-fontSize-*`, `--vscode-cornerRadius-*`) are aliased with
  literal fallbacks; the fallback is the classic value, and every host below 1.139 (where Modern UI defaults on)
  shows the classic workbench, so the fallback is the correct look there. The full set needs 1.129 (July 2026), not
  1.110 as component-base.md says, and spacing needs 1.124, not 1.130 as report-narrative.md says.
- `body.vscode-reduce-motion`, `:has()`, container queries, `color-mix()`, `popover`, `text-wrap: balance` and the
  `webview/context` menu are all at the floor already.
- `@starting-style`, `transition-behavior`, subgrid, relative colour syntax, anchor positioning, `light-dark()`,
  `field-sizing`, `interpolate-size`: no DS rule or proposal in the 14 reports names them; only report-narrative §16
  lists them as "blocked".
- The chat / language-model API (Stable from 1.91) and Node 20 appear in no proposal.

The fallback option, if the owner wants one Chromium generation to reason about, is **1.90** (June 2024: Chromium
122, Node 20.9.0): it is the lowest release that clears the whole Chromium ≥ 121 batch and Node 20, peers already
require it (versionlens ≥ 1.90, dependi ^1.87, nuget-gallery ^1.87), and it costs one day of mechanical edits. The
token floors (1.124 / 1.129), ExTester's 1.138 and the "-2" 1.141 buy the design nothing visible.

One sequencing fact for the owner: 2.0.0 is not on the Marketplace (newest published 1.18.9, 2026-10-10). A floor
raised before 2.0.0 publishes leaves sub-floor users on 1.18.9 for good; 2.0.0 published at `^1.85.0` first leaves
them on 2.0.0. VS Code installs the newest version whose `engines.vscode` matches.

## 1. Hosts: VS Code → Electron → Chromium → Node (verified)

| VS Code | Tag date | Electron | Chromium | Node | Electron source (release page) |
|---|---|---|---|---|---|
| 1.85.0 (floor) | 2023-12-06 | 25.9.7 (`release/1.85` package.json `devDependencies.electron`) | 114.0.5735.289 | 18.15.0 | https://releases.electronjs.org/release/v25.9.7 |
| 1.89.0 | 2024-05-01 | 28.2.8 (`release/1.89` package.json) | 120.0.6099.291 | 18.18.2 | https://releases.electronjs.org/release/v28.2.8 |
| 1.90.0 | 2024-06-03 | 29.4.0 (`release/1.90` package.json; release notes v1_90 "Electron 29 update": "Chromium 122.0.6261.156 and Node.js 20.9.0") | 122.0.6261.156 | 20.9.0 | https://releases.electronjs.org/release/v29.4.0 |
| 1.91.0 | 2024-07-01 | not fetched (API row only) | — | — | — |
| 1.110.1 | 2026-03-06 | 39.6.0 (`release/1.110` package.json; tag 1.110.0 does not exist) | 142.0.7444.265 | 22.22.0 | https://releases.electronjs.org/release/v39.6.0 |
| 1.124.0 | 2026-06-10 | 42.2.0 (`release/1.124` package.json) | 148.0.7778.97 | 24.15.0 | https://releases.electronjs.org/release/v42.2.0 |
| 1.129.0 | 2026-07-15 | 42.6.0 (`release/1.129` package.json; same at `release/1.130`) | 148.0.7778.280 | 24.18.0 | https://releases.electronjs.org/release/v42.6.0 |
| 1.138.0 (ExTester min) | 2026-09-15 | 42.10.0 (`release/1.138/.npmrc` `target=`; package.json no longer carries electron) | 148.0.7778.280 | 24.18.1 | https://releases.electronjs.org/release/v42.10.0 |
| 1.140.0 (UI job, captures) | 2026-09-30 | 43.7.3 (`release/1.140/.npmrc`) | 150.0.7871.250 | 24.21.0 | https://releases.electronjs.org/release/v43.7.3 |
| 1.141.0 (stable − 2) | 2026-10-06 | 43.7.7 (`release/1.141/.npmrc`) | 150.0.7871.250 | 24.21.0 | https://releases.electronjs.org/release/v43.7.7 |
| 1.143.1 (stable, 2026-10-22) | 2026-10-22 | 43.7.7 (`release/1.143/.npmrc`) | 150.0.7871.250 | 24.21.0 | same |

Sources: `https://raw.githubusercontent.com/microsoft/vscode/release/1.<N>/package.json` (key
`devDependencies.electron`, through 1.130) and `.../release/1.<N>/.npmrc` (`target=`, from 1.138; `release/1.85/.npmrc`
is 404). Tag dates: `gh api repos/microsoft/vscode/commits/<tag> --jq .commit.committer.date`. Current stable:
`https://update.code.visualstudio.com/api/releases/stable` → `["1.143.1","1.143.0","1.142.0","1.141.2",…]`;
`gh api repos/microsoft/vscode/releases/latest` → `1.143.1 2026-10-22T23:04:14Z`. The UI job's ChromeDriver 150 for
1.140.0 (`research/ui-job.log:231`) agrees with Electron 43.7.3's Chromium 150.

Branch tips, not `.0` tags: the `release/1.<N>` files read are the branches' newest patch releases (1.85.2, 1.89.1, 1.90.2, 1.110.1, 1.124.2, 1.129.1, 1.130.0), so an Electron patch digit may differ from the `.0` tag; the Chromium and Node majors do not move within an Electron major, so every conclusion holds.

Consequences: the first release with Chromium ≥ 121 (`scrollbar-color`) and the first with Node 20 are the same
release, **1.90**. Every candidate at or above 1.110 runs Node 22 or 24.

## 2. Report claims checked

| Claim (where) | Verdict | Evidence |
|---|---|---|
| "VS Code exports its design-system size ramp (spacing, radius, font, codicon, stroke) to webviews since 1.110" (component-base.md:31-33, 289; claim H6) | **Wrong for spacing, the font ramp and weights.** At `release/1.110` the registry has 11 ids: `bodyFontSize`, `.small`, `.xSmall`, `codiconFontSize`, `cornerRadius.{medium,xSmall,small,large,xLarge,circle}`, `strokeThickness`. The webview export (`themeing.ts`, commit `63cc68e`, 2026-02-04) is first in tag **1.110.1** (`compare/63cc68e...1.109.0` → `diverged`; `...1.110.1` → `ahead`; tag 1.110.0 → 404). | `https://raw.githubusercontent.com/microsoft/vscode/release/1.110/src/vs/platform/theme/common/sizes/baseSizes.ts`; `.../release/1.110/src/vs/workbench/contrib/webview/browser/themeing.ts` (~l. 72-90 `exportedSizes`); `.../release/1.109/...themeing.ts` has no size export |
| "`--vscode-spacing-size*` since 1.130 (2026-06-05)" (report-narrative.md:44, 118, 439) | **Wrong release.** Commit `d97df0a` "Add spacing size variables to theme sizes (#320073)" (2026-06-05) is first in tag **1.124.0** (2026-06-10): `compare/d97df0a...1.123.0` → `diverged`, `...1.124.0` → `ahead`; `release/1.123` baseSizes has no `spacing.` id, `release/1.124` has 14. | `gh api repos/microsoft/vscode/commits/d97df0a`; `.../release/1.123/...baseSizes.ts`; `.../release/1.124/...baseSizes.ts` |
| `--vscode-fontSize-{heading1..3,body1,body2,label1..3}` and `--vscode-fontWeight-*` (design-rules DS-TYPE-2, DS-GRID-3) | Added by `dd766a81f` "Refactor font size and weight tokens for consistency (#324738)" (2026-07-07), first in tag **1.129.0** (2026-07-15); `release/1.124` still has only `bodyFontSize*`. `codiconFontSize.compact`: `4ad9c7c87` (2026-05-19), first in **1.122.0**. | `gh api "repos/microsoft/vscode/commits?path=src/vs/platform/theme/common/sizes/baseSizes.ts"`; compare loops over tags 1.108.0–1.132.0 |
| "VS Code sets `body.vscode-reduce-motion` … already in 1.85.0" (accessibility.md:27, claim A4; task: "claimed 1.85") | **True at 1.85; first set in 1.68.** `release/1.85` `pre/index.html` has `if (initData.reduceMotion) { body.classList.add('vscode-reduce-motion'); }` (~l. 445-446). `release/1.68` has the same lines (~l. 445-446); `release/1.67`, `1.66`, `1.64` have no `reduceMotion` at all. The 1.68 release notes do not mention it. | `https://raw.githubusercontent.com/microsoft/vscode/release/1.{64,66,67,68,70,85}/src/vs/workbench/contrib/webview/browser/pre/index.html` |
| "chat/language-model APIs (1.90+)" (report-narrative.md:442) | **Stable is 1.91.** v1_90: "finalized … but are currently only available in VS Code Insiders"; v1_91: "these APIs are now fully available in VS Code Stable". | https://code.visualstudio.com/updates/v1_90 ; https://code.visualstudio.com/updates/v1_91 |
| "`:has()` and container queries are already available (105)" (report-narrative.md:441-442) | **Right.** BCD `css.selectors.has` chrome 105; `css.at-rules.container` 105 (`style_queries_for_custom_properties` 111). `sidebar.css:87` already uses `:has()`. | https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/selectors/has.json ; `.../css/at-rules/container.json` |
| "`mask-image` unprefixed" blocked (report-narrative.md:441) | **Not blocked in practice.** BCD: unprefixed 120, `-webkit-` prefixed since Chrome 1; nothing in the lint denies the prefix, and the icons are inline SVG with `currentColor` (ADR-006), so no rule needs it. | `.../css/properties/mask-image.json` |
| "On Chromium ≥ 121 VS Code's `html { scrollbar-color }` overrides every `::-webkit-scrollbar` rule" (visual-audit.md §6.5, V15) | **Right**, and the fix is floor-independent (§3 row 1). MDN: values other than `auto` override `::-webkit-scrollbar-*`; `scrollbar-color` is inherited. BCD `scrollbar-color` 121 (lint entry `webview-css-baseline.test.ts:37`). | https://developer.mozilla.org/en-US/docs/Web/CSS/::-webkit-scrollbar |
| "a newer `@types/vscode` fails `check:vsix`" (`.github/dependabot.yml:31-32`) | **Right.** `check:vsix` calls `vsce.listFiles` (`scripts/check-vsix-contents.mjs:87-89`) → `readManifest` → `validateManifestForPackaging` → `validateVSCodeTypesCompatibility(engines.vscode, devDependencies['@types/vscode'])`. | `node_modules/@vscode/vsce/out/package.js:1043-1044, 1105-1121`; `out/validation.js:88` |
| "ExTester 8.28.1 supports 1.138.0–1.140.0; no WebDriver route renders Chromium 114" (candidates-triage F2, H61) | **Right.** | `node_modules/vscode-extension-tester/package.json` → `{"vscode-min":"1.138.0","vscode-max":"1.140.0"}` |
| Keep-alive on Node 18 hosts (ADR-005 row) | **Right and already accepted.** `docs/adr/005-proxy-matrix.md:80-81,105`; `src/core/http/Transport.ts:13-17` ("connections are then reused only where the host's Node keeps the global agent alive (Node 19+)"). No report proposes a change. | tree |

## 3. Techniques the floor blocks or degrades

Chromium versions are the lint's (`src/test/lint/webview-css-baseline.test.ts:35-61`, read from BCD on 2026-10-15/16)
unless a BCD URL is given. "First VS Code" is from §1. "Needed" = named by a DS rule or a proposal in the reports.

| # | Technique | What it buys the design | Needs | First VS Code | At 1.85 | Needed by | Floor-bound? |
|---|---|---|---|---|---|---|---|
| 1 | `scrollbar-color` / `scrollbar-width` | Re-enables the 10 px token-coloured scrollbars (`primitives.css:25-44`) that VS Code's inherited `html { scrollbar-color }` disables on every host from 1.90 (DS-SCROLL-1, V15) | Chromium 121 | 1.90 | The declaration is dropped on 114 and the WebKit rules apply as today (MDN CSS error handling: an invalid declaration "is ignored and discarded", parsing "continues … after the next semicolon") | visual-audit V15 / DS-SCROLL-1 | **No.** Blocked by the lint (`webview-css-baseline.test.ts:37-38`) and the pinned declarations (`webview-stylesheets.test.ts:133-137`), not by the floor. On ≥ 121 the 10 px width still needs the WebKit rules, so a `scrollbar-color: auto` reset on the root plus the existing block is the fix at every floor; `scrollbar-width: thin` has no 10 px contract. Both branches unverified (visual-audit.md:239-242): probe in the UI job (Chromium 150) |
| 2 | `--vscode-cornerRadius-*`, `--vscode-bodyFontSize*`, `--vscode-codiconFontSize`, `--vscode-strokeThickness` | Radii and codicon size follow the host | API 1.110.1 | 1.110.1 | `var(--vscode-cornerRadius-small, 4px)`: fallback = classic value | DS-GRID-3, V9/H6 | No: fallback is correct on every host < 1.139 and on classic hosts |
| 3 | `--vscode-codiconFontSize-compact` | 12 px compact codicon | API | 1.122.0 | fallback | DS-GRID-3 | No |
| 4 | `--vscode-spacing-size*` (14) | Spacing ramp follows the host (Modern UI density) | API | **1.124.0** | fallback | DS-GRID-1/3 | No |
| 5 | `--vscode-fontSize-{heading,body,label}*`, `--vscode-fontWeight-*` | Type ramp follows the host | API | **1.129.0** | fallback | DS-TYPE-2 | No |
| 6 | `body.vscode-reduce-motion` | Honour VS Code's own reduce-motion setting (A4, DS-MOTION-2) | API | **1.68** | present | DS-MOTION-2 | No (lint pin `webview-tokens.test.ts:53` only) |
| 7 | `:has()`, `@container` / style queries, `color-mix()`, `text-wrap: balance`, `popover` / `showPopover`, `scrollbar-gutter`, `inert`, `:focus-visible` | Selection band across the action column (component-audit §Row), width breakpoints (DS-ICON-3), hover tints, empty-state wrapping | 105 / 105 (111) / 111 / 114 / 114 / 94 | ≤ 1.85 | present | various | No |
| 8 | `-webkit-mask-image` | Icon colouring through masks | prefixed: Chrome 1 (unprefixed 120 → 1.89) | 1.85 | present | none (icons are inline SVG) | No |
| 9 | `@starting-style`, `transition-behavior: allow-discrete`, `overlay` | Entry/exit fades for dialog, popover, search popup | 117 | 1.90 | layers appear without a fade | none (DS-MOTION-1 sets durations only; whether the workbench fades its own layers was not checked) | Not needed |
| 10 | `subgrid` | Column alignment across rows (version column, property lists) | 117 | 1.90 | needs an `@supports` fallback; the Extensions row is flex, not a grid | none | Not needed |
| 11 | Relative colour syntax | Derived tints from theme colours | 119 | 1.90 | `color-mix()` (111) covers it | none | Not needed |
| 12 | CSS nesting (`&`) | Authoring only; esbuild lowers it for `chrome114` | 120 (complete) | 1.90 | n/a | none | Not needed |
| 13 | `text-wrap: pretty` | Nicer empty-state paragraphs | 117 | 1.90 | `balance` (114) | none | Not needed |
| 14 | Anchor positioning (`anchor-name`, `@position-try`) | In-webview popover placement | 125 | 1.110 | n/a | none: the design takes the native `webview/context` menu (architecture H14, available at 1.85); `Popover` has no consumer | Not needed |
| 15 | `light-dark()`, `field-sizing` | Theme-paired colours; auto-growing inputs | 123 | 1.110 | n/a | none (theme colours come from `--vscode-*`; inputs are fixed-height) | Not needed |
| 16 | `interpolate-size` / `calc-size()` | Animate sections to `auto` height | 129 | 1.110 | n/a | none | Not needed |
| 17 | Node 20: `https.globalAgent` keep-alive, `AbortSignal.any`, `require(esm)` (20.19+) | Connection reuse for HTTP/1.1 feed calls (ADR-005:80-82,105) | Node 20.9 | 1.90 (Node 20.9.0 lacks `require(esm)`; that needs ≥ 1.110's Node 22.22) | accepted cost | none (performance, not a design rule) | Not a design technique |
| 18 | Chat participant / `vscode.lm` | AI features | API | **1.91** (Stable) | n/a | none | Not needed |
| 19 | CI render of the floor's Chromium (N64) | The screenshot gate (D18) proves the floor instead of the lint | ExTester ≥ 1.138.0 | 1.138 | the lint is the only guard (`findings-ledger.md:168`) | candidates-triage F2/H61 | Verification choice, not a design technique |
| 20 | Modern UI (`workbench.experimental.modernUI`, default on from 1.139 under an experiment) | Webviews follow the host's look through rows 2-5 | API | 1.139 | classic look, which 1.85–1.138 hosts show anyway | DS-GRID-3, DS-TYPE-5 | No |

## 4. Options

| Option | Floor | Chromium / Node | What it unblocks for this design | Cost (beyond §5 common items) | Users who stay on 1.18.9 (or on 2.0.0 if it ships at ^1.85 first) |
|---|---|---|---|---|---|
| A | **1.85.0** (stay) | 114 / 18.15.0 | Nothing new. V15 needs a lint-policy item: an allowlist of progressive-enhancement declarations with a required, documented 114 fallback, and the `::-webkit-scrollbar` pins in `webview-stylesheets.test.ts:133-137` updated | 0 for the floor; ~0.5 d for the lint item and its UI-job probe | none |
| B | 1.90.0 | 122 / 20.9.0 | Rows 1, 9-13 (the 16 lint entries ≤ 122: scrollbar-color/-width, @starting-style, @scope, animation/scroll/view-timeline, transition-behavior, overlay, text-wrap: pretty, subgrid, :user-invalid/:user-valid, :dir(), nesting, relative colour); Node 20 keep-alive; `@types-host/node` → `npm:@types/node@20.9.5` | ~1 d: §5 items; prune 16 entries; `@types/vscode` 1.90.0 (exists); E2E matrix `1.90.0`; ADR-000 amendment behind the sentinel | hosts 1.85–1.89 (2023-12 to 2024-05) |
| C | 1.110.1 | 142 / 22.22.0 | B + row 2 (radius, bodyFontSize, codicon, stroke) + rows 14-16; Node 22 has `require(esm)` (Mocha constraint may lift, unverified) | ~1 d + the lint's DENYLIST empties (max entry 130): retire it or seed BCD entries > 142 (`anchor_position_queries` 143, `container-query_optional` 148); `@types/vscode` 1.110.0 (exists) | hosts 1.85–1.109 (to 2026-02) |
| D | 1.124.0 | 148 / 24.15.0 | C + rows 3-4 (spacing, compact codicon); Node 24 host = toolchain: `@types-host/node` alias removable (`@types/node@24.19.2` describes 24.16-24.19 APIs a 24.15 host lacks: residual in the other direction) | as C; `@types/vscode` **1.120.0** (no 1.121–1.124 tag published) | hosts 1.85–1.123 (to 2026-06) |
| E | 1.129.0 | 148 / 24.18.0 | D + row 5: the whole DS-GRID-3 / DS-TYPE-2 token set without fallbacks | as D; `@types/vscode` **1.125.0** (no 1.126–1.129 tag) | hosts 1.85–1.128 (to 2026-07) |
| F | 1.138.0 | 148 / 24.18.1 | E + row 19: the UI job can pin `--code_version` to the floor and render it (N64 closes; the CSS lint becomes a convenience) | as E; `@types/vscode` 1.138.0 (exists); UI job pinned to the floor plus a second entry for stable | hosts 1.85–1.137 (to 2026-09-08) |
| G | 1.141.0 (stable − 2) | 150 / 24.21.0 | Nothing beyond F; outside ExTester 8.28.1's declared range (max 1.140.0) | as F; `@types/vscode` **1.140.0** (no 1.141 tag); refloats on every release, so engines would trail stable by design | hosts 1.85–1.140 (to 2026-10-05) |

`@types/vscode` tags published after 1.110: 1.115.0 1.116.0 1.118.0 1.120.0 1.125.0 1.134.0 1.136.0 1.137.0 1.138.0
1.140.0 (`npm view @types/vscode versions`, 2026-10-23); a pin must be ≤ `engines.vscode` (vsce check, §2).

## 5. Cost items common to any raise (path:line at e4d6e97)

| Item | Where | Note |
|---|---|---|
| `engines.vscode` | `package.json:23` (`"vscode": "^1.85.0"`) | `engines.node` (`:22`, `>=22`) is the toolchain floor, unaffected |
| `@types/vscode` pin | `package.json:326` (`"1.85.0"`); `.github/dependabot.yml:31-33` ignore + comment | checked by vsce in `check:vsix` and `vsce package` (`node_modules/@vscode/vsce/out/package.js:1043-1044`) |
| esbuild targets | `esbuild.mjs:8-10` (`EXTENSION_TARGET = 'node18'`, `WEBVIEW_TARGET = ['chrome114']`) | `node20` + `chrome122` at B; bundle ceilings (`:24`) re-measured after the target change (N63 rule) |
| Node declarations | `package.json:321` (`"@types-host/node": "npm:@types/node@18.19.130"`); `tsconfig.json:21-28` (typeRoots, comment); `tsconfig.vitest.json:25` | B: `npm:@types/node@20.9.5` (newest 20.9 tag); D+: alias removable; `lib` can stay `ES2022` |
| E2E matrix | `.github/workflows/ci.yml:175-176` (`vscode: [ '1.85.0', 'stable' ]`); `.vscode-test.mjs:7-8` comment | the "only Node 18 host" comment goes |
| CSS baseline lint | `src/test/lint/webview-css-baseline.test.ts:21` (`BASELINE = 114`), `:7-17` comment, `:35-61` entries; `:99` asserts every entry > BASELINE | prune entries ≤ the new Chromium; at ≥ 142 the list is empty |
| Scrollbar pins and comment | `src/test/lint/webview-stylesheets.test.ts:133-137`; `src/webview/shared/primitives/primitives.css:20-24` | touched by the V15 fix at every floor |
| README | `README.md:248` ("Visual Studio Code 1.85.0 or newer") | |
| CHANGELOG | `## [Unreleased]` → `### Changed` → `**Breaking:** …` (rule: `docs/adr/000-release-and-compatibility-policy.md:52-54`) | |
| ADR-000 | `docs/adr/000-release-and-compatibility-policy.md:22` ("Raising the floor requires a concrete API need recorded in an ADR"), `:30-39` (D10 baseline), `:63` | frozen: amend behind `.claude/.contract-change` (plan D6); ADR-005 rows `docs/adr/005-proxy-matrix.md:80-82,105` become historical at ≥ 1.90 |
| Agent and architecture docs | `.github/copilot-instructions.md:151,173,184,250`; `.github/instructions/core-boundaries.instructions.md:33`; `ARCHITECTURE.md:22,257,263,872,917,922,933`; `docs/plans/findings-ledger.md:168` (N64) | `npm run docs:check` names paths and settings only; the version strings are prose |
| Mocha 11 constraint (`.github/copilot-instructions.md:250`) | unchanged at B (Node 20.9.0 has no `require(esm)`); may lift at ≥ 1.110 (Node 22.22): not verified | |

## 6. User-base consequence

- Marketplace, 2026-10-23 (`research/b14-vsce-show.json`, `vsce show`): nUIget has 83 installs and 921 downloads;
  25 published versions, newest **1.18.9** (2026-10-10), all at `^1.85.0`; **no 2.x is published** although
  `CHANGELOG.md` carries `## [2.0.0] - 2026-10-17`.
- Compatibility behaviour: VS Code walks the Marketplace's versions newest first and installs the first whose
  engine is valid for the running version (`release/1.85` `extensionGalleryService.ts` ~l. 425-430 `isEngineValid`,
  ~l. 560-585); the publishing guide: Stable users "will only get the update when the Stable release reaches
  version 1.9.0" (https://code.visualstudio.com/api/working-with-extensions/publishing-extension). So a user below
  the floor keeps the newest version whose engine they satisfy: 1.18.9 if the floor rises before 2.0.0 publishes,
  2.0.0 if 2.0.0 publishes at `^1.85.0` first. Owner's call on the order.
- Distribution data: **none public.** A web search found no VS Code version-in-use statistics (JetBrains publishes
  one for its IDEs; Microsoft does not). VS Code auto-updates by default on macOS and Windows (FAQ "How do I opt out
  of VS Code auto-updates?"), so sub-floor users are those who turned updates off or run a pinned enterprise build.
- Peers (Marketplace query, `research/mkt/nuget-query.json`): versionlens ≥ 1.90 (2.55 M installs), dependi ^1.87
  (769 k), nuget-gallery ^1.87 (747 k), nugetpackagemanagergui ^1.87.2 (297 k), resharper-code ^1.90, vscode-nupkg
  ^1.125, csharp-dev-tools ^1.100; feature-gaps.md:541 adds NuGet Workbench 1.87, Nuggy 1.106, I-Synergy 1.110.
  The only external 2.0-era reporter ran 1.132 Insiders (user-signal.md:93,103).

## 7. Recommendation

**Keep `^1.85.0` (option A).** Reasoning tied to the techniques:

1. The owner's rule is "raise when a technique the design needs, or a clearly better one, is blocked". The only
   needed technique the reports tie to the floor (row 1) is not blocked by the floor: Chromium 114 drops the
   declaration and keeps today's WebKit rules, and on Chromium ≥ 121 the 10 px look needs those same WebKit rules
   plus a `scrollbar-color: auto` reset. A higher floor does not remove a line of that fix. What has to change is
   the lint policy: admit named progressive-enhancement declarations whose 114 behaviour is documented, and probe
   the result once in the UI job (Chromium 150), since no job renders 114 (N64).
2. The token aliases (rows 2-5) degrade to the classic literals, which are the correct values on every host below
   1.139; raising to 1.124 or 1.129 (June/July 2026) only deletes fallbacks and drops two years of hosts for it.
3. Rows 9-16 are named by no rule; the design chose the native `webview/context` menu over an in-webview popover,
   so anchor positioning never enters. Node 20 and the LM API are not design techniques.
4. Verification (row 19) is the one real argument for a jump, and it needs 1.138, not 1.90: decide it with N64 at
   the first 2.0.x release, as a CI matter, after the overhaul's captures exist.

What would flip it to **1.90**: the owner prefers one Chromium generation and Node 20 on every host (one lint
list of 10 entries, one scrollbar comment, keep-alive everywhere, no 18.19-declaration residual), at the price of
hosts 1.85–1.89 (Dec 2023–May 2024), which the listed peers already dropped. That is a preference, not a blocked
technique. Nothing in the reports justifies 1.110, 1.124, 1.129 or 1.141 for this design.

Conditional: if the UI-job probe shows that neither `scrollbar-color: auto` on the root nor
`scrollbar-color: <thumb> transparent` restores 10 px token scrollbars under VS Code's `@layer vscode-default`
stylesheet, V15 becomes a host limitation at every floor and the recommendation stands unchanged.

## 8. Not verified

- No render on Chromium 114 or 150 here (browser tools were off limits): the `scrollbar-color: auto` reset and the
  standard-property branch of V15 are hypotheses to probe (visual-audit.md:239-242).
- Electron for 1.91 was not fetched (the row carries the API fact only).
- Whether `@vscode/test-cli` could move to Mocha 12 on a Node 22 host (option C) was not tested.
- Whether `esbuild` lowers CSS nesting for `chrome114` was not run (row 12 is "authoring convenience" either way).
- The BCD versions for rows 9-16 are the lint's own entries (read 2026-10-15/16), not re-fetched today.

## 9. Evidence index (commands)

```
gh api repos/microsoft/vscode/commits/63cc68e088 --jq '{date:.commit.committer.date,files:[.files[].filename]}'  → 2026-02-04, themeing.ts
gh api repos/microsoft/vscode/commits/d97df0a --jq '{date:.commit.committer.date,message:...}'                     → 2026-06-05, "Add spacing size variables to theme sizes (#320073)", baseSizes.ts
gh api "repos/microsoft/vscode/commits?path=src/vs/platform/theme/common/sizes/baseSizes.ts&per_page=100"           → 9918f29df 2026-08-26, dd766a81f 2026-07-07, d97df0aaf 2026-06-05, 4ad9c7c87 2026-05-19, 7a366ac02 / e42fd56d3 2025-12-16
gh api repos/microsoft/vscode/compare/63cc68e...1.109.0 --jq .status  → diverged ; ...1.110.0 → 404 ; ...1.110.1 → ahead
gh api repos/microsoft/vscode/compare/d97df0aaf...1.123.0 --jq .status → diverged ; ...1.124.0 → ahead
gh api repos/microsoft/vscode/compare/dd766a81f...1.128.0 --jq .status → diverged ; ...1.129.0 → ahead
gh api repos/microsoft/vscode/compare/4ad9c7c87...1.121.0 --jq .status → diverged ; ...1.122.0 → ahead
gh api repos/microsoft/vscode/commits/<tag> --jq .commit.committer.date   → §1 dates
gh api repos/microsoft/vscode/releases/latest --jq '.tag_name + " " + .published_at' → 1.143.1 2026-10-22T23:04:14Z
node -e '…vscode-extension-tester/package.json…'  → 8.28.1 {"vscode-min":"1.138.0","vscode-max":"1.140.0"}
npm view @types/vscode versions --json  → …1.110.0 1.115.0 1.116.0 1.118.0 1.120.0 1.125.0 1.134.0 1.136.0 1.137.0 1.138.0 1.140.0
npm view @types/node@20.9 version       → 20.9.3 20.9.4 20.9.5 ; npm view @types/node@24 version → … 24.19.2
git grep -n -E '1\.85|node18|chrome114|Chromium 114|Node 18'   → the §5 touchpoints
```

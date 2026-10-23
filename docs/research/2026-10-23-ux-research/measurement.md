# nUIget UX overhaul — research dimension: measurement

Date 2026-10-22. Repository `/Users/mattias/github/nuiget`, `main` at `e4d6e97`, read-only. All scratch work (tools,
downloaded CI artefacts, crops) is under
`/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/research/`.

Question: which techniques let agents judge the visual quality of the two webviews without a human, how reliable each
is, what runs on the ubuntu CI lane versus a local macOS run, and what each costs. Ranked by signal-to-noise.

## 0. Answer first

1. **DOM geometry inside the webview is the backbone.** The suite already measures rects in the real VS Code webview
   and the numbers were **bit-identical across three CI runs** (two runner images, ubuntu-24.04 and ubuntu-26.04).
   Every layout defect of P9.fix-2..6 is a DOM relation, and so are V2, V3 and V5; V4 is one too once the
   right box pair is known (§2.3). Zero observed flake. Hard gate.
2. **The current tolerance lets V2 through.** `main-installed.ui.test.ts:101` asserts the primary button's right edge
   within **8 px** of the list's edge; CI logs **6 px** (320.19 vs 326.19) in all three runs. V2 is exactly that 6 px.
   `main-shell.ui.test.ts:82` uses 1 px for the left inset. Recommended: 1 px for any pair meant to align.
3. **Pixel diff is a regression detector, not a quality judge,** and it is far more stable than expected once it is
   cropped to the webview: 13 of 15 named states are **0 px different** across two runs at a 16/255 per-channel
   tolerance; the remaining noise is live nuget.org content, input caret/selection, VS Code toasts over the webview
   and Explorer content outside the webview. It becomes a hard gate only after masks or a fixture feed and a pinned
   VS Code.
4. **`VSBrowser.takeScreenshot` does return the whole window** (verified in ExTester source and the WebDriver spec),
   1280x900 at DPR 1 on the CI lane. Cropping the webview needs the outer iframe rect from the top document; the
   offset (348, 64.5) for the main panel is confirmed by matching DOM rects to PNG ink within 1 px.
5. **`--code_version 1.142.0` is a valid version string** (it is in `update.code.visualstudio.com/api/releases/stable`,
   latest is 1.143.0) and ExTester 8.28.1 accepts any listed version, but its supported range is **1.138.0–1.140.0**;
   `max` = 1.140.0 today and moves with every ExTester bump that Dependabot auto-merges. Pin an explicit version.
6. **Reduced motion is already signalled to the webview and ignored by it.** ExTester sets
   `workbench.reduceMotion: 'on'`; VS Code puts `vscode-reduce-motion` on the webview body; `tokens.css` reacts only
   to `@media (prefers-reduced-motion)`, which xvfb never reports. A reduced-motion capture needs no CDP if the product
   honours the body class (as the workbench does).
7. **Vision-model judging is the weakest signal** for V1–V5 (offsets of 2–8 px, below one 28 px visual patch; the
   vendor documents localisation as approximate). Use it only for holistic, rubric-based "does this read as a
   built-in view" review, cross-checked against DOM rects; never as a gate.
8. The **negative control** (HEAD's measurement suite against the `main` VSIX) is runnable with ExTester's split
   commands; the `main` VSIX exists as the `vsix` artefact of run 39042850237 until 2027-01-15.

### Ranked table (signal-to-noise, highest first)

| # | Technique | Catches (V1–V5, P9.fix) | False-positive sources | Flake sources (observed or expected) | Build (session-days) | Run cost (CI) | Lane | Gate |
|---|---|---|---|---|---|---|---|---|
| 1 | DOM relational geometry in the webview (alignment, centring, containment, gap equality and proximity, truncation, overlap) | V2, V3, V5, V4 (candidate rule); P9.fix-2..6 (all already DOM-measured); V1 only with rule 2 | rule written on the wrong box (card vs content, box vs ink); text-width rules across platforms | none observed: identical to 1/16 px in 3 runs, 2 OS images | 1.5–2.5 | +0.1–0.3 s per state (one `executeScript`) | ubuntu CI and macOS local (relational rules are platform-independent; text widths are not) | hard |
| 2 | Workbench-exemplar parity: the same measurements on the workbench's own controls in the same session (top document), compared with the webview's | V1 (squeezed tab bar / toolbar), native feel of heights, fonts, colours | choosing the wrong exemplar; workbench DOM classes change between VS Code versions | VS Code version float (`max`) | 1 | +2–5 s per run (open Extensions view / Settings once per theme) | both | hard for heights/colours, informational for paddings |
| 3 | axe-core in the real webview, full WCAG 2.2 A/AA ruleset, per named state and theme | none of V1–V5; accessibility regressions (names, roles, nesting, contrast, target size) | `color-contrast` incomplete below the fold (existing ruling); best-practice rules | state drift between themes (seen: 53 vs 25 nodes) | 0.5 | ~1–2 s per surface per state (estimate; today 2 rules on 2 surfaces = ~4 s per theme incl. the theme switch) | both | hard (violations), informational (incomplete) |
| 4 | Keyboard walk + accessibility snapshot per state | focus order, focus visibility, names; none of V1–V5 | intended skips (pointer helpers are not Tab stops, interaction model §2) | focus left in the workbench by a previous test | 1 | ~0.1–0.2 s per focus stop | both | hard |
| 5 | Pixel diff (pixelmatch) of the webview crop against a pinned baseline | any unintended change, including 1 px shifts; not quality | live feed content, caret, toasts, hover, VS Code version | measured: 0 px on 13/15 states after crop; live states 1.7k–46k px | 1–1.5 (+1–2 for a fixture feed) | ~0.2 s per image | ubuntu CI only (fonts and DPR differ on macOS) | informational until masks + pinned VS Code, then hard at 0 px |
| 6 | PNG ink analysis (gap and alignment-line profiles of the crop) | V1, V4, V5 as perceived (ink-to-ink), V2, V3 | glyph side bearings, icons, anti-aliasing | as pixel diff | 0.5–1 | <1 s per image | both (per-platform numbers) | informational |
| 7 | State-to-state layout shift of persistent chrome (DOM rects of header/search/tabs per state; Layout Instability API) | jumps between modes; P9.fix-2 class | intended mode changes | async enrichment | 0.5 | negligible | both | hard for chrome, informational for content |
| 8 | Theme x width x zoom matrix | multiplier for 1–6 (V3 and truncation appear at narrow widths) | — | theme switch timing | 0.5 | measured: theme switch + axe ~4 s, theme switch + screenshot ~5 s, sash drag + screenshot ~1 s | both | inherits |
| 9 | SSIM (ssim.js) | none reliably (global score; a few-px offset barely moves it) | — | — | 0.5 | <1 s | ubuntu | do not adopt |
| 10 | Vision-model judges (several judges, refuter, coordinates) | holistic "reads as built-in"; may name V1/V5 qualitatively; unreliable for 2–8 px offsets | hallucinated boxes, approximate coordinates (documented) | non-deterministic output | 1 | ~1.5k image tokens per full PNG, ~3.9k per 2x webview crop | anywhere | judge-only, never a gate |

Reduced-motion capture (item 10 of the task) and the two-tree negative control (item 6) are protocols around these,
covered in §10 and §6.

## 1. Facts about the CI lane (verified)

| Fact | Value | Evidence |
|---|---|---|
| VS Code under test | 1.140.0 stable (ExTester `max`) | `ui-job.log` of runs 39025149785, 39042850237, 39842190557: "Downloading VS Code: 1.140.0 / stable"; `node_modules/vscode-extension-tester/package.json:59-62` (`vscode-min` 1.138.0, `vscode-max` 1.140.0); `out/extester.js:299-311` maps `max` to `VSCODE_VERSION_MAX` |
| Chromium | 150 (ChromeDriver 150.0.7871.124) | same logs, "Downloading ChromeDriver 150.0.7871.124" |
| The capture run is not "1.105-era" | run 39025149785 also used 1.140.0 | `runs/39025149785/ui-job.log` line "Downloading VS Code: 1.140.0" |
| Runner image | ubuntu-24.04 (20261012.334.1) on 2026-10-17; **ubuntu-26.04 (20261012.163.1) on 2026-10-22** | "Image:" lines in the three job logs |
| Screen | `xvfb-run -a`, default server args `-screen 0 1280x1024x24` | `.github/workflows/ci.yml:286`; https://manpages.ubuntu.com/manpages/noble/man1/xvfb-run.1.html ("The default is '-screen 0 1280x1024x24'") |
| PNG size | 1280x900 for all 15 states | `sips` on every capture |
| DPR | 1: DOM px = PNG px | cross-check in §3.3 |
| Window size set by the suite | never | `grep -rn "setRect\|manage().window\|maximize" src/test/ui` → no hit; ExTester default `'window.newWindowDimensions': 'maximized'` (`out/util/codeUtil.js:188`) |
| Why 900 and not 1024 | not verified | — |
| UI job duration | 2:23–3:51 per job; tests "45 passing (2m)" | `gh run view <id> --json jobs` for 39042850237 (14:59:40–15:03:12), 39025149785 (10:33:03–10:36:53), 39842190557 (19:43:20–19:46:03) |
| Phase timings (39042850237) | VS Code download 3.1 s, archive check 6.5 s, unpack 9.3 s, ChromeDriver 0.3 s, prepublish build 22 s, package+install 2 s, browser start 4.6 s, tests 135.6 s (theme pass 42 s) | timestamped `ui-job.log` lines 250–414 |
| Per-step costs | theme switch + axe on 2 surfaces 4.0–4.3 s; theme switch + screenshot 5.1–5.3 s; sash drag to 200 px + screenshot 0.96 s; DOM measurement tests 63–302 ms | mocha durations in `ui-output.txt` of 39042850237 |
| ExTester default settings that matter | `workbench.reduceMotion: 'on'`, `workbench.hover.delay: 604800000` (workbench hovers only), custom title bar | `out/util/codeUtil.js:170-217` |
| Webview CSP | `default-src 'none'; img-src cspSource data:; style-src cspSource; script-src 'nonce-…'` | `src/host/services.ts:111-118` |
| `executeScript` runs under that CSP | yes: axe is injected with `driver.executeScript(AXE_SOURCE)` and its rules ran (passes counted) | `src/test/ui/v2/theme.ui.test.ts:147-149`; "passes {"color-contrast":53,…}" in the logs |
| Live data in the fixture | `nuget.org` v3 feed | `src/test/e2e/fixtures/e2e-workspace/nuget.config` |

## 2. Technique 1 — DOM measurement inside ExTester/Selenium

### 2.1 How the suite gets into the webview (verified)
- `enterMainWebview` (`src/test/ui/v2/mainWebview.ts:24-41`) and `enterSidebarWebview`
  (`src/test/ui/v2/sidebarWebview.ts:91-108`): from the top document, each `iframe.webview`, then its
  `iframe#active-frame`, recognised by the root test id (`nuiget-app`, `nuiget-sidebar`). Two webviews can be open in
  no fixed order; the test id disambiguates.
- Measurement is one `driver.executeScript` returning plain JSON from `getBoundingClientRect`, `getComputedStyle`,
  `scrollWidth`/`clientWidth` (`main-installed.ui.test.ts:73-99`, `main-shell.ui.test.ts:27-39`, `:70-79`,
  `sidebar.ui.test.ts:105-111`, `:136-143`, `mainWebview.ts:100-115`).
- What WebDriver returns: `executeScript` returns JSON-serialisable values; rects are CSS px of the **inner frame's**
  viewport (fractional: 320.1875, 566.953125 in the logs). `WebElement.getRect()` returns the rect relative to the
  current browsing context's document (used on workbench parts in `sidebar.ui.test.ts:54`, `:60`, `:64`).
- The iframe rect from the top document: `leaveWebview()` then `findElement(By.css('iframe.webview'))` →
  `getRect()` for the outer frame; inside it, `iframe#active-frame` → `getRect()`; the webview origin in window
  coordinates is the sum. Only the arithmetic is unverified in code; the result is verified by the PNG cross-check
  (§3.3), which gives (348, 64.5) for the main panel at the default layout.

### 2.2 Stability (verified, n = 3)
The `[P9.*]` log lines are identical in runs 39025149785 (`labs/2.0` at c50d335, ubuntu-24.04), 39042850237 (`main`
at e4d6e97, ubuntu-24.04) and 39842190557 (`ci/quieter-dependabot` at 2943aa3, ubuntu-26.04). The webview code is the
same in all three (`gh api …/compare` lists no `src/webview` file but a STATUS.md).

| Log line | Value in all three runs |
|---|---|
| `[P9.fix-5] details buttons` | uninstall/update left 566.953125, height 24 |
| `[P9.fix-3] check box centres` (Installed) | card 189.5 / check 189; card 268.5 / check 268 |
| `[P9.fix-4] uninstall-selected-button right edge` | button 320.1875, list 326.1875 (**6 px**) |
| `[P9.fix-2] transitive header` | headerTop 308, lastRowBottom 308 |
| `[P9.fix-6] left edges` | all six at 16 |
| `[P9.10] 200 px rows` | Newtonsoft.Json nameScroll 105 > nameWidth 100 (cut), Serilog 45/45 |
| axe passes | main 53/30 then 25/15, sidebar 15/9 |

Local runs (platform not recorded in STATUS) recorded the same relational values (rows 79 px, centres 0.5 px off, 6 px from the list edge, six
left edges at 16 px): `docs/plans/STATUS.md:138-141`. So relational DOM metrics agreed between CI and a local run for these
cases; text-width metrics (authors fit, name truncation) are font-dependent and were not compared.

### 2.3 What each V finding is, as a DOM rule
Numbers below come from PNG ink of `main-installed-single.png` / `main-transitive-expanded.png` (run 39025149785),
measured with `tools/ink.js` (§3.4), DPR 1 so PNG px = CSS px.

| Finding | Measured now | DOM rule that fails on it | Caveat |
|---|---|---|---|
| V1 tab bar and toolbar squeezed | tab underline ends y=158, button top y=163: **4 px**; buttons 24 px high (y 163–186) | heights and paddings of tab bar, toolbar buttons and section header equal to the workbench analogue measured in the same session (rule 2) | "squeezed" has no in-page reference; needs the exemplar |
| V2 Select all / Uninstall selected misaligned with each other and with the list | Uninstall right 320.19 vs list right 326.19 (**6 px**, CI log); `.nuiget-installed > .nuiget-toolbar { padding-inline-end: var(--nuiget-space-3) }` (`src/webview/main/main.css:190-194`) makes it so by design; the selected card ends ~24 px before the list border (crop `crops/inst-toolbar.png`) | right edge of the end-aligned button = right edge of the row card it aligns with, ≤1 px; left edge of Select all = row content left (already 16 = 16) | the 8 px tolerance at `main-installed.ui.test.ts:101` passes it |
| V3 "provisional" badge overlaps the list's right border | pixel row y=384 of `main-installed-all.png`: badge fill #616161 and its blue outline end at x=673, a 4 px #313131 divider band starts at x=674 and the details pane (#1f1f1f) at x=678: **0 px clearance**; the `net8.0` badge in `main-transitive-expanded.png` (y=300–310) also ends at x=673. Whether the badge continues under the divider (clipped) is a DOM question | containment: every visible descendant of a list keeps `right ≤ scrollport.right − inset` (inset = `--nuiget-space-2`, 4 px), no overlap with the scrollbar gutter | state is time-dependent ("provisional" until evaluation ends): the capture must wait for or force the state |
| V4 section header margins small above, large below | Direct header: toolbar bottom 186 → header text top 198 = **11 px**; text bottom 207 → first row ink 230 = **22 px** (unselected row, `main-transitive-expanded.png`), but only **7 px** to the selected card's background (`main-installed-single.png`). Transitive header in `main-transitive-expanded.png`: separator y=293, text band 297–314, selected card from 318: **3 px / 3 px**. The header box itself is symmetric: `min-height: var(--nuiget-row-height-compact)` with `align-items: center` (`src/webview/shared/primitives/primitives.css:451-455`); the asymmetry comes from the neighbours (toolbar padding above, the 78 px card's internal top padding below) | **candidate** proximity rule: gap(header → first content of its section) ≤ gap(previous content → header), on content boxes (icon, name text), not on the card | the two readings disagree, so which box pair matches the owner's perception is not established; the negative-control run (§6) must decide before the plan commits to a V4 rule |
| V5 spacing follows no single scale | ink gaps down the stack: 3, 2, 4, 11, 22 (and 7 to the selected card) | (a) every gap with the same role is equal ±1 px across the panel and both tabs; (b) role gaps come from a short list (e.g. intra-group `--nuiget-space-2`, inter-group `--nuiget-space-5`) | the scale itself (2, 4, 6, 8, 12, 16 + hairline, `tokens.css:14-23`) is so dense that "gap ∈ scale ±1" catches almost nothing: role consistency is the real rule. The static lint (`webview-stylesheets.test.ts:101`, every padding/margin/gap is a token) cannot see composed gaps |

### 2.4 Other DOM measurements worth having
- **Truncation**: `scrollWidth > clientWidth` on text that must not be cut (already: authors, sidebar names).
- **Overlap**: pairwise intersection of leaf boxes inside a row and a header; `document.elementFromPoint` at a box's
  corners to see what actually paints on top (cheap, frame-local).
- **Clipping**: a visible element whose rect exceeds an ancestor with `overflow != visible`.
- **Target sizes**: axe's `target-size` already measures 24 px in the real browser (theme pass); the static lint
  checks `--nuiget-target-min` (`webview-stylesheets.test.ts:109`).
- **Vertical centring**: icon, check box, name baseline against the card (already for the check box, ≤2 px).
- **Ink-like text boxes**: `Range.getBoundingClientRect()` on the text node gives the line box (with leading), closer
  to the perceived edge than the element box. Use it for V4/V5 gaps.

### 2.5 DPR, xvfb vs macOS
- CI: DPR 1 (1280x900 PNG equals the CSS viewport; cross-check §3.3).
- macOS local: not run in this research. A Retina display normally reports DPR 2 and WebDriver screenshots are in
  device pixels, so crops must multiply CSS rects by `window.devicePixelRatio` read in the top document
  (hypothesis, not verified). Fonts differ (macOS system font vs the Linux fallback), so pixel baselines and
  text-width rules are per-platform; relational rules are not.

### 2.6 Verdict
Hard gate. Build: a generic collector (`collectLayout(rootSelector)` returning role-tagged rects for header, search,
tabs, toolbar buttons, section headers, row content parts, badges, scroll ports) plus a rule library (align, centre,
contain, gap-equal, proximity, no-overlap, no-cut) and one call per named state: 1.5–2.5 session-days. Run cost:
0.1–0.3 s per state.

## 3. Technique 3/5/6 — screenshots: what they are, how stable, how to measure them

### 3.1 `takeScreenshot` returns the whole window (verified)
- ExTester: `VSBrowser.takeScreenshot(name)` = `this._driver.takeScreenshot()` written to
  `<storage>/screenshots/<start timestamp>/<name>.png` (`node_modules/vscode-extension-tester/out/browser.js:410-415`).
- selenium-webdriver 4.51.0: `takeScreenshot()` executes the W3C `SCREENSHOT` command
  (`node_modules/selenium-webdriver/lib/webdriver.js:1127-1129`).
- W3C WebDriver §17.1 (editor's draft, fetched https://w3c.github.io/webdriver/): "Let root rect be session's
  current top-level browsing context's document element's rectangle" — the top-level document, whatever frame the
  driver is in. The helper's comment says the same (`sidebarWebview.ts:45-48`).
- §17.2 Take Element Screenshot first "Scroll[s] into view the element": a side effect on virtualised lists. Prefer the
  window screenshot plus a crop.

### 3.2 Cross-run pixel stability (measured)
Method: a dependency-free PNG decoder and differ (`tools/png.js`, `tools/diff.js`; per-pixel max channel delta, a
stricter and simpler metric than pixelmatch). Runs: A = 39025149785 (the owner's capture set), B = 39042850237,
C = 39842190557 (ubuntu-26.04). Same webview code, same VS Code.

Whole window, tolerance 0:

| State | A vs B | B vs C | Cause of the difference |
|---|---|---|---|
| main-installed-single | 15 px, maxΔ 3 | 14 px, maxΔ 3 | anti-aliasing jitter |
| main-installed-single-light / -hc | 0–11 px, maxΔ 2 | 0–11 px | title bar jitter |
| main-installed-all | 2,543 px, maxΔ 203 at x 59–190 | same | Explorer shows an `obj/` folder in one run: outside the webview |
| main-quicksearch-open | 5,197 px | 5,195 px | input text selected in A, caret after the text in B (`crops/qs-A.png`) |
| main-quicksearch-versions | 2,055 px | 2,053 px | same |
| main-updates | 589 px, maxΔ 2 | 658 px, maxΔ 11 | sub-pixel jitter; maxΔ 11 in C in the header band (hover or transition, not identified) |
| main-browse-results | 2 px | 14,699 px | live download counts (9325.4M → 9558.9M, `crops/br-B.png` vs `crops/br-C.png`) |
| main-browse-details | 0 px | 3,838 px | live data |
| main-details-readme | 19 px | 146,624 px (12.7 %) | a third-party README badge failed to load in C ("Build status" alt text), shifting the README 7 px |
| sidebar-narrow-200px | 0 px | 14,767 px | three VS Code toasts over the main area in C |
| main-transitive-*, sidebar-sections, sidebar-update-all-dialog | 0–7 px, maxΔ ≤1 | 0–6 px | jitter |

Cropped to the main webview (348,66)-(1280,878), tolerance 16/255 per channel:

| Pair | States at 0 px | States not at 0 |
|---|---|---|
| A vs B (same image) | 13 of 15 | quicksearch-open 4,266, quicksearch-versions 1,746 (caret/selection) |
| B vs C (ubuntu-24.04 → 26.04) | 10 of 15 | browse-details 3,227, browse-results 4,914, details-readme 46,221 (live data), quicksearch x2 (caret), sidebar-narrow 5,006 (toasts) |

The sidebar crop (48,30)-(348,878) of the three sidebar states is 0 px A vs C.

Conclusion: the rendering itself (fonts, anti-aliasing) was stable across the runner image upgrade (n = 1); every
large difference is content or chrome, each with a known fix:

| Noise | Fix |
|---|---|
| live feed data (counts, READMEs, suggestions, update versions) | `ignoreMask` regions from DOM rects (`[data-testid="readme"]`, count spans), or a fixture feed (1–2 days; `nuget.config` points at nuget.org today) |
| caret blink and input selection | before capture: `document.activeElement.blur()` or `el.style.caretColor = 'transparent'` via CSSOM (allowed under the CSP; inline `<style>` is not, `services.ts:114`), and a defined selection state |
| VS Code toasts over the webview | run "Notifications: Clear All Notifications" (or Do Not Disturb) before each capture; the gotcha table already asks suites to dismiss notifications |
| workbench outside the webview | crop to the iframe rect |
| hover state where the pointer rests | move the pointer to a neutral point before capture (`driver.actions().move({x: 0, y: 0})`) |
| running transitions and animations | the existing `waitForTransitions`; or `document.getAnimations().forEach(a => a.finish())` for finite ones; reduced motion (§10) |
| time-dependent product states ("provisional") | wait for the state by its DOM marker before capture |
| VS Code version float (`max`) | pin `--code_version` (§7) |

### 3.3 DOM ↔ PNG cross-check (verified, DPR 1)
- Uninstall selected right edge: DOM 320.19 (webview) → PNG last ink column 667; 667 − 320 ≈ 347–348 → main webview
  x origin 348 (editor area left edge in the capture).
- Serilog check box: DOM centre y 268 → PNG ink y 326–339, centre 332.5 → y origin 64.5.
- Newtonsoft.Json check box: DOM 189 → PNG row band 215–293 (centre 254) → 65.
So `PNG = webview CSS px + (348, ~64.5)` at the default layout, within 1 px. A crop that uses the iframe rects will be
exact; the cross-check is also the verification step any vision-judge coordinate must pass (§9).

### 3.4 Ink analysis on the PNG (built for this research, `tools/ink.js`)
Row profile of `main-installed-single.png`, x 356–672, background #181818, tolerance 6:
`128–133` top border band, `137–153` tab labels, `156–158` tab underline, `163–186` toolbar buttons, `198–207`
section header text, `215–293` selected card. Column profile of the toolbar row: `364–448` Select all, `504–667`
Uninstall selected, `674–689` list border/scrollbar. These numbers are the V1/V2/V4/V5 evidence in §2.3. Ink analysis
works on any PNG (also on the 1.18.9 references, which are 1600 px JPEGs downscaled from an unknown DPR, so only
ratios are comparable: `docs/ux/reference-1.18.9/README.md`). Informational.

### 3.5 pixelmatch, pngjs, SSIM (versions verified with `npm view`, 2026-10-22)
| Package | Version | Notes |
|---|---|---|
| pixelmatch | 8.0.0 (published 2026-10-06), ISC, depends on pngjs ^7 | API `pixelmatch(img1, img2, output, width, height, options)`; `threshold` default 0.1 ("a per-pixel perceptual color difference, where 1 is the difference between black and white"); `includeAA` default false (anti-aliased pixels detected and ignored); `alpha` 0.1; `aaColor`, `diffColor`, `diffColorAlt`, `diffMask`; `checkerboard` true; **`windowSize`** (max differing pixels in any N×N window); **`ignoreMask`** (one byte per pixel, non-zero excluded). Colour distance OKLab + HyAB. All three images must have the same size. Source: README fetched from GitHub and `npm view pixelmatch@8.0.0 readme`. Which 7.x release introduced `windowSize`/`ignoreMask` is not verified (npm returns one README per package). |
| pngjs | 7.0.0 (2023), MIT, no deps | PNG decode/encode in Node |
| ssim.js | 3.5.0 (last modified 2022), MIT | `const { mssim } = ssim(img1, img2)`, default algorithm Weber; a global score |
| odiff-bin | 4.5.0 | native binary; not evaluated |
| @axe-core/webdriverjs | 4.14.0 (bundles axe-core ~4.14) | the suite injects `node_modules/axe-core/axe.min.js` (4.12.1) itself |

Tolerances for a pixel gate (recommended): pixelmatch `threshold: 0.1`, `includeAA: false`, compare only the webview
crop with `ignoreMask` for live regions, **fail on any mismatched pixel**. Basis: outside live content the measured
noise is ≤3/255 per channel (and 0 at 16/255), far under 0.1. A 1 px shift of a 24 px button changes roughly twice its
height in border pixels (≈ 48 px, analytic), so 0 is the meaningful threshold; `windowSize: 16` helps triage
(localised defect vs global drift). pixelmatch itself was not run here (not installed; no package was downloaded).

SSIM: a whole-image structural score; a V2-sized offset in a 932x812 crop changes it in the fourth decimal (not
measured; follows from the size of the affected area). Low signal for this purpose; do not adopt.

### 3.6 Alignment lines and layout shift
- **Alignment lines (PNG)**: histogram the left and right ink edges of the crop; dominant columns are the layout's
  lines; an element 1–8 px off a dominant line is a near-miss. Cheap, informational, false positives from glyph side
  bearings and icons. DOM near-miss scan is the better version: for every pair of left (right) edges in a region,
  flag 0.5 < |Δ| ≤ 8 px (would flag V2's 6 px).
- **Layout shift between states**: record rects of persistent chrome (title, search box, tab bar, toolbar) in every
  named state and assert equality across states (hard). The Layout Instability API
  (`PerformanceObserver` type `layout-shift`) is per-document and would also work inside the iframe; shifts within
  500 ms of WebDriver input are flagged `hadRecentInput`. Not tried.

## 4. Technique — axe-core in jsdom vs the real browser

- Version: axe-core 4.12.1 (`node -e require("axe-core/package.json").version`); 105 rules; `target-size` (the only
  `wcag22aa` rule) is **disabled by default** in axe 4.12.1, so the theme pass enables it explicitly
  (`theme.ui.test.ts:53-54`).
- **jsdom (Vitest, every primitive and feature test, 35 files)**: jest-axe 11.0.0 disables every `cat.color` rule
  (`color-contrast`, `color-contrast-enhanced`, `link-in-text-block`) because jsdom has no layout
  (`node_modules/jest-axe/index.js:6`, `:54-59`). jsdom has no `elementFromPoint`, so `aria-hidden-focus` ends incomplete
  unless `installFakeLayout()` is used (`src/webview/shared/primitives/testSupport.ts:1-8`, `:57`); `axeRuleOutcome`
  asserts a rule actually passed (`:76-80`). `target-size` and `scrollable-region-focusable` need real boxes and do
  not run meaningfully.
- **Real browser (UI job)**: `theme.ui.test.ts:43-65` injects axe into the webview frame and runs
  `runOnly: ['color-contrast', 'target-size']` on both surfaces under six themes, asserts zero violations, at least 10
  contrast passes, and incomplete only inside the details pane (`:157-174`). The full ruleset never runs in the real
  composition (virtualised lists, portals, the real CSP-loaded stylesheet).
- **State drift (verified)**: the main panel reports 53 contrast nodes in Dark Modern, Light Modern and Dark High
  Contrast, then 25 in the other three themes in every run. `expectContrastBorders` clicks the Installed tab after the
  Dark High Contrast axe run (`theme.ui.test.ts:216-218`, `:241-243`), so later themes measure a different state than
  earlier ones. A matrix cell must set its state explicitly.
- **Not covered by axe**: WCAG 1.4.11 non-text contrast (control borders, focus rings). Native-feel answer: assert the
  control's computed border colour equals the workbench token it aliases (the theme pass already does this for
  high-contrast borders, `theme.ui.test.ts:216-232`), not a ratio.
- Recommendation: per named state, run the full WCAG 2.0/2.1/2.2 A and AA tag set plus `best-practice` once in the
  default theme (hard on violations, allowlist with reasons), and keep the two-rule pass per theme. Cost estimate:
  1–2 s per surface per state (not measured for the full set).

## 5. Technique — vision-model judging (judge-only)

- Vendor documentation (https://platform.claude.com/docs/en/build-with-claude/vision, fetched): images are processed in
  28x28 px patches; cost `⌈w/28⌉ × ⌈h/28⌉` visual tokens; high-resolution tier (Claude 4.7 and later) up to 2,576 px
  long edge and 4,784 tokens. Limitations: "Spatial reasoning: Claude's coordinate and localization outputs are
  approximate." From the coordinates guide: small elements lose precision when downscaled; crop the region of interest.
- Cost: a 1280x900 capture = 46 x 33 = 1,518 tokens (not resized); a 2x crop of the main webview (1864x1624) = 67 x 58
  = 3,886 tokens. At the documented Opus 5.5 rate of $4 per million input tokens that is about $0.006 and $0.016 per
  image. A pass of 3 judges + 1 refuter over 15 states at 2x ≈ 233k image tokens ≈ $0.93 plus output, or the
  equivalent session quota.
- Reliability for this job: V2 (6 px), V3 (touching a 1 px border), V4 (11 vs 22 px) are smaller than one patch at 1x.
  Hypothesis (not measured): judges will describe V1/V5 qualitatively and miss or misplace V2–V4 without crops.
  Hallucinated boxes are a documented risk; non-determinism means two runs disagree.
- Design that makes it useful: (1) the rubric names concrete, checkable claims tied to workbench exemplars ("section
  header reads like the Explorer's section headers", "toolbar sits like the SCM view's action row"); (2) each judge
  returns defects as `{state, x1, y1, x2, y2, claim}` in pixel coordinates of the image it was given (vendor advice:
  ask for absolute pixel coordinates); (3) every box is mapped to DOM elements by the §3.3 offset and confirmed or
  rejected by a DOM measurement; unconfirmable claims stay "judge-only"; (4) an adversarial refuter sees the DOM
  numbers and tries to falsify each claim; (5) feed crops at 2x with DOM-derived guide lines drawn in, not raw
  windows. Rank: last. Never a gate. Use it to find candidate rules, then encode the rule in DOM.

## 6. Two-tree negative control: HEAD's suite against an arbitrary VSIX (verified commands, not run)

- `setup-and-run` always packages the working tree: `setupAndRunTests` → `setupRequirements` →
  `installVsix({ packageOptions })` with no file, which runs `vsce` (and `vscode:prepublish`) on the checkout
  (`node_modules/vscode-extension-tester/out/extester.js:239-263`, `:147-185`, `:277-283`). It cannot test another
  VSIX.
- The split commands can (`npx extest <cmd> --help`, ExTester 8.28.1):
  1. `npx tsc -p tsconfig.test.json` (HEAD's tests to `out/test/ui/v2`)
  2. `npx extest get-vscode -s /tmp/nuiget-ui -c 1.140.0`
  3. `npx extest get-chromedriver -s /tmp/nuiget-ui -c 1.140.0`
  4. `npx extest install-vsix -s /tmp/nuiget-ui -e /tmp/nuiget-ui/ext -f <path/to/old.vsix>` (`install-vsix` has
     no `-c`; it runs `code --force --install-extension … --user-data-dir=<storage>/settings`,
     `out/util/codeUtil.js:556-565`)
  5. `npx extest run-tests 'out/test/ui/v2/*.ui.test.js' -s /tmp/nuiget-ui -e /tmp/nuiget-ui/ext -c 1.140.0
     -o src/test/ui/settings.json -r src/test/e2e/fixtures/e2e-workspace`
- Pass `-e` to both install and run: without it ExTester gives no `--extensions-dir`, so the VSIX goes to VS Code's
  default extensions folder (`~/.vscode/extensions`), shared with any other VS Code on a local Mac (inference from
  `codeUtil.js:556-565`; not run).
- The control VSIX exists: run 39042850237 (`main` at e4d6e97) uploaded `vsix` (595,805 bytes, expires
  2027-01-15T14:56:03Z) (`gh api repos/gasrulle/nuiget/actions/runs/39042850237/artifacts`). Copy it somewhere durable
  before then, or rebuild it from the tag.
- Asymmetry to design around: HEAD's tests read repository files at run time: `tokenPx()` parses HEAD's
  `src/webview/shared/tokens.css` (`sidebarWebview.ts:15-22`), the fixture workspace and `settings.json` are HEAD's. A
  rule that compares against a token value then compares the old VSIX with HEAD's token. Rules for the negative control
  should be relational (align, contain, proximity) or carry their own constants.
- The 1.18.9 VSIX cannot be the control for HEAD's tests: test ids and DOM differ (1.x was deleted at P8.2).
- Expected outcome: on the `main` VSIX the V-rules fail with the numbers in §2.3 (V2 6 px, V3 badge at the border,
  V4 11 vs 22, V5 inconsistent gaps); on the overhaul VSIX they pass. The control proves the rules have teeth.

## 7. Pinning the VS Code version and caching it in CI

- `1.142.0` is a valid stable version: the list at https://update.code.visualstudio.com/api/releases/stable (fetched
  2026-10-22) starts `["1.143.0","1.142.0","1.141.2",…,"1.140.0",…]`.
- ExTester accepts any listed version: `loadCodeVersion` passes a literal through (`out/extester.js:299-311`) and
  `checkCodeVersion` only requires list membership (`out/util/codeUtil.js:820-827`); the download URL is
  `https://update.code.visualstudio.com/<version>/linux-x64/stable` (`:411`). It prints an "outdated version" warning
  for anything but the newest (`:403-406`).
- ExTester 8.28.1 (latest on npm, 2026-10-05) supports **1.138.0–1.140.0**. Using 1.142.0 is outside its tested
  range; whether `@redhat-developer/locators` work there (Activity Bar, quick input for the theme picker) is not
  verified. ExTester's minimum is far above the product's 1.85 baseline (Chromium 114, D10): visual measurement runs
  only on Chromium 150; the 1.85 guard stays with the CSS baseline lint and the `E2E (1.85.0)` job.
- `max` floats: the npm group `minor-and-patch` bumps ExTester weekly and auto-merges a green PR
  (`.github/dependabot.yml:15-30`, the auto-merge workflow). Any pixel baseline then breaks or drifts on a bot merge.
  Pin `--code_version` explicitly in `test:ui` (`package.json:310`) and treat a VS Code bump as a deliberate item that
  regenerates baselines.
- Cache layout under `--storage /tmp/nuiget-ui`: `<ver>-stable.tar.gz` (kept unless `--no_cache`), `VSCode-linux-x64/`,
  `<cdver>-chromedriver-linux64.zip`, `chromedriver-linux64/chromedriver` (`out/util/driverUtil.js:106`, `:140-150`),
  plus per-run `settings/` (wiped at start, `browser.js:124-128`), `screenshots/`, `crashes/`, logs. ExTester skips the
  download when `VSCode-linux-x64` reports the requested version ("VS Code exists in local cache", `codeUtil.js:408`,
  `:492`). Cache only `VSCode-linux-x64/` and `chromedriver-linux64/`, key on version + `runner.os` + image.
- Saving: download 3.1 s + archive check 6.5 s + unpack 9.3 s ≈ 19 s per run, minus the cache restore of a ~350 MB
  tree (not measured). The value is version stability and fewer N37 download failures, not speed.

## 8. Two .NET SDKs for an Unsupported fixture

- `actions/setup-dotnet` README (v6, fetched): multi-line input
  ```yaml
  - uses: actions/setup-dotnet@<sha> # v6
    with:
      dotnet-version: |
        8.0.x
        10.0.x
  ```
  The default `dotnet` is the latest installed unless a `global.json` pins one; `global-json-file` and
  `dotnet-version` together install both.
- `global.json` (https://learn.microsoft.com/en-us/dotnet/core/tools/global-json, fetched): `version` needs a full
  version, no wildcard; `disable` "Doesn't roll forward; an exact match is required"; `latestFeature` "Uses the
  highest installed feature band and patch level that matches the requested major and minor". With `8.0.x` the
  installed patch changes over time, so `rollForward: disable` breaks whenever setup-dotnet resolves a newer 8.0.
  Use `{"sdk": {"version": "8.0.100", "rollForward": "latestFeature"}}`.
- The existing `src/core/project/__fixtures__/sdk8/global.json` is `8.0.425` with no `rollForward` (default `patch`).
- Trap: when SDK resolution fails, `ProjectContextProvider.sdk()` returns `undefined` and the project is treated as
  supported (`src/core/project/context.ts:61-63`, `:66-72`). A missing 8.0 SDK therefore yields a normal-looking
  project, not the Unsupported banner. The capture must assert the banner's DOM marker before the screenshot.
- Not verified: .NET 8 on the ubuntu-26.04 image that `ubuntu-latest` now resolves to.

## 9. Accessibility tree snapshots and keyboard paths

- selenium-webdriver 4.51.0 exposes `WebElement.getAriaRole()` and `getAccessibleName()` (W3C computed role and label,
  `node_modules/selenium-webdriver/lib/webdriver.js:3007-3019`); they act on elements of the current frame, so they
  work inside the webview. One round trip per element.
- `driver.sendDevToolsCommand` / `sendAndGetDevToolsCommand` exist on the Chrome driver
  (`node_modules/selenium-webdriver/chromium.js:725-747`) and ExTester builds a Chrome driver (`browser.js:206-220`).
  Whether ChromeDriver routes `goog/cdp/execute` to the webview's out-of-process frame, so that
  `Accessibility.getFullAXTree` sees the webview, is **not verified** (search found nothing; Selenium documents the
  endpoint as unstable).
- Frame-safe alternative: inject axe (already done) and call `axe.setup()` then `axe.commons.text.accessibleText(el)`
  and the role helper per element in one `executeScript` (`axe.d.ts:527-531` types `accessibleText`; `getRole` exists
  in `axe.js` but is untyped). One call per state.
- Keyboard walk: the suite already drives keys into the webview's focused element
  (`main-shell.ui.test.ts:53-61`, `theme.ui.test.ts:266-271`). A walker presses Tab from the search box, records per
  stop `{testid, role, name, rect, matches(':focus-visible'), outline width/colour}` until focus leaves the webview,
  and asserts the order and a visible ring at every stop. The interaction model has no Tab-order table to assert
  against (§2 mentions only that pointer helpers are not stops): a gap for the UX dimension.

## 10. Reduced motion

- ExTester sets `'workbench.reduceMotion': 'on'` and explains that xvfb does not report the OS preference
  (`out/util/codeUtil.js:198-203`).
- VS Code sends `reduceMotion: this._accessibilityService.isMotionReduced()` to every webview
  (`out/vs/code/browser/workbench/workbench.js` in the local 1.142.0 web bundle) and the webview host adds
  `vscode-reduce-motion` to `body` (`out/vs/workbench/contrib/webview/browser/pre/index.html:501-516`, same bundle).
  Desktop 1.140 was not opened; the file is shared by the desktop build (inference).
- nUIget's only reduced-motion rule is `@media (prefers-reduced-motion: reduce)` in `src/webview/shared/tokens.css:226-229`
  (the lint pins exactly one, `webview-tokens.test.ts:82-86`); nothing reads `vscode-reduce-motion`
  (`grep -rn "vscode-reduce-motion" src` → none). So in the UI job the workbench is in reduced motion and the webviews
  are not, which is why the theme pass waits for transitions (`theme.ui.test.ts:109-115`).
- Native answer: honour `body.vscode-reduce-motion` as well; then a reduced-motion capture is a settings toggle
  (`workbench.reduceMotion` on/off) with no CDP. CDP `Emulation.setEmulatedMedia` on the top-level target would have to
  reach the webview's frame: not verified (same OOPIF question as §9).

## 11. Theme x width x zoom matrix

- Themes: the six-theme picker loop exists (`theme.ui.test.ts:21-28`, `:70-91`); ~3–4 s per switch.
- Width of the side bar: `dragSideBarTo` drags the workbench sash with the actions API and polls the part width
  (`sidebar.ui.test.ts:51-74`); 0.96 s for the 200 px capture. The same helper sets the main panel width indirectly
  (the editor gets 1280 − 48 − side bar), or hide the side bar for the widest case.
- Window size: never set; options are `xvfb-run -s "-screen 0 WxHx24"` and `driver.manage().window().setRect()`;
  whether `setRect` resizes the Electron window under xvfb without a window manager is not verified.
- Density: there is no density setting (`package.json` contributes four settings: `quickSearchResultsPerSource`,
  `searchDebounceMode`, `searchResultLimit`, `enablePerformanceLogging`); compact vs comfortable is per surface (D15).
  The workbench lever is zoom (`View: Zoom In/Out`), which changes the webview's devicePixelRatio (not verified).
- Cost model (estimate from measured steps): 6 themes x (switch 3–4 s + 15 states x 2 widths x ~1.5 s set-up and
  measure) ≈ 5 min on top of today's ~2.3 min of tests. Order loops theme → width → state to minimise switches; set
  each state explicitly (the drift in §4 is what happens otherwise).

## 12. Recommended rules and tolerances (for the plan)

| Rule | Measurement | Tolerance | Basis |
|---|---|---|---|
| R1 Align | edges meant to coincide (left inset; end-aligned button vs card or list) | ≤ 1 px | observed values are exact (16 = 16; 1/16 px granularity); current 8 px admits V2 |
| R2 Centre | centre of check box, icon, text block vs its card | ≤ 1 px | observed 0.5 px from a 79 px card |
| R3 Contain | visible children inside the scroll port minus `--nuiget-space-2` | ≥ 0 px clearance after the inset (−0.5 px sub-pixel slack) | V3 |
| R4 Proximity (candidate) | gap(header → own first content) ≤ gap(previous content → header), on content/Range rects | rule; confirm against the negative control first | V4 (11 vs 22 to ink; 3 vs 3 to visible box edges) |
| R5 Same-role gaps | all gaps of one role equal | ≤ 1 px | V5 |
| R6 Workbench parity | heights of tab bar, toolbar buttons, inputs, section headers vs the workbench analogue in the same session | ≤ 1 px (heights), equal computed colours | V1, owner direction |
| R7 No cut | names and authors at default width: `scrollWidth ≤ clientWidth` | 0 | P9.fix-3, P9.10 |
| R8 Chrome still | persistent chrome rects equal across states | ≤ 0.5 px | layout shift |
| R9 Pixel regression | pixelmatch threshold 0.1, includeAA false, webview crop, live regions masked | 0 mismatched px | §3.2 noise floor |
| R10 axe | full A/AA + best-practice per state; contrast + target-size per theme | 0 violations; incomplete only in the details pane | existing ruling |

## 13. Verified / not verified

Verified (command, file or fetched page cited above): takeScreenshot = whole window; PNG 1280x900, DPR 1 by
cross-check; VS Code 1.140.0 / Chromium 150 in all three runs; ubuntu-26.04 in the newest run; DOM numbers identical in
three runs; pixel stability numbers; 1.142.0 in the stable list; ExTester range 1.138–1.140 and its acceptance logic;
`setup-and-run` always packages the checkout; install/run commands and flags; the `vsix` artefact and its expiry;
setup-dotnet multi-line syntax; global.json roll-forward semantics; `context.ts` failure path; jest-axe colour rules
off; axe `target-size` off by default; axe state drift; reduce-motion signal path (1.142 web bundle) and the product's
media-query-only rule; CSP; selenium's `getAriaRole`/`getAccessibleName`/`sendDevToolsCommand`; vision token formula
and documented limits; pixelmatch 8.0.0 options.

Not verified: why the window is 900 px tall; macOS DPR and pixel behaviour (no local run); ChromeDriver CDP reach into
the webview frame (AX tree, media emulation); `setRect` under xvfb; zoom effect on webview DPR; ExTester locators on
1.142.0; .NET 8 on ubuntu-26.04; per-version availability of pixelmatch's `windowSize`/`ignoreMask`; the cost of the
full axe ruleset; vision-judge accuracy on these captures (no controlled experiment); the cause of the maxΔ 11 band in
`main-updates.png` of run C.

## 14. Files produced
- `tools/png.js`, `tools/diff.js`, `tools/crop.js`, `tools/ink.js` (dependency-free PNG decode, diff, crop, ink
  profile)
- `runs/<id>/ui-output.txt`, `runs/<id>/ui-job.log`, `runs/<id>/shots/…` (CI artefacts of 39025149785,
  39042850237, 39842190557)
- `crops/*.png` (2x crops cited above)

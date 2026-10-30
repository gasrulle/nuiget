# Artboard export: HTML to PNG at a controlled width

Proven locally on 2026-10-23 (VS Code 1.142.0, ExTester 8.28.1, macOS, throwaway worktree). The proof files are in
`docs/design/export-proof/` (the test as `.txt` so no suite runs it, the crop and measure tools, the proof artboard
and two PNGs). Gate 0, the route on the ubuntu `ui` job, was met by UX-P0.27a's runs 40054578187 and 40055485738 (VS Code
1.140.0, Linux).

## The renderer (UX-P0.27)

- **The manifest** `src/test/ui/v2/artboards.ts` (`ARTBOARDS`) lists each artboard: the named state it draws, its page under
  `docs/design`, the panel's test id (the clip), a `sample` element filled with one saturated colour, its themes, looks
  and widths (`{ panel, viewport }`: the panel's width at that viewport, checked to ±0.5 px). Today it holds artboard A
  (`main-installed-single`, Dark Modern, both looks, panel 932 at viewport 1280).
- **The suite** `src/test/ui/v2/capture/zz-artboards.ui.test.ts` renders every width, theme and look by the route below
  and writes `artboards/<state>.<theme>.<width>.png` (the capture naming of `states.ts`: `<theme>-classic` for the classic
  look) and `artboards/<state>.spec.json` for the entry's first theme and width. The `ui` job runs it after the capture
  suite; only that job's artifact is copied into `docs/design/artboards/`.
- **The script** `node scripts/render-artboards.mjs [--states …] [--themes …] [--looks …] [--storage <dir>]` compiles the
  suites, fetches the pinned VS Code and ChromeDriver and runs the suite alone, with `--extensions_dir <storage>/extensions`;
  it lists the renders of `<storage>/screenshots/artboards/` with their sha256. A render off the `ui` job is never committed.
- **The colour sample.** For each render the page names a point inside the `sample` element where the element itself is
  hit, and its computed background (opaque, its channels at least 32 levels apart); after the PNG is written its pixel
  there must equal that colour within one level per channel, or the test fails ("colour profile mismatch"). A sample that
  cannot be measured fails too.

## The route

1. A static server serves the artboard directory on `127.0.0.1` (P0: `node scripts/serve-artboards.mjs`, a wrapper so
   the allowlist needs no `python3` rule).
2. An ExTester test opens VS Code's **Integrated Browser** (the palette entry "Browser: Open Integrated Browser",
   selected by its exact label; "Simple Browser: Show" is hidden on desktop and hands off to the same command), types
   the artboard URL into the quick pick and confirms.
3. The page is an Electron `WebContentsView`, outside the workbench renderer: a whole-window screenshot never contains
   it and there is no `iframe.webview` chain. ChromeDriver lists the page as a **second window handle**;
   `driver.switchTo().window(handle)` enters it, and from there the artboard's rect is read in page coordinates.
4. `driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1 })`
   sets the viewport width and DPR 1 (locally the display is DPR 2); `Page.captureScreenshot` with `clip` = the
   artboard rect, `scale: 1`, `captureBeyondViewport: true` returns the PNG, pixel-identical to a crop of the page
   screenshot. Themes and widths loop by `location.assign(url + '?theme=…')` and a new emulation call.

## Measured

| Fact | Value |
|---|---|
| Rect | `{x: 0, y: 0, w: 932, h: 420}` at page zoom 100 %; nothing scaled |
| 1:1 proof (DPR 1) | header block 28 rows, row block 72 rows, button 120 columns, 16 px grid period, 1 px frame |
| DPR 2 (no emulation) | every value exactly ×2 (1864×840 PNG) |
| Determinism | byte-identical run to run at a fixed viewport; 932 vs 1280 viewports differ by ≤ 1 channel level in 452 pixels (P0 tolerance ±1) |
| Time | ChromeDriver boot ~2 s, open browser ~2 s, page ~0.7 s, per width ~60 ms, per theme ~30 ms, per clip ~50 ms; 5–6 s per run |

## Caveats P0 must handle

- **Colour profile.** Locally saturated colours come out in the display profile (`#04395e` → `#1b395c`,
  `#0078d4` → `#3e78ce`); greys are exact. The Chromium switch `--force-color-profile=srgb` cannot be passed through
  ExTester, and the portable `argv.json` route crashed the session. P0.27a's `measure.mjs` read `#04395e` exactly from
  the ubuntu `ui` job's renders; since UX-P0.27 the renderer's colour sample checks every render (the closing commit of
  UX-P0.27 records its runs' `[artboard]` lines in `docs/plans/handoff/P0.27.md`), so a host whose profile moves the token
  fails the export.
- **Fonts.** The theme dumps carry the measuring host's own family (VS Code 1.140.0 on the ubuntu `ui` job, UX-P0.14:
  `system-ui, "Ubuntu", "Droid Sans", sans-serif`), so the artboard and the product render in one face on the `ui` job; a
  local render still differs. Reproducibility is CI-to-CI, never local-to-CI (same rule as the goldens).
- **Upgrade risk.** The route depends on ChromeDriver listing the `WebContentsView` page as a window handle; a VS Code
  or ChromeDriver bump can change that. The fallback is a tiny test extension that opens the artboard in a webview
  panel (frames inside the workbench renderer, the real `--vscode-*` variables injected), not implemented.
- **Home directory.** ExTester launches VS Code without `--extensions-dir`, so UI runs use `~/.vscode/extensions`
  and VS Code writes `~/.vscode/argv.json` (seen dated 2026-10-16). The `ui` job (since UX-P0.7), the `test:ui*`
  scripts (since UX-P0.8) and `scripts/render-artboards.mjs` (UX-P0.27) pass `--extensions_dir <storage>/extensions`, so
  nothing lands in the home directory's extensions folder.

## Commands that worked (macOS, worktree)

```bash
cd <artboard dir> && python3 -m http.server 8765 --bind 127.0.0.1
```

```bash
cd /tmp/nuiget-ux-probe && npx tsc -p tsconfig.test.json && NUIGET_EXPORT_OUT=<out> npx extest run-tests out/test/ui/v2/zz-export.ui.test.js --code_version 1.142.0 --code_settings src/test/ui/settings.json --open_resource src/test/e2e/fixtures/e2e-workspace --storage /tmp/nuiget-ui
```

The test reads `NUIGET_EXPORT_URL`, `NUIGET_EXPORT_WIDTHS` (default `932,1280`) and `NUIGET_EXPORT_THEMES`
(default `dark-modern,light-modern`).

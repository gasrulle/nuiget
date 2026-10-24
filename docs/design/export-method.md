# Artboard export: HTML to PNG at a controlled width

Proven locally on 2026-10-23 (VS Code 1.142.0, ExTester 8.28.1, macOS, throwaway worktree). The proof files are in
`docs/design/export-proof/` (the test as `.txt` so no suite runs it, the crop and measure tools, the proof artboard
and two PNGs). P0 turns this into `scripts/render-artboards.mjs`; its gate 0 is one green run of the proof test on the
ubuntu UI job, because the route is verified on macOS only.

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
  ExTester, and the portable `argv.json` route crashed the session. CI on Linux is expected to be sRGB but is
  unverified: the renderer samples one saturated token pixel per capture and fails loudly on a mismatch.
- **Fonts.** The theme dumps carry the measuring host's own family (VS Code 1.140.0 on the ubuntu `ui` job, UX-P0.14:
  `system-ui, "Ubuntu", "Droid Sans", sans-serif`), so the artboard and the product render in one face on the `ui` job; a
  local render still differs. Reproducibility is CI-to-CI, never local-to-CI (same rule as the goldens).
- **Upgrade risk.** The route depends on ChromeDriver listing the `WebContentsView` page as a window handle; a VS Code
  or ChromeDriver bump can change that. The fallback is a tiny test extension that opens the artboard in a webview
  panel (frames inside the workbench renderer, the real `--vscode-*` variables injected), not implemented.
- **Home directory.** ExTester launches VS Code without `--extensions-dir`, so UI runs use `~/.vscode/extensions`
  and VS Code writes `~/.vscode/argv.json` (seen dated 2026-10-16). The harness writes into the owner's home; P0
  passes `--extensions-dir` under the storage directory and records it.

## Commands that worked (macOS, worktree)

```bash
cd <artboard dir> && python3 -m http.server 8765 --bind 127.0.0.1
```

```bash
cd /tmp/nuiget-ux-probe && npx tsc -p tsconfig.test.json && NUIGET_EXPORT_OUT=<out> npx extest run-tests out/test/ui/v2/zz-export.ui.test.js --code_version 1.142.0 --code_settings src/test/ui/settings.json --open_resource src/test/e2e/fixtures/e2e-workspace --storage /tmp/nuiget-ui
```

The test reads `NUIGET_EXPORT_URL`, `NUIGET_EXPORT_WIDTHS` (default `932,1280`) and `NUIGET_EXPORT_THEMES`
(default `dark-modern,light-modern`).

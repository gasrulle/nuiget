# docs/design

The nUIget Design System and the decisions of the UX initiative. Read `design-system.md` before changing anything a
user sees in the webviews; cite its rule ids in commits and tests.

## What the folder holds

| File | What it is | Edited how |
|---|---|---|
| `design-system.md` | The reference: 83 rules (`DS-*`) bound to the ExTester probe of VS Code 1.142.0, the colour roles, type scale, iconography, density, the look switch, the overflow table, the state matrix with its test-id markers, microcopy, motion, each component's accessibility contract, the CSS baseline and the lint changes the implementation needs, and the decisions taken by the closest-to-the-workbench rule | By hand, in the change that alters a rule; a new number needs its probe field first |
| `tokens.json` | Every `--nuiget-*` token (173) with its declaration, its Modern UI declaration where the looks differ, its `--vscode-*` role and fallback chain, and its value resolved per theme from the probe dumps; the schema is in its `$comment` | Generated, never by hand |
| `tokens.css.draft` | The proposed `src/webview/shared/tokens.css`, generated from the same spec as `tokens.json` (`.draft` so no lint reads it) | Generated; the implementation item copies it into `src/` and widens the lints as `design-system.md` §12 lists |
| `tools/spec.mjs`, `tools/build.mjs` | The token generator: the spec (one entry per token: declaration, Modern UI declaration, forced colour, usage, rule ids) and the build that writes `tokens.json`, `tokens.css.draft` and the artifact's token lists | By hand (the spec); the build is run, never its outputs edited |
| `themes/<slug>.css` | The resolved `--vscode-*` variables of the main-panel webview under the six default themes (Dark and Light Modern, Dark and Light High Contrast, Dark and Light 2026), as CSS for artboards and previews | Generated from the theme dumps |
| `DECISIONS.md` | Every decision of the initiative: owner rounds and rulings by rule | By the planning session |
| `artifacts.md` | The claude.ai artifacts of the initiative and their committed counterparts | By the planning session |
| `export-method.md`, `export-proof/` | How an HTML artboard becomes a PNG at a controlled width | By the export proof |
| `judge-rubric.md` | The rubric of the judge step | By the judge-rubric step |

The table lists the files present when the Design System was written; later steps add their own rows.

## How the files relate

- The committed files are the reference. The claude.ai "nUIget Design System" artifact (listed in `artifacts.md`) is
  the owner's viewing copy: its colour, spacing, radius and size lists are generated from the token spec that also
  writes `tokens.json`; its README, type styles and component cards were written from these files. When the two
  disagree, these files win and the artifact is republished.
- `design-system.md` states the rules and cites tokens by name; `tokens.json` gives each token's value and resolution;
  `tokens.css.draft` is the CSS form of `tokens.json`. Rule ids are stable: a rule changes its text, never its id.
- `themes/*.css` and `tokens.json` come from the same theme dumps; artboards load a theme file and `tokens.css` to
  render in a given theme without VS Code.

## Regenerating the theme dumps

The dumps came from a one-off ExTester probe (`probe/zz-probe.ui.test.ts.txt` in this folder, stored as `.txt` so no
suite runs it; `docs/research/2026-10-23-ux-research.md` §3 describes the runs); the plan's P0 harness item turns it into a
committed step. Until then:

1. In a throwaway worktree (never on `labs/2.0`), copy the probe test into `src/test/ui/v2/` and run it:
   `NUIGET_PROBE_OUT=/tmp/nuiget-probe npm run test:ui -- --storage /tmp/nuiget-ui` (the short storage path avoids
   the macOS socket-length limit). It writes `themes/<slug>.json` (every `--vscode-*` property on the webview root,
   the body class and fonts) and the workbench and nUIget measurements.
2. For the Modern UI run, add `"workbench.experimental.modernUI": true` to the settings file the script passes as
   `--code_settings` (`src/test/ui/settings.json`); ExTester writes `modernUI: false` by default and the settings file
   is merged on top. Check `workbench/*.json` `__document.workbenchClass` contains `modern-ui`.
3. Record the VS Code version the run used (`--code_version max` resolves to the newest ExTester supports) and pin it
   in the file headers.
4. Convert each `themes/<slug>.json` into `themes/<slug>.css` (one `--vscode-*: value;` per line in `:root`, the body
   class and theme kind in the header comment), then regenerate `tokens.json`, `tokens.css.draft` and the artifact
   lists, and diff: a changed value is a theme change to review, never a hand edit.

The generator is committed: `docs/design/tools/spec.mjs` holds one entry per token (declaration, Modern UI declaration,
forced colour, usage, rule ids) and `docs/design/tools/build.mjs` writes the outputs:
`node docs/design/tools/build.mjs <dir> <timestamp>` reads `<dir>/probe/out/themes/*.json` and
`<dir>/probe/out-modern/themes/*.json`, then writes `<dir>/repo/docs/design/tokens.json`, `tokens.css.draft` and
`<dir>/design/ds-artifact/project/tokens.json` (the layout of the design session's scratch directory; adjust the four
`join(S, …)` paths in `build.mjs` when running it elsewhere). A token change is made in the spec, never in the outputs.

## Exporting an artboard

See `export-method.md`: VS Code's Integrated Browser driven by ExTester (the page is a second ChromeDriver window), `Emulation.setDeviceMetricsOverride` for width and DPR 1, `Page.captureScreenshot` with `clip`; proven at 1:1 on 2026-10-23 (`export-proof/`), CI unverified until P0.27's gate 0.

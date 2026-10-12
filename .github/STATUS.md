# STATUS — .github (agent resources and repo-level items)   commit 24cf07b (parent of the P0.6 commit)   2026-10-12T08:35:00Z

git status --short: ` M esbuild.mjs`, ` M package.json`, ` M .vscode/launch.json`, ` M .vscode/tasks.json`,
` M .github/copilot-instructions.md`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md`, ` M .github/STATUS.md`,
`?? src/extension.next.ts`, `?? src/webview/main/`, `?? src/webview/sidebar-next/` (all belong to the P0.6 commit)

Item: **P0.6 Build switch**. This file is the handoff note for plan items without a `src/` directory of their
own. The P0.5 note it replaces is in commit `24cf07b`.

## Verified by running

```text
baseline npx tsc --noEmit   → exit 0, no output
baseline npx eslint src     → exit 0, no output
baseline npx vitest run     → Test Files 40 passed (40) · Tests 1491 passed (1491)
node esbuild.mjs --production          → [production] Build complete; dist: extension.js, webview.js, sidebar.js
                                         (+ webview.css, sidebar.css); placeholder text absent      (item gate)
node esbuild.mjs --v2                  → [development] Build complete; dist: extension.js, webview.js, sidebar.js;
                                         "nUIget 2.0 is not wired yet" ×1 in extension.js, "2.0 shell" ×1 in each
                                         webview bundle                                             (item gate)
node esbuild.mjs --v2 --production     → exit 0 (799 / 223600 / 223608 bytes)
node esbuild.mjs --production --analyze → exit 0
    dist/extension.js 272655 / 299921 · dist/webview.js 546077 / 600685 · dist/sidebar.js 276451 / 304097
node esbuild.mjs --v2 --production --analyze → exit 0
    dist/extension.js 799 / 299921 · dist/webview.js 223600 / 600685 · dist/sidebar.js 223608 / 304097
node esbuild.mjs --analyze             → exit 0, sizes printed, "Note: ceilings apply to --production output."
throwaway copy with the extension ceiling set to 1, --production --analyze
                                       → "Bundle ceiling exceeded: dist/extension.js", exit 1 (copy removed)
ls dist/*.meta.json                    → no match (metafiles are in out/esbuild/)
npx tsc --noEmit            → exit 0, no output
npx eslint src              → exit 0, no output
npx eslint scripts esbuild.mjs → 0 errors, 9 no-console warnings in esbuild.mjs (informational; P0.7 adds the
                              override for build scripts and makes this a gate)
npx vitest run --project frontend src/webview/main src/webview/sidebar-next → Test Files 2 passed (2) · Tests 4 passed (4)
npm test                    → Test Files 42 passed (42) · Tests 1495 passed (1495)
npm run bench               → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npm run package:vsix        → exit 0 · DONE Packaged: nuiget-v1.18.9.vsix (20 files, 528.51 KB); the packaged
                              dist is the legacy build
npx vsce ls                 → 18 files; 0 meta.json, 0 under src/, out/ or scripts/
npm run test:ui             → SKIPPED: not in the plan §2.2 gate list for this item; the default (legacy) build
                              is byte-identical in size to the pre-change build
```

## Done (tested)

- `esbuild.mjs`: quarry port (targets `node18` / `chrome114`, `webviewBundle` helper, metafile analysis) plus
  `--v2` entry selection and `BUNDLE_CEILINGS`. `--v2` composes with `--watch`, `--production`, `--analyze`.
- Ceilings: 1.18.9 minified sizes 272655 / 546077 / 276451 bytes (extension / webview / sidebar), identical
  before and after adding the targets, times 1.1 rounded up: 299921 / 600685 / 304097.
- `package.json`: `watch` lists its two scripts explicitly; new `watch:esbuild:v2` and `watch:v2`.
- `.vscode/launch.json` "Run 2.0" and `.vscode/tasks.json` `watch:v2` + `npm: watch:esbuild:v2` (problem
  matcher and presentation verified equal to the legacy task by script).
- `src/webview/main/index.tsx`, `src/webview/sidebar-next/index.tsx` with one test file each.

## Done (untested)

- `src/extension.next.ts`: built by `--v2` and present in the bundle, but no unit test. The backend vitest
  project includes `src/services/**/*.test.ts` and `src/extension.test.ts`, and the latter does not exist, so a
  `src/extension.next.test.ts` would never run. P0.11's tracker note asks for the include; P2.10 writes the test.
- The "Run 2.0" launch configuration and the two tasks: valid JSON and structurally equal to the legacy pair,
  but not exercised, because no VS Code is installed on this machine.
- `.claude/rules/core-boundaries.md` did not announce itself when the first 2.0 files were written in the
  session that created it. Check in a fresh session that it loads for `src/extension.next.ts`.

## Not started

- P0.7: ESLint fences, allow-list test, lint for `scripts/` and config files.

## Deviations from contract/ADR (file:line each)

- `.vscode/tasks.json:44-80`: not in the item's output list. Added on advisor approval (below): in this
  repository a launch configuration is a `preLaunchTask` plus a background task (`.vscode/launch.json:14`),
  and "Run 2.0" without one would launch whatever was last built into `dist/`.
- `package.json:299` `watch:esbuild:v2`: an extra script not named by the plan, needed so `watch:v2` can run the
  2.0 watcher next to `watch:tsc`. `package.json:297` `watch` changed from the `watch:*` glob to an explicit
  list, because the glob would also start `watch:v2`.
- `esbuild.mjs:36,109`: analysis metafiles go to `out/esbuild/`, not `dist/` as in the quarry. `.vscodeignore`
  does not exclude JSON under `dist/`, so a metafile there would ship in the VSIX.
- `esbuild.mjs:147-154`: a ceiling fails the build only with `--production --analyze`. Development output is
  unminified and several times larger, so the same numbers cannot apply to it. CI does not pass `--analyze`;
  enforcement in CI is P7.2.
- Root element ids of the placeholders (`root`, `sidebar-root`) follow the legacy pages. The 2.0 host pages
  arrive in P2.9 and may choose differently.

## Advisor decisions (date, item, question, answer verbatim)

### 2026-10-12 · P0.6 · L1 `architecture-advisor` (`claude -p --agent architecture-advisor`)

Brief:

~~~~text
ITEM: P0.6 Build switch (esbuild.mjs --v2, watch:v2, launch config "Run 2.0", bundle ceilings, three placeholders)            GATE STATUS: baseline on labs/2.0 @ 24cf07b: `npx tsc --noEmit` exit 0 / `npx eslint src` exit 0 / `npx vitest run` 40 files, 1491 tests passed. Nothing edited yet.
OBSERVED: The item's output list is "esbuild.mjs, package.json, launch.json, 3 placeholders". Three things do not fit inside that list or need a choice. (a) `.vscode/launch.json` "Run Extension" uses `"preLaunchTask": "watch"`, and `.vscode/tasks.json` defines `watch` as a compound of `npm: watch:tsc` and `npm: watch:esbuild`, the latter with a background problem matcher on the `[watch] build started` / `[watch] build finished` lines that esbuild.mjs prints. A "Run 2.0" launch configuration that should start the 2.0 build before launching needs an equivalent background task for the `--v2` watcher in `.vscode/tasks.json`; without one, either the launch hangs on a never-finishing task or it launches whatever the last build left in dist/ (possibly 1.x). `.vscode/tasks.json` is not in the item's output list, and plan §2.1 says anything outside the item's files is a stop-and-ask. (b) package.json has `"watch": "npm-run-all -p watch:*"`. A new script named `watch:v2` (the name the plan and `.claude/settings.json` allowlist use) matches that glob, so `npm run watch` would then run the legacy and the 2.0 esbuild watchers in parallel, both writing dist/extension.js, dist/webview.js and dist/sidebar.js. package.json is an item file, so this is fixable in scope, but it changes an existing script. (c) "bundle ceilings (1.x + 10 %) under --analyze": measured `node esbuild.mjs --production` on the unmodified tree gives dist/extension.js 272655, dist/webview.js 546077, dist/sidebar.js 276451 bytes. Development builds are unminified and several times larger, so a ceiling can only be meaningful for `--production`. The quarry esbuild.mjs has targets (`node18`, `['chrome114']`), a `webviewBundle(entry, outfile)` helper and `writeAnalysis` (writes dist/<name>.meta.json) but no `--v2` flag and no ceilings. The vitest backend project includes only `src/services/**/*.test.ts` and `src/extension.test.ts`, so a test for the placeholder `src/extension.next.ts` would not run until P0.11/P2.10 extend the include; the frontend project includes `src/webview/**/*.test.{ts,tsx}`, so tests for the two webview placeholders would run.
FILES: docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:136-138 (§3 build switch), :184 (P0.6 row), :189 (P0.11), :229 (P2.10); esbuild.mjs:1-124; package.json scripts (lines 293-312); .vscode/launch.json:1-31; .vscode/tasks.json:1-48; vitest.config.mts:40-66; quarry esbuild.mjs (worktree ~/github/copilot-worktrees/nuiget/gasrulle-laughing-enigma/esbuild.mjs, read in full by the session)
CONTRACT/ADR IN PLAY: Plan §2.1: "'The item's files' = the sources it names + their *.test.ts(x) ... + any config file the item names. Anything else is a stop-and-ask." Plan P0.6 row: "launch config \"Run 2.0\"" and "bundle ceilings (1.x + 10 %) under `--analyze`". Plan D4: "`node esbuild.mjs --v2` selects src/extension.next.ts, src/webview/main, src/webview/sidebar-next; default selects legacy."
OPTIONS I SEE: For (a): 1) add two task entries to `.vscode/tasks.json` (a compound `watch:v2` and a background `npm: watch:esbuild:v2` with the same problem matcher) and point "Run 2.0" at `preLaunchTask: "watch:v2"`; 2) leave tasks.json alone and give "Run 2.0" no preLaunchTask, documenting that `npm run watch:v2` must be started first; 3) leave tasks.json alone and use `preLaunchTask: "npm: watch:v2"` relying on VS Code's auto-detected npm task (no background matcher). For (b): 1) change `watch` to list its two scripts explicitly (`npm-run-all -p watch:esbuild watch:tsc`) and define `watch:v2` as `npm-run-all -p watch:esbuild:v2 watch:tsc` plus `watch:esbuild:v2` = `node esbuild.mjs --v2 --watch`; 2) keep the glob and name the 2.0 scripts so they do not match it (not possible for `watch:v2` itself). For (c): 1) under `--analyze` print every bundle's size against its ceiling and exit 1 only when `--production` is also given and a ceiling is exceeded; 2) exit 1 under `--analyze` in every mode; 3) print only, never fail. Also: 4) the ceilings apply to both the legacy and the `--v2` entry sets, or only to `--v2`.
QUESTION: Which option for (a), (b) and (c), do the ceilings apply to both entry sets, and should P0.6 add frontend tests for the two webview placeholders while leaving `src/extension.next.ts` untested until its test file is included by a later item?
~~~~

Answer (verbatim):

~~~~text
The reviewer confirms the approach on all five points. One correction from primary evidence: the reviewer says the metafile "needs nothing" because `dist/` is gitignored, but the risk I found is the VSIX, not git — `.vscodeignore:23-26` excludes `*.map`/`*.ts` and re-includes `dist/**/*.js`, with no rule for `dist/**/*.json`, and `vsce` does not consult `.gitignore`. Since the item's own ceiling measurement runs `--analyze` before `npm run package:vsix`, the metafile must land outside `dist/`. I fold that into the DO list.

```text
DECISION: (a) option 1 — add the two task entries to .vscode/tasks.json and point "Run 2.0" at preLaunchTask "watch:v2", recorded as a deviation; (b) option 1 — make `watch` explicit and add `watch:v2` + `watch:esbuild:v2`; (c) option 1 — under `--analyze` print every bundle against its ceiling, exit 1 only when `--production` is also given; ceilings are literal constants keyed by output file (so they apply to both entry sets); (d) yes to one frontend smoke test per webview placeholder, no `src/extension.next.test.ts` in P0.6.
WHY: The brief is accurate about the tree except one point: `src/extension.test.ts` is named by vitest.config.mts:46 but does not exist (`ls src/*.test.ts` → no match), so the legacy entry has no unit test either and the placeholder follows that precedent; I could not open the quarry esbuild.mjs (read denied twice), but none of the five questions depends on its contents. Plan §3:136-138 names "`npm run watch:v2`; launch config 'Run 2.0'" as a pair in the same sentence, and launch.json:14 + tasks.json:5-43 show that in this repo a launch config is a `preLaunchTask` plus a background task with the `[watch] build started/finished` matcher; a "Run 2.0" without that task either debugs stale `dist/` (option 2, possibly 1.x) or blocks on a task that never ends (option 3), so option 1 is the only reading that delivers the named output — this is interpreting an output, not widening scope, and P0.5 set the precedent of a minimal unnamed companion file recorded under Deviations (`.github/STATUS.md:89-91`). The names `watch:v2` and `--v2` are fixed by P0.4's allowlist (`.claude/settings.json:47-48`) and removed together at P8.1 (plan :312), so `watch:esbuild:v2` fits the same removal; `watch:*` at package.json:297 matches `watch:v2` whatever npm-run-all's segment rule is, so the explicit list is required, not optional. P7.2 (plan :302) is where ceilings are "enforced" in CI, so P0.6 only has to make `node esbuild.mjs --production --analyze` a usable gate; ceilings make sense only for minified output, CI runs `--production` without `--analyze` (ci.yml:108,167) so nothing existing can go red, and P8.1 flips entries without renaming `dist/{extension,webview,sidebar}.js`, so a ceiling keyed by output file survives the flip while one derived from the legacy build at run time would die at P8.2. D10/ADR-000:38-39 require `node18`/`chrome114`, and target lowering changes emitted bytes, so the ceiling must be measured after the port, not from the brief's pre-port numbers. `.vscodeignore:23-26` has no rule for `dist/**/*.json` and vsce ignores `.gitignore`, so a `dist/<name>.meta.json` written by the ported `writeAnalysis` before `npm run package:vsix` would ship; `out/` is excluded by `.vscodeignore:9` and `.gitignore:14`.
DO:
1. Port the quarry esbuild.mjs onto the current file keeping the problem-matcher plugin on every config (tasks.json:33-34 depends on those exact lines): `target: 'node18'` for the extension bundle, `target: ['chrome114']` for both webviews, the `webviewBundle(entry, outfile)` helper, and the metafile under `--analyze`. Write any analysis file to `out/esbuild/<name>.meta.json`, not `dist/`.
2. Add `const isV2 = process.argv.includes('--v2')` selecting entries `src/extension.next.ts`, `src/webview/main/index.tsx`, `src/webview/sidebar-next/index.tsx`; default stays `src/extension.ts`, `src/webview/app/index.tsx`, `src/webview/sidebar/index.tsx`; output files are the same three names in both modes. `--v2` must compose with `--watch`, `--production` and `--analyze`.
3. Create the three placeholders: `src/extension.next.ts` exporting `activate(context)` that calls `vscode.window.showInformationMessage('nUIget 2.0 is not wired yet')` and `deactivate()`, importing only `vscode`; `src/webview/main/index.tsx` and `src/webview/sidebar-next/index.tsx` each exporting a named component that renders the text "2.0 shell" and mounting it only when `document.getElementById(...)` finds the root (same guard as app/index.tsx:79-90 and sidebar/index.tsx:5-14).
4. Add `src/webview/main/index.test.tsx` and `src/webview/sidebar-next/index.test.tsx`: import the named component, render it with Testing Library, assert the text "2.0 shell". The frontend project (vitest.config.mts:54) picks them up.
5. Measure the legacy production build with the ported file: `node esbuild.mjs --production --analyze`, read `metafile.outputs['dist/<name>.js'].bytes` for the three JS bundles. Set `BUNDLE_CEILINGS = { 'dist/extension.js': N, 'dist/webview.js': N, 'dist/sidebar.js': N }` as literal constants with `N = Math.ceil(measured × 1.1)`, and a comment giving the measured 1.x byte count, the formula and the commit SHA. Record the brief's pre-port numbers (272655 / 546077 / 276451) next to the post-port ones in STATUS.md. CSS is not measured; say so in the comment.
6. Under `--analyze`: after `analyzeMetafile` print one line per bundle `<outfile> <bytes> / <ceiling>`; when `--production` is also set and any bundle exceeds its ceiling, print the offending bundle and `process.exit(1)`; without `--production` print the table with the note "ceilings apply to --production output" and exit 0.
7. package.json scripts: `"watch": "npm-run-all -p watch:esbuild watch:tsc"`, add `"watch:esbuild:v2": "node esbuild.mjs --v2 --watch"` and `"watch:v2": "npm-run-all -p watch:esbuild:v2 watch:tsc"`. No other script changes; `contributes` untouched.
8. .vscode/tasks.json: add a compound task labelled `watch:v2` with `dependsOn: ["npm: watch:tsc", "npm: watch:esbuild:v2"]`, `presentation.reveal: "never"`, no default build group; add an npm task `script: "watch:esbuild:v2"`, label `npm: watch:esbuild:v2`, `isBackground: true`, with the problem matcher copied verbatim from tasks.json:22-36 and the same presentation as :39-42.
9. .vscode/launch.json: add `"Run 2.0"` as a copy of "Run Extension" (launch.json:4-15) with `preLaunchTask: "watch:v2"`.
10. Gates in plan §2.2 order; `npm run package:vsix` is mandatory for this item (esbuild change). Run `node esbuild.mjs --v2 --production` as well as the two item-gate commands.
11. Docs duties: CHANGELOG `[Unreleased]` `### Added` one headline for the build switch; add one row to the 2.0 gotcha table in copilot-instructions.md: `watch` and `watch:v2` both write `dist/{extension,webview,sidebar}.js` — never run them concurrently, and the "Run 2.0" launch runs whatever `main` loads from `dist/`; no ARCHITECTURE.md edit (its 2.0 section is P0.12's).
12. Rewrite `.github/STATUS.md` (the repo-level handoff note) per §2.5: list `.vscode/tasks.json` and `watch:esbuild:v2` under Deviations with the launch.json:14 justification; list `src/extension.next.ts` under "Done (untested)" with the reason "backend include is `src/services/**` + a non-existent `src/extension.test.ts` (vitest.config.mts:46)"; paste this answer under Advisor decisions. In docs/plans/STATUS.md add to the P0.11 Notes column: "backend include must also gain `src/extension.next.test.ts`, which P2.10 names as a deliverable but P0.11's listed include extension does not cover".
DO NOT:
Do not write `src/extension.next.test.ts` in this item — no vitest project would run it and a silent dead test is worse than a recorded gap.
Do not edit vitest.config.mts, .vscodeignore or eslint.config.mjs; they belong to P0.11, P0.10 and P0.7.
Do not compute the ceilings from the legacy build at run time, from the brief's pre-port numbers, or from development (unminified) output.
Do not raise a ceiling to make the post-port legacy build fit; if the legacy bundle exceeds measured-pre-port × 1.1 after adding the targets, stop and ask.
Do not exit non-zero under `--analyze` without `--production`, and do not add `--analyze` to CI (P7.2).
Do not let the placeholder import anything from `src/services/**`, register commands, or touch `contributes` or `activationEvents`.
Do not keep the `watch:*` glob, rename `watch:v2`, or name a v2 watcher that `npm run watch` would also start.
Do not make `watch:v2` the default build task or give "Run 2.0" a different `main`/`dist/` path; D4 is one `dist/`, selected by entry set.
Do not write metafiles into `dist/`.
CONTRACT CHANGE: none
VERIFY: `node esbuild.mjs --production` → "[production] Build complete", three files in dist/; `node esbuild.mjs --v2` → "[development] Build complete", three files in dist/ and `grep -c "nUIget 2.0 is not wired yet" dist/extension.js` → 1; `node esbuild.mjs --v2 --production` → exit 0; `node esbuild.mjs --production --analyze` → exit 0 and three `<outfile> <bytes> / <ceiling>` lines each below its ceiling; `node esbuild.mjs --analyze` → exit 0 with the "ceilings apply to --production output" note; `ls dist/*.meta.json` → no match; `grep -c '"watch": "npm-run-all -p watch:esbuild watch:tsc"' package.json` → 1; `grep -c '"watch:v2"' package.json` → 1; `grep -c '"label": "watch:v2"' .vscode/tasks.json` → 1; `grep -c '"preLaunchTask": "watch:v2"' .vscode/launch.json` → 1; `npx vitest run --project frontend src/webview/main src/webview/sidebar-next` → 2 files, 2 tests passed; `npx tsc --noEmit` → 0; `npx eslint src` → 0; `npm test` → 40 + 2 files passed, 1491 + 2 tests; `npm run bench` → green; `npm run package:vsix` → VSIX written and `npx vsce ls | grep -c 'meta.json'` → 0.
```

`★ Insight ─────────────────────────────────────`
- **Why ceilings are keyed by output file, not by entry:** D4 and P8.1 flip the build by swapping *entries* while `dist/{extension,webview,sidebar}.js` keep their names. A size budget attached to the output name survives the flip and the P8.2 deletion of the legacy code it was derived from; a budget computed by building legacy at run time would vanish with `src/extension.ts`.
- **`vsce` and `.gitignore` are independent:** `dist/` being gitignored says nothing about the VSIX. `vsce` packs everything on disk minus `.vscodeignore`, and this repo's `.vscodeignore` re-includes `dist/**/*.js` without excluding `dist/**/*.json` — so a metafile left behind by the item's own ceiling measurement would ship. Writing it under `out/` uses an exclusion that already exists instead of touching P0.10's file.
- **The silent-dead-test trap:** the vitest backend project lists `src/extension.test.ts` by literal path and that file does not exist. A new `src/extension.next.test.ts` would type-check (once P0.11 adds test type-checking) and look like coverage, yet never run; recording the gap in `STATUS.md` keeps it visible until the include is extended.
`─────────────────────────────────────────────────`
~~~~

Acted on: `DO` steps 1 to 12 as written. The measured post-port sizes equal the pre-port sizes, so the
"stop and ask if the legacy bundle exceeds the pre-port ceiling" condition did not arise.

## Exact next step (one item ID)

P0.7

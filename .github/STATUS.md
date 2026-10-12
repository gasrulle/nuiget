# STATUS — .github (agent resources and repo-level items)   commit 9ecac1f (parent of the P0.10 commit)   2026-10-12T08:50:00Z

git status --short: ` M .vscodeignore`, ` M package.json`, ` M CHANGELOG.md`, ` M .github/copilot-instructions.md`,
` M docs/plans/STATUS.md`, ` M .github/STATUS.md`, `?? scripts/check-vsix-contents.mjs`,
`?? src/test/lint/vsix-contents.test.ts` (all belong to the P0.10 commit)

Item: **P0.10 Packaging**. This file is the handoff note for plan items without a `src/` directory of their
own. The P0.7 note it replaces is in commit `9ecac1f`.

## Verified by running

```text
baseline npx tsc --noEmit   → exit 0, no output
baseline npx eslint src     → exit 0, no output
baseline npx vitest run     → Test Files 43 passed (43) · Tests 1553 passed (1553)
npx vsce ls (before)        → 18 files, including .nvmrc, .vscode-test.mjs, tsconfig.test.json
npx vitest run --project backend src/test/lint → Test Files 2 passed (2) · Tests 96 passed (96)
npx tsc --noEmit            → exit 0, no output
npx eslint src              → exit 0, no output
npm run lint                → exit 0
npm test                    → Test Files 44 passed (44) · Tests 1591 passed (1591)
npm run bench               → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
rm -rf dist; npm run package:vsix → exit 0 · DONE Packaged: nuiget-v1.18.9.vsix (17 files, 527.71 KB)  (item gate)
npm run check:vsix          → exit 0 · "check:vsix: OK", 15 files                                      (item gate)
npx vsce ls                 → 15 files; 0 under src/, .claude/ or docs/; 0 dotfiles; 0 tsconfig files (item gate)
probe: stray file zz-p010-stray.txt in the repository root → check:vsix exit 1, names the file (file removed)
probe: dist/sidebar.css moved away → check:vsix exit 1, "required file(s) missing from the VSIX:
       dist/sidebar.css" (file restored)
probe: development build with source maps in dist/ → check:vsix exit 0 (maps are excluded by .vscodeignore)
npm run test:ui             → SKIPPED: not in the plan §2.2 gate list for this item; it would repackage the
                              same VSIX
```

The 15 files: `CHANGELOG.md`, `LICENSE`, `README.md`, `package.json`, `dist/extension.js`,
`dist/webview.{js,css}`, `dist/sidebar.{js,css}`, and the six files in `resources/`.

## Done (tested)

- `.vscodeignore`: quarry port. Kept excluded: `.claude/**`, `CLAUDE.md`, `.mcp.json`, `.editorconfig`,
  `.nvmrc`, `.vscode-test.mjs`, `tsconfig.test.json` (through `**/tsconfig.*.json`) and `src/_wip/**` (through
  `src/**`). Removed ten entries whose targets do not exist: `.yarnrc`, `webpack.config.js`,
  `**/.eslintrc.json`, `nuget.config`, `debug/**`, `package-icon.png`, `_replace_methods.cjs`, `codicon.csv`,
  `resources/icon_old.png`, `resources/beaker-outline.svg`; and `.git/**`, which vsce ignores by itself.
- `scripts/check-vsix-contents.mjs`: allow-list plus required files derived from the manifest (`main`, `icon`,
  icons of view containers, views and commands) and `dist/{webview,sidebar}.{js,css}`.
- `src/test/lint/vsix-contents.test.ts`: 38 tests of the allow-list, the manifest derivation and the report.
- `package.json`: `check:vsix`.

## Done (untested)

- `check:vsix` in CI: P0.8 adds the step (tracker note on the P0.8 row).
- Windows: the script normalises separators and has a test for backslash paths, but it has run on macOS only.

## Not started

- P0.8: CI rewrite.

## Deviations from contract/ADR (file:line each)

- `scripts/check-vsix-contents.mjs:29-31`: `resources/tab-icon.png` and `resources/package-icon.png` are
  required although the manifest does not mention them. Host code loads them with `Uri.joinPath`
  (`src/webview/NuGetPanel.ts:204,1397`, `src/webview/NuGetSidebarPanel.ts:1430`). The item names only
  manifest-derived files; without these two a deleted icon would pass the check.
- `src/test/lint/vsix-contents.test.ts`: the script's tests live in the backend vitest project's lint
  directory, not next to the script, because no gate runs `node --test` on `scripts/` outside `scripts/hooks`.
- `.vscodeignore:12`: `dist/**/*.meta.json` is excluded although P0.6 already writes metafiles to `out/esbuild/`.
  Kept from the quarry as a second barrier.
- Candidate finding for P0.13 (no ID yet): builds do not clean `dist/`. After `node esbuild.mjs --v2 --production`
  the 1.x `dist/*.css` from an earlier build are still present, `check:vsix` passes, and the stale files would
  be packaged. `check:vsix` cannot tell a stale file from a current one. Recorded as a 2.0 gotcha.

## Advisor decisions (date, item, question, answer verbatim)

No stop-and-ask trigger fired and the item is not ⚑, so neither the L1 `architecture-advisor` nor the ambient
advisor was consulted for this item.

## Exact next step (one item ID)

P0.8

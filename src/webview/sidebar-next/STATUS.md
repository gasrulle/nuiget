# STATUS — src/webview/sidebar-next   commit 68d034d (P7.fix-1; parent of the P7.fix-2 commit)   2026-10-16T14:00:00Z

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `README.md`,
`package.json` (the description of `nuiget.enablePerformanceLogging`), `docs/plans/{STATUS,findings-ledger}.md`,
`src/webview/main/{MainShell,MainShell.test,index.test}.tsx`, `src/webview/main/features/sources/{SourceSettingsDialog,SourcesControl.test}.tsx`,
`src/webview/sidebar-next/{SidebarView,SidebarView.test,index.test}.tsx` and the STATUS notes of `src/webview/main`,
`src/webview/sidebar-next`

Item: **P7.fix-2** — perf marks from the 2.0 webviews and the setting's text (N81); a `%VAR%` password is stored in clear
text (N82); from the P7.6 acceptance ruling (DO 1-5) and its follow-up. This note replaces the P7.5b note of this
directory (in its history at `71cf359`); the main panel's half is in `src/webview/main/STATUS.md`.

## Verified by running

```text
baseline at 68d034d (P7.fix-1, CI run 38870091917 green on all 13 jobs): tsc 0 · check-types 0 · eslint 0 · npm test
                              3435 passed | 2 skipped
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each
npx vitest run --project frontend src/webview → 72 files, 1084 passed (1084); first run: the two entry tests red on the
                              new start request (follow-up ruling), and the two mark tests red until they answered the
                              live StrictMode requests (`.at(-1)`)
npx vitest run --project backend src/host src/test/lint → 15 files, 263 passed (263)
npx vitest run --project integration src/test/harness → 22 passed (22)
npm test (DOTNET_ROOT set, NUIGET_SDK_TESTS=1) → exit 0 · Test Files 169 passed (169) · Tests 3438 passed | 2 skipped (3440)
npm run bench               → exit 0 · Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
npm run docs:check          → exit 0
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 293183 / 321341 · webview 525105 / 575626
                              (+643) · sidebar 319313 / 350684 (+437)
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → exit 0, "check:vsix: OK"; no sentinel
```

## Done (tested)

- `SidebarView.tsx`: the same two marks with ref guards, from the view (not `index.tsx`), `firstUsefulRender` when the
  committed project's installed list is first `ready`. New test `SidebarView.test.tsx` `sends perf/mark webviewReady
  once at mount and firstUsefulRender once when the first installed list is shown`.
- Rewritten by title (follow-up ruling): `index.test.tsx` `mounts the sidebar into its root, acquires the API once and
  asks the host for the session and the projects` → `mounts the sidebar into its root, acquires the API once, asks the
  host for the session and the projects, and marks webviewReady`.

## Done (untested)

- None.

## Not started

- P7.6 (the acceptance bookkeeping), then the P7 phase boundary.

## Deviations from contract/ADR (file:line each)

- None (no frozen file). The manifest description of `nuiget.enablePerformanceLogging` changed by the ruling's
  authorization (a `contributes` text, not a key or default).

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.6 (⚑ acceptance ruling) and its follow-up on the two entry tests: verbatim in `docs/plans/STATUS.md`
("P7.6 — ⚑ acceptance ruling" and "P7.fix-2 — follow-up ruling: the two entry tests that pin the start requests").
Decision lines: PASS WITH FIXES, P7.fix-2 before P7.6 (N81 marks from both shells and the setting's text, N82 clear text
for a `%VAR%` password); the entry tests are rewritten by title with `perf/mark` in the exact start set; the slice's
status is `'ready'`, not `'ok'`.

## Exact next step (one item ID)

P7.6.

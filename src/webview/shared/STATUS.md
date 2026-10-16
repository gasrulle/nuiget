# STATUS — src/webview/shared   commit f1c9c8d (P7.5a commit 1; parent of the P7.5a commit 2)   2026-10-16T09:10:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`,
`ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `docs/ux/interaction-model.md`,
`src/core/catalog/{Catalog,Catalog.test}.ts`, `src/host/{SidebarHost,handlers.test}.ts`,
`src/webview/main/features/details/MultiInstallDialog.tsx`, `src/webview/main/features/installed/{InstalledProjectSection,InstalledTab.test}.tsx`,
`src/webview/main/features/search/{BrowseList,BrowseList.test,useSearchTyping.test}.tsx`, `useSearchTyping.ts`,
`src/webview/main/main.css`, `src/webview/shared/store/search.tsx`, the STATUS notes of `src/host`, `src/webview/main`,
`src/webview/shared`, `src/core/catalog`; new `src/webview/main/features/details/MultiInstallDialog.test.tsx`

Item: **P7.5a, commit 2** — the product follow-ups of the P7.5 ruling (DO 4-10): N76 on both surfaces,
`ui/navigateToPackage.version` read by the main panel (P5 review 6), `DEFAULT_SEARCH_TAKE` 20 (P5 review 8), the
provisional badge in the single-project list (P6 review 6). This note replaces the P6.fix-1 note of this directory (in its history at `b168640`).

## Verified by running

```text
baseline at f1c9c8d (P7.5a commit 1): tsc 0 · check-types 0 · eslint 0 · npm test 3415 passed, 2 skipped (Windows-only)
npx tsc --noEmit            → exit 0
npm run check-types         → exit 2 at the first run (TS2561/TS2345: the new InstalledTab test's resources/invalidated
                              literal), fixed in the test; then exit 0
npx eslint src / npm run lint → exit 0 each
npx vitest run --project backend src/core/catalog src/host src/test/lint → 17 files, 318 passed (318)
npx vitest run --project frontend src/webview → 72 files, 1079 passed (1079), the six new titles among them
npm test (DOTNET_ROOT set, NUIGET_SDK_TESTS=1) → exit 0 · Test Files 168 passed (168) · Tests 3421 passed | 2 skipped (3423)
npm run bench               → exit 0 · Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 292947 / 321341 · webview 524343 / 575626 ·
                              sidebar 318871 / 350684 (dist/ and out/esbuild removed afterwards)
npm run package:vsix        → exit 0 (its npm test: 168 files, 3414 passed | 9 skipped without the SDK variables); "Packaged: nuiget-v1.18.9.vsix (17 files, 534.45 KB)"
npm run check:vsix          → "check:vsix: OK"
```

## Done (tested)

- `store/search.tsx`: `SearchOptions.version` (with `exactMatch` only), kept in `Asked` and exposed as
  `SearchState.version`; the request payload is unchanged (no protocol field). Covered through the two search tests
  of `src/webview/main` named in that note.

## Done (untested)

- None.

## Not started

- P7.5b (contract wording, the N74 outcome) and P7.5c (docs pass, drift script).

## Deviations from contract/ADR (file:line each)

- None (no frozen file).

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.5 (stop-and-ask): verbatim in `docs/plans/STATUS.md` ("P7.5 — stop-and-ask: the split, the drift script
and the inherited duties"). Decision line: P7.5 splits into P7.5a (CPM evidence, then the product follow-ups: N76 by
exclusion on both surfaces, `ui/navigateToPackage.version` read by the webview, `DEFAULT_SEARCH_TAKE` 20, the
provisional badge in the single-project list), P7.5b (contract wording and the N74 outcome, sentinel `P7.5b`) and
P7.5c (docs, drift script, CI). No contract change in P7.5a.

## Exact next step (one item ID)

P7.5b.

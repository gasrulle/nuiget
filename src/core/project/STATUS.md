# STATUS — src/core/project   commit a2fd5d2 (P7.5a closed; parent of the P7.5b commit)   2026-10-16T10:00:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`,
`ARCHITECTURE.md`, `CHANGELOG.md`, `docs/adr/{004-project-model,004-sdk-probes,005-execution-context-and-outbound-policy,007-protocol}.md`,
`docs/plans/{STATUS,findings-ledger}.md`, `docs/protocol.md` (generated), `docs/ux/interaction-model.md`,
`src/core/contracts.ts` (JSDoc), `src/protocol/messages.ts` (JSDoc), `src/core/project/{mutator,mutator.test}.ts`,
`src/webview/shared/installed/rules.ts`, `src/webview/main/features/details/{DetailsPane,DetailsPane.test}.tsx`,
`src/webview/main/features/updates/{UpdatesTab,UpdatesTab.test,AllProjectsUpdates,CentralUpdateDialog}.tsx`,
`src/webview/sidebar-next/{ProjectUpdates,UpdatesSection.test,SidebarView.test}.tsx` and the STATUS notes of
`src/protocol`, `src/core/project`, `src/webview/shared`, `src/webview/main`, `src/webview/sidebar-next`

Item: **P7.5b** — contract wording and the N74 outcome, by the P7.5 ruling (DO 11-14) and the P7.5b ruling of
2026-10-16 (LIFT by the pre-registered rule, in the core and the UI; sentinel `P7.5b`). This note replaces the P7.2c note of this directory (in its history at `bf2c68b`).

## Verified by running

```text
baseline at a2fd5d2 (CI run 38864168236 green, 13 of 13): tsc 0 · check-types 0 · eslint 0 · npm test 3421 passed
                              | 2 skipped (Windows-only)
npx tsc --noEmit / npm run check-types → exit 0 each
npx eslint src / npm run lint → exit 1 at the first run (`waitFor` left unused in UpdatesSection.test.tsx by the
                              rewrite), import removed; then exit 0 each
npm run docs:protocol       → regenerated docs/protocol.md (the cpm/preview row); docs:protocol:check → "up to date"
npx vitest run --project backend src/core/project src/core/ops src/host src/test/lint → 26 files, 495 passed | 4
                              skipped (SDK-gated, no NUIGET_SDK_TESTS in that run)
npx vitest run --project frontend src/webview → 72 files, 1081 passed (1081)
npm test (DOTNET_ROOT set, NUIGET_SDK_TESTS=1) → exit 0 · Test Files 168 passed (168) · Tests 3424 passed | 2 skipped (3426)
npm run bench               → exit 0 · Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 293071 / 321341 · webview 524462 / 575626 ·
                              sidebar 318876 / 350684 (dist/ and out/esbuild removed afterwards)
npm run package:vsix        → exit 1 at the first run (the lint error above), then exit 0: its npm test 3417 passed |
                              9 skipped; "Packaged: nuiget-v1.18.9.vsix (17 files, 534.48 KB)"
npm run check:vsix          → "check:vsix: OK"
git diff --name-only -- docs/adr src/protocol src/core/contracts.ts → the seven files of the CONTRACT CHANGE
```

## Done (tested)

- `mutator.ts`: `canMutate` refuses an install or update only when some, not all, rows of the id are
  `central-override` ("<id> overrides the central version in some target frameworks only; edit it by hand"); an id
  whose every row overrides falls through to the CPM checks and is admitted `{ ok: true, isCpm: true }`, so the add
  runs without `--no-restore` exactly as probed. `previewCpmImpact` answers `undefined` when the asking project has a
  `central-override` row for the id. Header comment.
- `mutator.test.ts`: new `cpm: an install or update of a VersionOverride row is admitted with isCpm and previews
  nothing (probe row add-override)`; rewritten by title `refuses install and update of a row with a VersionOverride or
  an unresolved version` → `refuses install and update of an unresolved row and of a VersionOverride that holds in
  some target frameworks only` (the two `unresolved` assertions and the `remove` one kept). The static inspection
  marks a conditional reference `unresolved`, so the mixed case's two rows come from an inspector fake (an object
  with `inspect`), as the ruling allows; the App project of that test now references Polly only, and a remove of
  Polly is asserted admitted beside the fake's. `previewCpmImpact: undefined for a non-CPM project and for a package
  without a central entry` gained one assertion (B overrides X → `undefined`), title kept.

## Done (untested)

- None.

## Not started

- P7.5c (docs pass, drift script, CI, STATUS-note hygiene).

## Deviations from contract/ADR (file:line each)

- None (the ADR-004 tier 3 text was amended in the same commit to match).
- Verbatim rulings in earlier notes (`src/core/ops/STATUS.md:76`) and in `docs/plans/STATUS.md` still quote the old
  N74 refusal text; they are records and stay as written.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.5b (stop-and-ask): verbatim in `docs/plans/STATUS.md` ("P7.5b — stop-and-ask: the N74 outcome, its
tests and its UI") and in `src/protocol/STATUS.md`. Decision line: LIFT in the core and the UI in one commit:
`canMutate` admits an install or update of an id whose every row overrides, a mixed override/central shape stays
refused; `previewCpmImpact` answers `undefined` for an overriding asker; `whyNotUpdatable` stops naming override
rows; the three tests that asserted the refusal are rewritten by title; JSDoc of `contracts.ts` and `messages.ts`
amended under the sentinel.
2026-10-16, P7.5 (stop-and-ask): verbatim in `docs/plans/STATUS.md` ("P7.5 — stop-and-ask: the split, the drift script
and the inherited duties").

## Exact next step (one item ID)

P7.5c.

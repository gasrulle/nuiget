# STATUS — src/test/benchmarks   commit 779a6cd (parent of the P8.2a commit)   2026-10-16T14:30:00Z

git status --porcelain --untracked-files=all (before the commit): six renames `src/test/benchmarks/core-*.bench.ts` →
`src/core/{versioning,cache,ops,queries,catalog,http}/…`, seven new benches (`src/core/{project,feeds,cli,util}`,
`src/webview/shared/{primitives,search}`, `src/webview/main/features/details`), modified `vitest.config.mts`,
`tsconfig.json`, `tsconfig.vitest.json`, `eslint.config.mjs`, `src/test/lint/interaction-model-testids.test.ts`, the
twelve v2 e2e and ExTester headers, `benchmarks/{README.md,baseline.json}`, `ARCHITECTURE.md`, `CHANGELOG.md`,
`.github/copilot-instructions.md`, `docs/plans/{STATUS,findings-ledger}.md`, this note.

Item: **P8.2a**, by the P8.2 ⚑ ruling of 2026-10-16 (verbatim in `docs/plans/STATUS.md`, "P8.2 — ⚑ ruling: the
deletion mechanism and the split"). Scope of this note since P8.2a: the runner helper (`benchmark.ts`), its test
(`benchmark.test.ts`), the runner (`run.mjs`) and `benchmarks/baseline.json`. The 2.0 benchmarks sit next to the
modules they measure (`benchmarks/README.md` lists them). The thirteen 1.x benchmarks still here and `setup.ts` go in
the owner's block below. Earlier notes of this directory (P2.12 to P7.5c) are in its history at `756dcd1`.

## Verified by running

```text
npx tsc --noEmit            → exit 0 (benches excluded by tsconfig.json)
npm run check-types         → exit 0 (the 2.0 benches type-checked through tsconfig.vitest.json)
npx eslint src              → exit 0
npm run lint                → exit 0
npm test                    → exit 0; Test Files 169 passed (169); Tests 3433 passed | 9 skipped (3442)
npm run bench               → exit 0; Test Files 27 passed (27); Tests 146 passed | 1 skipped (147)
npm run bench:save          → exit 0; "Saved 137 benchmark measurements to benchmarks/baseline.json."
npm run bench:compare       → exit 0; "Missing or invalid" lines: 0; Test Files 27 passed (27)
npx vitest run --coverage   → exit 0, thresholds met; All files 83.96 % statements, 75.51 % branches, 82.7 % functions,
                              84.99 % lines
npm run docs:check          → exit 0
rm -rf dist && npm run package && npm run check:vsix → exit 0, check:vsix: OK
npx vitest run --project backend src/test/lint → 11 files, 163 passed
npx vitest bench --run --project 'backend (bench)' src/core/project → 7 passed; src/webview → 3 files, 8 passed
git ls-files of the 2.0 benches outside src/test/benchmarks (after git add) → 13
owner block arithmetic (generator, git ls-files only) → 60 legacy test files, none under a 2.0 root; 11 ExTester,
                              9 e2e, 13 benches; 130 files deleted, 60 of them tests; 17 sidebar-next files; 20 renames;
                              no path missing
npm run package:vsix, npm run test:e2e, npm run test:ui → SKIPPED: no product file changed
```

## Done (tested)

- Six 2.0 benches moved next to their modules; seven added (`project`, `health`, `validate`, `topo`, `Listbox`,
  `parseSearchQuery`, `markdown`); `catalog.bench.ts` gained `Catalog.metadata`, `quickSearch` and
  `allProjectsTransitive`.
- `benchmark.include` is `src/**/*.bench.ts`; benches excluded from coverage and from `tsconfig.json`; the eslint
  relaxations and the interaction-model lint test know `*.bench.ts`.
- Baseline regenerated (137 measurements: the 1.x ones remain until P8.2b's `bench:save`).

## Done (untested)

- CI on the pushed commit (recorded in the next commit).

## Not started

- P8.2b, after the owner's block; P8.2c.

## Deviations from contract/ADR (file:line each)

- None from a contract or ADR. From the ruling's text: `tsconfig.vitest.json` includes `src/core/**/*.bench.ts` and
  `src/webview/**/*.bench.ts` instead of `src/**/*.bench.ts` (the 1.x benches here are untyped, N30); the VERIFY
  counts over `src/**/*.bench.ts` include the 13 1.x benches until the block; the `--v2` grep keeps the two
  `LEGACY_ONLY_COMMANDS` assertion messages (P8.2b DO 12 deletes them). Details in the tracker row P8.2a.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P8.2 (⚑): verbatim in `docs/plans/STATUS.md`, "P8.2 — ⚑ ruling: the deletion mechanism and the split".
Decision line: the owner runs the deletions and renames as one staged block; the session never deletes or moves a
test file; split into P8.2a, P8.2b, P8.2c.

## Owner's block (P8.2, run once on a clean tree at the P8.2a commit; never committed on its own)

```bash
cd /Users/mattias/github/nuiget && test -z "$(git status --porcelain)" && git rm -r -q -- src/services src/webview/app src/webview/sidebar src/test/integration src/test/ui/helpers src/test/fixtures && git rm -q -- src/extension.ts src/webview/NuGetPanel.ts src/webview/NuGetPanel.test.ts src/webview/NuGetSidebarPanel.ts src/webview/NuGetSidebarPanel.test.ts src/test/ui/setup.ts src/test/e2e/index.ts src/test/benchmarks/setup.ts src/test/helpers/backend.ts src/test/helpers/index.ts src/test/ui/activation.ui.test.ts src/test/ui/context-menu.ui.test.ts src/test/ui/install-flow.ui.test.ts src/test/ui/keyboard-navigation.ui.test.ts src/test/ui/panel-open.ui.test.ts src/test/ui/remove-flow.ui.test.ts src/test/ui/search-flow.ui.test.ts src/test/ui/sidebar-interaction.ui.test.ts src/test/ui/source-settings.ui.test.ts src/test/ui/theme-switching.ui.test.ts src/test/ui/update-flow.ui.test.ts src/test/e2e/commands.e2e.test.ts src/test/e2e/extension.e2e.test.ts src/test/e2e/file-watcher.e2e.test.ts src/test/e2e/install-flow.e2e.test.ts src/test/e2e/panel.e2e.test.ts src/test/e2e/settings-persistence.e2e.test.ts src/test/e2e/sidebar.e2e.test.ts src/test/e2e/source-management.e2e.test.ts src/test/e2e/update-flow.e2e.test.ts src/test/benchmarks/cache.bench.ts src/test/benchmarks/csproj-parsing.bench.ts src/test/benchmarks/http.bench.ts src/test/benchmarks/markdown.bench.ts src/test/benchmarks/metadata.bench.ts src/test/benchmarks/project-parsing.bench.ts src/test/benchmarks/queryAllProjectsTransitive.bench.ts src/test/benchmarks/react-rendering.bench.ts src/test/benchmarks/search-query.bench.ts src/test/benchmarks/search.bench.ts src/test/benchmarks/source-health.bench.ts src/test/benchmarks/update-checking.bench.ts src/test/benchmarks/utils.bench.ts && test ! -e src/webview/sidebar && test ! -e src/extension.ts && git mv src/webview/sidebar-next src/webview/sidebar && git mv src/extension.next.ts src/extension.ts && git mv src/extension.next.test.ts src/extension.test.ts && git mv src/test/lint/allowlist.test.ts src/test/lint/import-boundaries.test.ts && git diff --cached --stat | tail -1
```

## Exact next step (one item ID)

P8.2b, after the owner has run the block (the starter line is in the tracker row).

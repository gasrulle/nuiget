# STATUS — src/test/lint   commit 71cf359 (P7.5b closed; parent of the P7.5c commit)   2026-10-16T11:30:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/STATUS.md`,
`.github/copilot-instructions.md`, `.github/workflows/ci.yml`, `ARCHITECTURE.md`, `README.md`,
`docs/plans/{2026-10-11-nuiget-2.0-execution-plan,STATUS,findings-ledger}.md`, `docs/protocol.md` (generated),
`package.json` (one script), `scripts/gen-protocol-docs.mjs`, `src/STATUS.md`, `src/core/feeds/STATUS.md`,
`src/test/benchmarks/STATUS.md`, `src/test/e2e/STATUS.md`; new `scripts/check-docs-drift.mjs`,
`src/test/lint/docs-drift.test.ts`, `src/test/lint/STATUS.md`

Item: **P7.5c** — docs pass, drift script, CI, handoff-note hygiene, by the P7.5 ruling (DO 15-23). This is the first
note of this directory (P5 review note 7); until now `src/STATUS.md` carried its notes, and that note now covers
`src/extension.next.ts` alone.

The directory holds the repository's lint tests: `allowlist.test.ts` (the import allow-list prunes itself),
`docs-drift.test.ts` (P7.5c), `extension-config-settings.test.ts` (the code half of the settings drift: `ExtensionConfig`
keys and the contributed enum against the manifest), `interaction-model-testids.test.ts` (interaction model §8 ids are
rendered), `probe-sdk.test.ts` (the SDK probe script and its fixtures), `vsix-contents.test.ts`, the webview CSS and
colour tests (`webview-colours`, `webview-css-baseline`, `webview-icons-pure`, `webview-stylesheets`,
`webview-tokens`) and `cssRules.ts`, their shared parser.

## Verified by running

```text
baseline at 71cf359 (P7.5b, CI run 38866154469 green on all 13 jobs): tsc 0 · check-types 0 · eslint 0 · npm test
                              3424 passed | 2 skipped (Windows-only)
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each
node scripts/check-docs-drift.mjs → exit 0, "docs:check — the documents agree with the tree."
negative control            → `ops/nothing` appended to ARCHITECTURE.md:12 → exit 1, "ARCHITECTURE.md (2.0): `ops/nothing`
                              is no request or event of src/protocol/messages.ts"; file restored, grep -c ops/nothing → 0
npm run docs:protocol:check → "docs/protocol.md is up to date." (after `npm run docs:protocol` with the Surface column)
npm run docs:check          → exit 0 (no permission prompt; the two halves above also pass on their own)
npx vitest run --project backend src/test/lint → 11 files, 163 passed (163)
node --test scripts/hooks   → tests 26, pass 26, fail 0
npm test (DOTNET_ROOT set, NUIGET_SDK_TESTS=1) → exit 0 · Test Files 169 passed (169) · Tests 3433 passed | 2 skipped (3435)
npm run bench               → exit 0 · Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → exit 0, "check:vsix: OK" (README ships); dist removed
```

## Done (tested)

- `scripts/check-docs-drift.mjs` (new): pure checkers M1 (message names of a protocol group), M2 (request and event
  counts), S1 (README settings table), S2 (`nuiget.*` names), C1 (README commands table), P1 and P2 (module map paths
  and one row per 2.0 module), P3 (paths under `src/`, `scripts/`, `docs/`, `.github/`), `checkRepository()` over the
  four documents, a `main` guarded by `import.meta.url`; message names read with the TypeScript compiler API as the
  protocol generator does. No sizes, no line counts, no `ExtensionConfig` keys, no "(in progress)".
- `src/test/lint/docs-drift.test.ts` (new, 9 titles): `the repository documents agree with the tree`, and a negative
  control per check (M1, M2, S1, S2, C1, P1 and P2, P3) plus the section, brace and suffix helpers.
- `scripts/gen-protocol-docs.mjs`: a trailing `// main`, `// sidebar` or `// sidebar → main` becomes the Surface column
  (`both` when absent) and leaves Notes (P1.1b review 3); `docs/protocol.md` regenerated.
- `package.json` `docs:check`; CI Lint step "Check the docs" runs it.

## Done (untested)

- None.

## Not started

- P7.6 (acceptance cut, ⚑).

## Deviations from contract/ADR (file:line each)

- S2 admits contributed view and view-container ids as well (`nuiget.sidebar` is one); the ruling lists settings,
  commands, `when` context keys and storage keys.
- S1/C1 read the cell text inside a code span or bold markup only; a table cell written another way is compared as is.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.5 (stop-and-ask): verbatim in `docs/plans/STATUS.md` ("P7.5 — stop-and-ask: the split, the drift script
and the inherited duties"); DO 15-23 are this commit. 2026-10-16, P7.5b: verbatim there too ("P7.5b — stop-and-ask:
the N74 outcome, its tests and its UI").

## Exact next step (one item ID)

P7.6.

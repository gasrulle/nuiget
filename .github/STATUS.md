# STATUS — .github (agent resources and repo-level items)   commit 71cf359 (P7.5b closed; parent of the P7.5c commit)   2026-10-16T11:30:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/STATUS.md`,
`.github/copilot-instructions.md`, `.github/workflows/ci.yml`, `ARCHITECTURE.md`, `README.md`,
`docs/plans/{2026-10-11-nuiget-2.0-execution-plan,STATUS,findings-ledger}.md`, `docs/protocol.md` (generated),
`package.json` (one script), `scripts/gen-protocol-docs.mjs`, `src/STATUS.md`, `src/core/feeds/STATUS.md`,
`src/test/benchmarks/STATUS.md`, `src/test/e2e/STATUS.md`; new `scripts/check-docs-drift.mjs`,
`src/test/lint/docs-drift.test.ts`, `src/test/lint/STATUS.md`

Item: **P7.5c** — the repository-level part: CI's Lint job runs `npm run docs:check`; the copilot-instructions review;
README 2.0; the plan's §2.2 and Appendix D; the ledger. By the P7.5 ruling (DO 15-23). This note replaces the P7.2a
note (in this file's history at `61b9828`).

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

- `.github/workflows/ci.yml`: the Lint step "Check the protocol reference" became "Check the docs" (`npm run docs:check`).
- `.github/copilot-instructions.md`: every identifier and `path:line` anchor of the 2.0 gotcha rows resolves in the tree
  (scripted check: no missing identifier, no line beyond its file), so no row was dropped; P7.5a/P7.5b already rewrote
  the rows on central rows and the props-file reformat. New row "A document names something that does not exist";
  new `### Tooling (kept after P8.2)` under `## 2.0 gotchas` with 13 rows moved from the 1.x Known Issues and Testing
  tables (dependency audit, TypeScript 6, `eslint-plugin-react-hooks`, the test CLI's Mocha, `@types/vscode` pin, the
  macOS `--storage` path, `npm ci`, the `vscode` alias, the jsdom setup, `coverage/` in `.vscodeignore`, the test ESLint
  rules, benches in the backend project, the committed baseline); MSW, `resetInstance`, typed backend routing, the
  UI-test browse state and the 1.x bench rows stay 1.x. The 1.x section's intro says so. `docs:check` in the command
  list.
- `README.md`: rewritten for 2.0 by the `tech-writer` agent against the code and the manifest (claims it dropped as
  1.x-only or unverifiable: quick-install keys, the installed filter,
  noun-first detection, `nuiget.noRestore`, the main-panel restore checkbox, the private-feed vendor list, the old
  credential order and Windows path, and others); spot-checked here: the copy-ID action (`pickers.ts:125`), the
  queue status bar (`extension.next.ts:269-276`), the Solution Explorer menu (`package.json:193`), the main panel's
  prerelease switch only.
- Plan: §2.2 steps 3 and 5 (N39, N48, `docs:check`), Appendix D (P2.7 gate N55, the P4/P5 order, D6's list N38, the P0
  gate branch, P7.1's 8 keys N78, P7.4 skipped, the §2.5 header convention). `RUN.md` unchanged.
- Ledger: N39 and N48 closed, N42 accepted, N55 noted; N81 (`nuiget.enablePerformanceLogging` logs nothing from the
  2.0 webviews) and N82 (the add-source password placeholder promises `%VAR%` expansion that an encrypted password does
  not get) opened for P7.6.

## Done (untested)

- None.

## Not started

- Owner patches (sessions do not edit them): `CLAUDE.md` "2.0 execution protocol" gate list gaining
  `npm run check-types`, and `.claude/settings.json` allow gaining `"Bash(npm run docs:check)"` (this session ran it
  without a prompt).

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.5 (stop-and-ask): verbatim in `docs/plans/STATUS.md` ("P7.5 — stop-and-ask: the split, the drift script
and the inherited duties"); DO 15-23 are this commit. 2026-10-16, P7.5b: verbatim there too ("P7.5b — stop-and-ask:
the N74 outcome, its tests and its UI").

## Exact next step (one item ID)

P7.6.

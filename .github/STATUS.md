# STATUS — .github (agent resources and repo-level items)   commit 98bcdd1 (parent of the P0.11 commit)   2026-10-12T11:15:00Z

git status --short: `?? tsconfig.vitest.json`, ` M package.json`, ` M tsconfig.json`, ` M vitest.config.mts`,
` M eslint.config.mjs`, ` M benchmarks/README.md`, ` M src/test/helpers/frontend.tsx`,
` M src/test/lint/allowlist.test.ts`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md`, ` M .github/STATUS.md`
(all belong to the P0.11 commit)

Item: **P0.11 Test infrastructure**. This file is the handoff note for plan items without a `src/` directory of
their own. The P0.8 note it replaces is in commit `98bcdd1`; P0.8's first CI run, 38227914633, was green on
all eight jobs (Windows 44 files / 1591 tests, E2E 30 passing on VS Code 1.85.0 and on stable, UI 31 passing,
artifacts `vsix`, `e2e-log-1.85.0`, `e2e-log-stable`, `ui-log`).

## Verified by running

```text
baseline npx tsc --noEmit   → exit 0, no output
baseline npx eslint src     → exit 0, no output
baseline npx vitest run     → Test Files 44 passed (44) · Tests 1591 passed (1591)
throwaway config over every Vitest test, bench and helper (strict, esnext, bundler, vitest/globals)
                            → 58 errors in 14 files, 0 in production files; 55 in 1.x tests, benches and
                              integration helpers, 3 in tests added by P0.7 and P0.10 (config file removed)
npx tsc -p tsconfig.vitest.json (before the fixes) → 3 errors: src/test/helpers/frontend.tsx:20 TS7017, :21
                              TS2348; src/test/lint/allowlist.test.ts:121 TS2322
npx tsc -p tsconfig.vitest.json → exit 0, no output
npx tsc -p tsconfig.vitest.json --listFilesOnly | grep -v node_modules → 28 files; includes eslint.config.mjs,
                              scripts/check-vsix-contents.mjs, src/test/lint/*, src/test/helpers/*,
                              src/test/__mocks__/vscode.ts, src/test/setup-frontend.ts and the two 2.0 webview
                              tests; 0 files from src/services tests, src/webview/app, src/webview/sidebar,
                              src/webview/NuGet*.test.ts, src/test/integration, benchmarks, e2e or ui
npm run check-types         → exit 0 (tsc --noEmit && tsc -p tsconfig.test.json --noEmit &&
                              tsc -p tsconfig.vitest.json)                                        (item gate)
npx vitest run --coverage   → exit 0 · Test Files 44 passed (44) · Tests 1591 passed (1591)     (item gate)
coverage of src/webview/** (21 files) → lines 64.92 %, statements 62.72 %, functions 54.88 %, branches 52.79 %
probe: copy of the config with the webview lines floor at 99 → exit 1,
       'ERROR: Coverage for lines (64.92%) does not meet "src/webview/**" threshold (99%)' (copy removed)
npx tsc --noEmit            → exit 0, no output
npx eslint src              → exit 0, no output
npm run lint                → exit 0
npm test                    → Test Files 44 passed (44) · Tests 1591 passed (1591)
npm run bench               → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
rm -rf dist; npm run package:vsix → exit 0 · DONE Packaged: nuiget-v1.18.9.vsix (17 files)
npm run check:vsix          → exit 0; npx vsce ls → 15 files, no tsconfig file
git diff --stat -- tsconfig.test.json → empty; git diff --stat -- src → only src/test/helpers/frontend.tsx and
                              src/test/lint/allowlist.test.ts
npm run test:ui             → SKIPPED: no change to the extension or webviews; CI runs it on the push
```

## Done (tested)

- `tsconfig.vitest.json`: non-emitting program for the 2.0 tests (`src/core`, `src/protocol`, `src/host`,
  `src/extension.next.test.ts`, `src/webview/{main,sidebar-next,shared}`), `src/test/lint`, the shared helpers,
  the `vscode` mock and the frontend setup. `allowJs` so tests can import `eslint.config.mjs` and
  `scripts/*.mjs`. No type roots, so it uses `@types/node` 24.
- `package.json` `check-types` runs the three programs.
- Type-only fixes: `src/test/helpers/frontend.tsx` `getMockVsCodeApi` (typed access to the global mock) and
  `src/test/lint/allowlist.test.ts` (cast of `createConfig(...)` to `Linter.Config[]`). No assertion changed.
- `vitest.config.mts`: backend include gains `src/core`, `src/protocol`, `src/host` test globs and
  `src/extension.next.test.ts`, and drops the glob for the non-existent `src/extension.test.ts`; coverage
  excludes `src/_wip/**`, `src/**/__fixtures__/**`, `src/protocol/**`, `src/core/contracts.ts`; `src/_wip/**`
  excluded from test discovery; webview coverage floor lines 64, statements 62, functions 54, branches 52.
- `src/_wip` excluded in `tsconfig.json`; `src/_wip/**` ignored by ESLint.
- `benchmarks/README.md` says the CI benchmark job is informational.

## Done (untested)

- The new backend include globs match no file yet. The plan asks to verify after P1.2 that
  `npx vitest run --project backend src/core` lists files.
- The `src/_wip` exclusions: the directory does not exist yet, so nothing exercises them.

## Not started

- P0.12: ARCHITECTURE.md coexistence.

## Deviations from contract/ADR (file:line each)

- The item says "type-check tests (`tsc -p tsconfig.test.json --noEmit` in `check-types`)". `tsconfig.test.json`
  is the emitting configuration of the Mocha e2e and ExTester UI suites and stays as it is; it is now also run
  with `--noEmit` in `check-types`. The Vitest tests are checked by the new `tsconfig.vitest.json`.
- `docs/adr/000-release-and-compatibility-policy.md:35` names only `tsconfig.test.json` as the configuration
  that uses `@types/node@24`. `tsconfig.vitest.json` follows the same rule. The ADR text was not edited; the
  wording rides on the next item that is allowed to change ADR-000.
- The gate "`npm run check-types` includes tests → 0" is met for the 2.0 set. The 55 errors in 1.x tests,
  benches and integration helpers are excluded by file, not fixed, until P5.12 and P8.2 (advisor decision).
- `src/test/helpers/frontend.tsx:20-21`: a shared helper that 1.x tests use was changed, type-only, by the
  advisor's approval.
- `vitest.config.mts`: the glob `src/extension.test.ts` was removed from the backend include. No such file
  exists; no test was removed.
- Candidate findings for P0.13 are listed on its tracker row: four places where a legacy test calls production
  code with a signature it does not have, so the test asserts less than its title says.

## Advisor decisions (date, item, question, answer verbatim)

### 2026-10-12 · P0.11 · L1 `architecture-advisor` (Agent tool, subagent `architecture-advisor`; the item's ⚑)

The brief asked: with 58 type errors when every Vitest test is type-checked (55 in 1.x tests), which of five
options applies (fix all; type-check only 2.0-era tests; recorded baseline; `@ts-expect-error`; blocked), which
config layout (keep `tsconfig.test.json` for e2e/UI and add a new one, or widen it), and may P0.11 correct the
legacy call sites that do not match production signatures. The full brief is in the session transcript.

Answer (verbatim):

~~~~text
DECISION: Option 2 for the errors, layout (a) for the configs. Type-check the 2.0-era tests plus the shared test infrastructure now, in a new non-emitting `tsconfig.vitest.json`, with `allowJs: true` for the two `.mjs` imports; leave the legacy tests, integration tests and benches out of the type-checked set by an explicit, commented exclusion that P8.2 deletes; fix only the three remaining type-only errors in files P0.x sessions wrote; record the four test-versus-production drift cases as candidate N-findings for P0.13 routed to P5.12. P0.11 does not correct any legacy call site. Not OWNER MUST DECIDE.

WHY: The brief is accurate about the tree: I reproduced the measurement from a scratchpad config (same options, include `src`, exclude `src/test/{e2e,ui}`) and got exactly 58 errors in the same 14 files, 0 in production code; `tsconfig.json:30-37` excludes all Vitest tests, and `tsconfig.test.json:24-27` covers only `src/test/e2e` and `src/test/ui` with `rootDir: src/test`, `outDir: out/test`, `types: [node, mocha]`, which `package.json:313-314` (`test:e2e`, `test:ui`) compile with, so widening it (layout b) would change what those suites emit and would put Mocha's and Vitest's global `describe`/`it` declarations in one program. 55 of the 58 sit in files D4 and plan :313 (P8.2) delete and :280 (P5.12, retirement map "integration 9, bench 13") rewrite; §2.1 (:67-70) puts none of those 14 files in P0.11's files, and the ⚑ threshold on the P0.11 row (:189) exists precisely so that this scoping call is made rather than a 14-file legacy edit; the ground rule "keeps tests intact and loses the least work if interrupted" points the same way. A second probe with the 2.0 include set (`src/core|protocol|host/**/*.test.ts`, `src/extension.next.test.ts`, `src/webview/{main,sidebar-next,shared}/**/*.test.{ts,tsx}`, `src/test/lint/**`, `src/test/helpers/**`, `src/test/__mocks__/**`, `src/test/setup-frontend.ts`) and `allowJs: true` yields 3 errors, all type-only: `src/test/helpers/frontend.tsx:20-21` (TS7017/TS2348: `acquireVsCodeApi` is declared module-locally in `src/webview/app/App.tsx:26` and `src/webview/sidebar/SidebarApp.tsx:27`, so `globalThis.acquireVsCodeApi` has no global declaration, and `ReturnType<typeof vi.fn>` is the non-callable union `Mock<Procedure | Constructable>` in Vitest 5.0.3) and `src/test/lint/allowlist.test.ts:121` (TS2322: with `allowJs` the real return type of `createConfig`, a `ConfigArray`, is inferred and is not assignable to `ESLint`'s `overrideConfig`); the TS7016 pair and the TS7006 at `vsix-contents.test.ts:80` disappear with `allowJs`. `npx tsc -p tsconfig.test.json --noEmit` exits 0 today, so adding it to `check-types` as the plan row says is safe. ADR-000:33-35 (D10) requires tests to type-check against `@types/node@24`; the new config does so by not copying `tsconfig.json:22-28`'s `typeRoots` (which maps `node` to the Node 18 alias), so the ADR's rule is obeyed even though its parenthetical names only `tsconfig.test.json`.

DO:
1. Create `tsconfig.vitest.json` at the repo root: `module: esnext`, `moduleResolution: bundler`, `target: ES2022`, `lib: [ES2022, DOM]`, `jsx: react-jsx`, `strict`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `esModuleInterop`, `skipLibCheck`, `resolveJsonModule`, `noEmit: true`, `allowJs: true` (no `checkJs`), `types: ["node", "vitest/globals"]`, NO `typeRoots` (comment: tests type-check against `@types/node@24`, ADR-000 D10; `typeRoots` would both pick Node 18 and break `vitest/globals` resolution). `include`: `src/core/**/*.test.ts`, `src/protocol/**/*.test.ts`, `src/host/**/*.test.ts`, `src/extension.next.test.ts`, `src/webview/main/**/*.test.ts`, `src/webview/main/**/*.test.tsx`, `src/webview/sidebar-next/**/*.test.ts`, `src/webview/sidebar-next/**/*.test.tsx`, `src/webview/shared/**/*.test.ts`, `src/webview/shared/**/*.test.tsx`, `src/test/lint/**/*.ts`, `src/test/helpers/**/*.ts`, `src/test/helpers/**/*.tsx`, `src/test/__mocks__/**/*.ts`, `src/test/setup-frontend.ts`, `src/global.d.ts`. `exclude`: `node_modules`, `src/_wip/**`, `src/test/e2e/**`, `src/test/ui/**`. Add a comment block naming the legacy set deliberately not listed (`src/services/**/*.test.ts`, `src/webview/app/**`, `src/webview/sidebar/**`, `src/webview/NuGet*.test.ts`, `src/test/integration/**`, `src/test/benchmarks/**`) with "widened to `src/**/*.test.{ts,tsx}` + `src/test/**` by P8.2; core benches join in P2.12".
2. `package.json` `check-types` → `tsc --noEmit && tsc -p tsconfig.test.json --noEmit && tsc -p tsconfig.vitest.json`. Leave `watch:tsc`, `test:e2e`, `test:ui` and `tsconfig.test.json` untouched.
3. Fix the three type-only errors, no assertion or behaviour change: `src/test/helpers/frontend.tsx:20-21` cast `globalThis` to `{ acquireVsCodeApi: Mock<() => MockVsCodeApi> }` (or `vi.mocked`) and call it; `src/test/lint/allowlist.test.ts:121` cast `createConfig([...])` to `Linter.Config[]` via `import type { Linter } from 'eslint'` (prefer the test-side cast over a JSDoc return type in `eslint.config.mjs`). If `allowJs` inference leaves `vsix-contents.test.ts:80` with TS7006, annotate `(file: string) =>` there; nothing else in that file.
4. `vitest.config.mts:46` backend include: add `src/core/**/*.test.ts`, `src/protocol/**/*.test.ts`, `src/host/**/*.test.ts`, `src/extension.next.test.ts`; the dead `src/extension.test.ts` glob may go (the file does not exist; nothing is deleted). Keep `src/test/lint/**/*.test.ts`. The frontend include already matches `src/webview/{main,sidebar-next,shared}`. Then the rest of the row as written: coverage `exclude` += `src/protocol/**`, `src/core/contracts.ts`, `src/**/__fixtures__/**`; `src/_wip/**` in `tsconfig.json` `exclude`, eslint `ignores`, vitest `exclude`, coverage `exclude`; per-directory `src/webview/**` threshold at current values; `benchmarks/README.md` informational.
5. Record in `.github/STATUS.md` (repo-level note, P0.2 convention): under Deviations, (a) ADR-000:35 names only `tsconfig.test.json`; the new `tsconfig.vitest.json` follows the same Node-24 rule; wording rides on the next item allowed to edit ADR-000; (b) the gate "`check-types` includes tests → 0" is met for the 2.0 set; the 55 legacy errors are excluded by file, not fixed. Paste this answer under Advisor decisions.
6. Tracker: P8.2 row Notes += "widen `tsconfig.vitest.json` include to all tests and delete the exclusion comment when legacy tests go". P0.13 row Notes += candidate N-finding "legacy tests pass with calls that do not match production signatures": `src/webview/NuGetSidebarPanel.test.ts:2000-2032` describe `sentinel guards`, titles `getInstalledPackages ignores sentinel projectPath`, `installPackage ignores sentinel projectPath`, `showContextMenu warns when projectPath is sentinel` (constructor is `(extensionUri, context, outputChannel, nugetService)` at `NuGetSidebarPanel.ts:61-66`; the tests pass `svc` as `extensionUri` and leave `_nugetService` undefined; `resolveView` at `:127` takes one argument, so the passed view is ignored; the `not.toHaveBeenCalled` assertions are therefore vacuous and P5.12's v2 sidebar tests must cover sentinel guards for real); `src/test/benchmarks/project-parsing.bench.ts:33-36` (private `getTransitivePackagesFromAssets` at `NuGetProjectService.ts:496` takes one argument; second ignored); `src/webview/app/components/InstalledTab.test.tsx:246-249` (`projects` is not an `InstalledTabProps` prop; the test asserts nothing); `src/test/integration/NuGetPanel.integration.test.ts:43-49` (`dependencyGroups` belongs to `NuGetRegistrationEntry`, `NuGetTypes.ts:229`; `PackageMetadata`, `:87-102`, requires `dependencies`). Each is a separate finding, none is corrected in P0.11.
7. CHANGELOG `## [Unreleased]` `### Changed`: one headline for test type-checking in `check-types`. Gates per §2.2 step 5; `npm run package:vsix` runs because `package.json` scripts changed.

DO NOT:
Edit, cast, or re-arity any legacy test, integration test, bench or `src/test/integration/msw-handlers.ts`; the 55 errors stay as excluded files, not as `// @ts-expect-error` lines.
Widen `tsconfig.test.json` or change its `rootDir`, `outDir`, `types` or `include`.
Copy `typeRoots` from `tsconfig.json` into `tsconfig.vitest.json`, or add `@types-host` to it.
Set `checkJs`, or add `.d.mts` files beside the two `.mjs` scripts when `allowJs` already resolves them.
Add a checked-in error baseline or a "no new errors" script.
Edit `docs/adr/**` for the ADR-000:35 wording; the hook blocks it and the rule is obeyed.
Put legacy globs into the new include "to see what happens" and then exclude them per file.
Change `package.json` `contributes`, or `.vscodeignore` (`:27` `**/tsconfig.*.json` already covers the new file).

CONTRACT CHANGE: none. ADR-000:33-35 (D10: tests against `@types/node@24`) is satisfied by the new config, not changed; its parenthetical naming `tsconfig.test.json` is recorded as a deviation note, not edited. `tsconfig.vitest.json`, `package.json` scripts, `vitest.config.mts`, `tsconfig.json`, `eslint.config.mjs` `ignores` are the item's named outputs; `src/test/helpers/frontend.tsx` and `src/test/lint/allowlist.test.ts` (and, if needed, `src/test/lint/vsix-contents.test.ts:80`) change by this approval, type-only.

VERIFY:
- `npm run check-types` → exit 0 with three `tsc` invocations visible; `npx tsc -p tsconfig.vitest.json` → exit 0, no output.
- `npx tsc -p tsconfig.vitest.json --listFilesOnly | grep -v node_modules` → contains `eslint.config.mjs`, `scripts/check-vsix-contents.mjs`, `src/test/lint/*.test.ts`, `src/test/helpers/*`, `src/test/__mocks__/vscode.ts`, `src/test/setup-frontend.ts`, `src/webview/main/index.test.tsx`, `src/webview/sidebar-next/index.test.tsx`; contains no `src/services/*.test.ts`, no `src/webview/app/**`, `src/webview/sidebar/**`, `src/webview/NuGet*.test.ts`, no `src/test/integration/**`, `src/test/benchmarks/**`, `src/test/e2e/**`, `src/test/ui/**`.
- `grep -c typeRoots tsconfig.vitest.json` → 0; `grep -n '"node"' tsconfig.vitest.json` → in `types` only.
- `git diff --stat -- tsconfig.test.json` → empty; `git diff --stat -- 'src/**/*.test.*' src/test` → only `src/test/helpers/frontend.tsx` and `src/test/lint/allowlist.test.ts` (plus `vsix-contents.test.ts` only if step 3's fallback was needed); `git diff -- src/services src/webview/app src/webview/sidebar src/webview/NuGet*.test.ts src/test/integration src/test/benchmarks` → empty.
- `npx tsc --noEmit` → 0; `npx eslint src` → 0; `npx vitest run` → 44 files, 1591 tests passed; `npx vitest run --coverage` → green with the new `src/webview/**` threshold; `npm run bench` green; `npm run package:vsix` → exit 0; `npm run check:vsix` → 0; `npx vsce ls` → 15 files, none `tsconfig*`.
- `grep -n 'tsconfig.vitest.json' docs/plans/STATUS.md` → the P8.2 row; `grep -n 'sentinel guards' docs/plans/STATUS.md` → the P0.13 row; `.github/STATUS.md` carries this answer under Advisor decisions with date and P0.11.
~~~~

Acted on: `DO` steps 1 to 7 as written. Step 3's fallback for `vsix-contents.test.ts` was not needed.

## Exact next step (one item ID)

P0.12

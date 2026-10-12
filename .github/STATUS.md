# STATUS — .github (agent resources and repo-level items)   commit a0282b2 (parent of the P0.7 commit)   2026-10-12T08:25:00Z

git status --short: ` M eslint.config.mjs`, ` M package.json`, ` M vitest.config.mts`, ` M CHANGELOG.md`,
` M .github/copilot-instructions.md`, ` M .github/instructions/core-boundaries.instructions.md`,
` M docs/plans/STATUS.md`, ` M .github/STATUS.md`, `?? src/test/lint/` (all belong to the P0.7 commit)

Item: **P0.7 ESLint fences**. This file is the handoff note for plan items without a `src/` directory of their
own. The P0.6 note it replaces is in commit `a0282b2`.

## Verified by running

```text
baseline npx tsc --noEmit   → exit 0, no output
baseline npx eslint src     → exit 0, no output
baseline npx vitest run     → Test Files 42 passed (42) · Tests 1495 passed (1495)
pattern probe (ESLint API, 23 specifier/pattern pairs) → '**/webview/app/**' does not match '../app/x';
                              '**/app/**', '**/sidebar/**' and '../NuGet*' do; '**/sidebar/**' does not match
                              '../sidebar-next/x'; '**/extension*' also matches './extensionPoints'
npx eslint src scripts esbuild.mjs → exit 0, no output                                        (item gate)
npm run lint                → exit 0 (eslint src scripts esbuild.mjs eslint.config.mjs vitest.config.mts
                              .vscode-test.mjs)
stdin probes: vscode value as src/core/zz-probe.ts → 1 no-restricted-imports error; the same code as
              src/services/zz-probe.ts → exit 0; '../services/NuGetService' as src/core/zz-probe.ts → 1 error;
              '../app/icons' as src/webview/sidebar-next/zz-probe.tsx → 1 error naming LEGACY_IMPORT_ALLOWLIST
npx vitest run --project backend src/test/lint → Test Files 1 passed (1) · Tests 58 passed (58)
npx tsc --noEmit            → exit 0, no output
npx eslint src              → exit 0, no output
npm test                    → Test Files 43 passed (43) · Tests 1553 passed (1553)
npm run bench               → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npm run package:vsix        → exit 0 · DONE Packaged: nuiget-v1.18.9.vsix (20 files, 528.62 KB); its `package`
                              step ran the widened lint
npm run test:ui             → SKIPPED: no source change in the extension or webviews; not in the plan §2.2
                              gate list for this item
```

## Done (tested)

- `eslint.config.mjs`: four fences built from one `LAYERS` array (core + protocol, 2.0 webview, host,
  `src/extension.next.ts`), each with the 1.x denial; `LEGACY_IMPORT_ALLOWLIST` (empty) with per-layer
  variants that drop only the 1.x denial; `createConfig(allowlist)` exported for the test; `no-console` off
  for `scripts/` and `esbuild.mjs`. No `ignores` list for legacy webview paths.
- `src/test/lint/allowlist.test.ts`: 58 tests through the ESLint API with virtual file paths. 29 denied
  imports, 13 allowed imports, 7 legacy files left alone, the vscode type exemption for core only, the
  allow-list mechanism with a synthetic entry, and the self-pruning logic with synthetic stale, missing,
  legacy, duplicated and malformed entries.
- `package.json` `lint` and `vitest.config.mts` backend include, one line each.

## Done (untested)

- CI still runs `npx eslint src` (`.github/workflows/ci.yml:34`), so `scripts/` and the configuration files are
  linted locally and by `npm run package`, not yet by the CI lint job. P0.8 owns that file.

## Not started

- P0.10: packaging (`.vscodeignore`, `scripts/check-vsix-contents.mjs`, `check:vsix`).

## Deviations from contract/ADR (file:line each)

- `vitest.config.mts:46`: not in the item's output list. One include entry, `src/test/lint/**/*.test.ts`,
  added on advisor approval: the item names the test file, and no project would have run it.
- `package.json:305`: not in the item's output list. `lint` widened on advisor approval; `compile`, `package`
  and `package:vsix` inherit it.
- `eslint.config.mjs:26`: `LEGACY_WEBVIEW_SIBLING_PATTERNS` goes beyond the advisor's `LEGACY_PATTERNS`. It was
  added after measuring that `**/webview/app/**` does not match the sibling specifier `../app/x`, which the
  advisor's own test list requires to be denied. Cost: a 2.0 webview folder named `app` or `sidebar` would be
  denied too.
- `eslint.config.mjs:38`: `**/extension*` is kept literally as the plan states. It also matches a core module
  whose name starts with "extension".
- `src/test/lint/allowlist.test.ts:5`: imports `eslint.config.mjs` from TypeScript. Vitest does not type-check;
  once P0.11 type-checks tests this needs `allowJs` or a declaration (noted in the P0.11 tracker row).
- The quarry `ignores` approach was not ported: the allow-list lists 2.0 files that may import 1.x code, the
  opposite direction from exempting legacy files.

## Advisor decisions (date, item, question, answer verbatim)

### 2026-10-12 · P0.7 · L1 `architecture-advisor` (`claude -p --agent architecture-advisor`)

Brief:

~~~~text
ITEM: P0.7 ESLint fences per plan §3 (port quarry rules; protect sidebar-next; add **/host/**, **/extension* to core denials; allow-list + self-pruning test; lint scripts/, config files)            GATE STATUS: baseline on labs/2.0 @ a0282b2: `npx tsc --noEmit` exit 0 / `npx eslint src` exit 0 / `npx vitest run` 42 files, 1495 tests passed. Nothing edited yet.
OBSERVED: The item's outputs are "eslint.config.mjs, src/test/lint/allowlist.test.ts" and its gate is "`npx eslint src scripts esbuild.mjs` → 0". Four things do not fit that output list or need a choice. (a) No vitest project would run `src/test/lint/allowlist.test.ts`: vitest.config.mts has root `include: []` and three projects with `include` = backend `['src/services/**/*.test.ts', 'src/extension.test.ts']`, frontend `['src/webview/**/*.test.{ts,tsx}']`, integration `['src/test/integration/**/*.integration.test.ts']`. P0.11's listed include extension (`src/core/**`, `src/protocol/**`, `src/host/**`) does not cover `src/test/lint/**` either. vitest.config.mts is not a P0.7 output. (b) "lint scripts/, config files": `npm run lint` is `"lint": "eslint src"` (package.json:305) and CI's lint job runs `npx eslint src --format json -o eslint-report.json` (.github/workflows/ci.yml:34). Neither package.json nor ci.yml is a P0.7 output; P0.8 rewrites ci.yml. Measured today: `npx eslint eslint.config.mjs vitest.config.mts .vscode-test.mjs esbuild.mjs scripts` gives 0 errors and 9 `no-console` warnings, all in esbuild.mjs; the quarry config has an override `files: ['scripts/**/*.mjs', 'esbuild.mjs']` with `no-console: off`. (c) Flat config does not merge rule options: when two config objects set `@typescript-eslint/no-restricted-imports` for the same file, the later one replaces the earlier. The quarry excludes legacy webview code from the webview fence with `ignores: ['src/webview/app/**', 'src/webview/sidebar/**', 'src/webview/NuGet*.ts']`; plan §3 says "`LEGACY_IMPORT_ALLOWLIST` (explicit paths, initially empty) replaces the directory-wide `ignores`, with a self-pruning unit test". (d) The literal core denial pattern `**/extension*` also matches any import specifier with a path segment that starts with "extension", for example a future `src/core/project/extensionPoints.ts` imported as `./extensionPoints`. Also measured: `new ESLint({ cwd }).lintText(code, { filePath: 'src/core/zz-probe.ts' })` lints a file that does not exist on disk against the repository config (0 messages today for a `vscode` value import), so the fences themselves can be unit-tested from a vitest file without creating fixture files under the 2.0 directories. §3 states no rule for `src/extension.next.ts` beyond listing it as 2.0 code.
FILES: docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:140-144 (§3 fences), :185 (P0.7 row), :186 (P0.8), :189 (P0.11), :313 (P8.2 "allow-list → empty"); eslint.config.mjs:1-62; vitest.config.mts:38-68; package.json:305; .github/workflows/ci.yml:18-56; .github/instructions/core-boundaries.instructions.md:22-33; quarry eslint.config.mjs (read in full by the session; its diff against main is: three boundary message constants, the scripts/esbuild `no-console` override, a core/protocol block with paths react, react-dom, vscode (allowTypeImports) and patterns `**/webview/**`, `**/services/**`, a webview block `files: src/webview/**` with the three legacy `ignores` and paths vscode, patterns `**/core/**`, `**/services/**`, and a host block with paths react, react-dom and pattern `**/services/**`)
CONTRACT/ADR IN PLAY: Plan §3: "Core may not import host/extension/webview/services/react/vscode-values; webview-2.0 may not import core/services/vscode; host may not import services/react. `LEGACY_IMPORT_ALLOWLIST` (explicit paths, initially empty) replaces the directory-wide `ignores`, with a self-pruning unit test." Plan §2.1: anything outside the item's files is a stop-and-ask. CLAUDE.md test rules: tests are never left unable to run.
OPTIONS I SEE: For (a): 1) add `'src/test/lint/**/*.test.ts'` to the backend project's `include` in vitest.config.mts in this item; 2) put the test where an existing include already matches (for example under `src/services/`), deviating from the named path; 3) write the test at the named path and leave it unrun until P0.11. For (b): 1) change `lint` to `eslint src scripts esbuild.mjs eslint.config.mjs vitest.config.mts .vscode-test.mjs` in package.json now and leave ci.yml to P0.8; 2) leave package.json alone and only make the gate command pass. For (c): 1) the webview fence targets the 2.0 directories explicitly (`src/webview/{main,sidebar-next,shared}/**`), every 2.0 block also denies the legacy webview paths (`**/webview/app/**`, `**/webview/sidebar/**`, `**/webview/NuGet*`), and one final block `files: LEGACY_IMPORT_ALLOWLIST` turns `@typescript-eslint/no-restricted-imports` off for listed files (the block is omitted while the list is empty); the test fails for an entry that does not exist, is not a 2.0 path, or contains no import of legacy code; 2) per-layer variants of each rule for allow-listed files that drop only the legacy patterns. `LEGACY_IMPORT_ALLOWLIST` is a named export of eslint.config.mjs that the test imports. For (d): 1) the literal `**/extension*`; 2) narrower patterns that match only the extension entry modules (`**/extension`, `**/extension.next`). Extra: 3) add a block for `src/extension.next.ts` that denies `**/services/**` and the legacy webview paths; 4) add ESLint-API tests of each fence (core, protocol, webview 2.0, host, legacy unaffected) to the same test file.
QUESTION: Which option for (a), (b), (c) and (d), and should P0.7 include the `src/extension.next.ts` block and the ESLint-API fence tests?
~~~~

Answer (verbatim):

~~~~text
```text
DECISION: (a) option 1 — add `'src/test/lint/**/*.test.ts'` to the backend project's `include` in vitest.config.mts, recorded as a deviation; (b) option 1 — `"lint": "eslint src scripts esbuild.mjs eslint.config.mjs vitest.config.mts .vscode-test.mjs"` in package.json, ci.yml untouched (P0.8); (c) option 2 — fences target the 2.0 directories explicitly, one `LEGACY_PATTERNS` constant is applied to every 2.0 set, and allow-listed files get a per-layer variant that drops only `LEGACY_PATTERNS`; (d) option 1 — the literal `**/extension*`; extras: yes to the `src/extension.next.ts` block (legacy denials only) and yes to ESLint-API fence tests in the same test file.
WHY: The brief is accurate about the tree (vitest.config.mts:46, package.json:305, ci.yml:34, eslint.config.mjs:1-62, core-boundaries.instructions.md:22-33, clean tree at a0282b2); I could not open the quarry eslint.config.mjs (read denied, as in the P0.6 consultation at .github/STATUS.md:107), but none of the four questions depends on it beyond the brief's summary. (a): `src/test/lint/allowlist.test.ts` is a named output of the P0.7 row (plan :185) and §3:144 calls it "a self-pruning unit test", so a file no project runs does not deliver the output — this is the same "interpreting a named output" reading that P0.6 applied to `.vscode/tasks.json` (.github/STATUS.md:71-73,107), and it is the opposite case from P0.6's "no dead `extension.next.test.ts`" ruling, which concerned a test the item did not name; option 2 is wrong independent of scope because P8.2 (plan :313) deletes `src/services/**` and the legacy tests while the allow-list test must still run then to prove "allow-list → empty", and option 3 breaks the CLAUDE.md rule and P0.6's own precedent. (b): `compile`, `package` and `package:vsix` chain `npm run lint` (package.json:296,302,304) and the P0 gate uses `npm run lint` (plan :196), so the only way the "lint `scripts/`, config files" clause of the row survives the item is in that script — otherwise the gate command and the `no-console` override exist only in a STATUS note; the explicit list is what the session measured (0 errors, 9 warnings all in esbuild.mjs), whereas `eslint .` would also lint `coverage/**`, which eslint.config.mjs:60 does not ignore. (c): core-boundaries.instructions.md:8 and :31-32 define the allow-list as "the only exception to the legacy rule" ("2.0 code does not import legacy code"), i.e. a list of 2.0 files, so the quarry's `ignores` for legacy webview files need no successor once the webview fence names `src/webview/{main,sidebar-next,shared}/**` instead of `src/webview/**`; turning the rule off for an allow-listed file (option 1) would also lift the `vscode`/react/host denials, and P8.2's "`src/services/**` except what core re-exports" shows the entries will be core files importing services, for which the core layer denials must stay. (d): `**/extension*` is stated in §3 (plan :185) and in the boundaries table (:26 `src/extension*`), survives the P8.2 rename unchanged, and its only cost is a visible lint error with a message on a core file that happens to be named `extension…`, so narrowing would be an unforced deviation across two documents.
DO:
1. eslint.config.mjs: keep lines 1-62 as they are and add, before the final `ignores` object: three message constants (core, webview-2.0, host); `export const LEGACY_IMPORT_ALLOWLIST = []` (repo-relative POSIX file paths, no globs); `const LEGACY_PATTERNS = ['**/services/**', '**/webview/app/**', '**/webview/sidebar/**', '**/webview/NuGet*']`; a helper `fence(files, { paths, patterns })` that returns `{ files, rules: { '@typescript-eslint/no-restricted-imports': ['error', { paths, patterns }] } }`.
2. Fences, exactly the §3 table plus the legacy rule: core `files: ['src/core/**/*.ts', 'src/protocol/**/*.ts']` with `paths` `react`, `react-dom`, `{ name: 'vscode', allowTypeImports: true }` and `patterns` `**/host/**`, `**/extension*`, `**/webview/**` + `LEGACY_PATTERNS`; webview-2.0 `files: ['src/webview/main/**/*.{ts,tsx}', 'src/webview/sidebar-next/**/*.{ts,tsx}', 'src/webview/shared/**/*.{ts,tsx}']` with `paths` `vscode` (no type exemption) and `patterns` `**/core/**` + `LEGACY_PATTERNS`; host `files: ['src/host/**/*.ts']` with `paths` `react`, `react-dom` and `patterns` `LEGACY_PATTERNS`; `files: ['src/extension.next.ts']` with `patterns` `LEGACY_PATTERNS` only. No `ignores` entry for legacy webview paths anywhere. Do not add `**/host/**` or `**/extension*` to the webview-2.0 set; the plan's table does not list them.
3. Allow-list wiring: wrap steps 1-2 in `export function createConfig(allowlist)` and `export default createConfig(LEGACY_IMPORT_ALLOWLIST)`. After the four fence objects, for each layer emit a variant object `files: <allowlist entries that fall in that layer>` with the same `paths`/`patterns` minus `LEGACY_PATTERNS`, only when that filtered list is non-empty (never emit `files: []`). Order matters: variants come after the fences.
4. Build-script override: `{ files: ['scripts/**/*.{js,mjs}', 'esbuild.mjs'], rules: { 'no-console': 'off' } }`.
5. package.json:305 → `"lint": "eslint src scripts esbuild.mjs eslint.config.mjs vitest.config.mts .vscode-test.mjs"`. No other package.json change; `contributes` untouched.
6. vitest.config.mts:46 → `include: ['src/services/**/*.test.ts', 'src/extension.test.ts', 'src/test/lint/**/*.test.ts']`. Nothing else in that file.
7. `src/test/lint/allowlist.test.ts` (backend project, `new ESLint({ cwd: <repo root> })`, every assertion filters messages by `ruleId === '@typescript-eslint/no-restricted-imports'` so `no-unused-vars` on probe snippets does not count). Part A, self-pruning, inside one unconditional `it` that loops over `LEGACY_IMPORT_ALLOWLIST` (an `it.each` over an empty list would leave no test): each entry is a unique repo-relative POSIX path without glob characters, exists on disk, lies in a 2.0 set (`src/core/`, `src/protocol/`, `src/host/`, `src/webview/main|sidebar-next|shared/`, or equals `src/extension.next.ts`), and still needs the exemption — `lintText(readFileSync(entry), { filePath: dirname(entry) + '/__allowlist-probe__' + ext })` at a sibling path that is not allow-listed must report ≥ 1 restricted-import message whose text names one of the `LEGACY_PATTERNS`. Part B, allow-list mechanism: `new ESLint({ cwd, overrideConfigFile: true, overrideConfig: createConfig(['src/core/zz-probe.ts']) })` → `src/core/zz-probe.ts` importing `../services/NuGetService` → 0, the same file importing `vscode` as a value → 1. Part C, fences through the real config with virtual `filePath`s (no files created on disk): core `src/core/zz-probe.ts`: `vscode` value → 1, `import type … from 'vscode'` → 0, `react` → 1, `../host/x` → 1, `../extension` → 1, `../extension.next` → 1, `../services/NuGetService` → 1 (relative specifier, proves gitignore-pattern matching), `../webview/main/x` → 1; `src/protocol/zz-probe.ts` with `vscode` value → 1; webview-2.0 `src/webview/sidebar-next/zz-probe.tsx` and `src/webview/shared/zz-probe.ts`: `vscode` → 1, `../../core/x` → 1, `../../services/x` → 1, `../app/x` → 1, `react` → 0, `../../protocol/x` → 0; host `src/host/zz-probe.ts`: `react` → 1, `../services/x` → 1, `../core/x` → 0, `vscode` → 0; `src/extension.next.ts`: `./services/NuGetService` → 1, `./core/x` → 0, `./host/x` → 0, `vscode` → 0; legacy unaffected: `src/services/zz-probe.ts` importing `vscode` → 0, `src/webview/app/zz-probe.tsx` importing `../../services/x` → 0, `src/webview/NuGetProbe.ts` importing `./NuGetPanel` and `../services/x` → 0.
8. Gates in §2.2 order: `npx tsc --noEmit` → 0; `npx eslint src` → 0; `npx eslint src scripts esbuild.mjs` → 0 (item gate); `npm run lint` → 0; `npx vitest run --project backend src/test/lint` → 1 file green; `npm test`; `npm run bench`; `npm run package:vsix` is required for this item because `package` now runs the widened `lint`.
9. Docs duties: CHANGELOG `[Unreleased]` `### Added` one headline for the 2.0 import fences; rewrite the "Enforcement" paragraph of `.github/instructions/core-boundaries.instructions.md:43-46` (it currently says "from P0.7 onwards … until then the table is a convention") to state that `eslint.config.mjs` enforces the table, how `LEGACY_IMPORT_ALLOWLIST` is edited and what the self-pruning test checks, and that `npm run lint` covers `scripts/` and the config files; `.claude/rules/core-boundaries.md` is a pointer and stays; one new row in the 2.0 gotcha table of copilot-instructions.md: flat config replaces rule options wholesale — never add a second `@typescript-eslint/no-restricted-imports` block for files a fence already covers; extend the fence arrays or the allow-list.
10. Handoff: rewrite `.github/STATUS.md` per §2.5 (the note for items without a `src/` directory of their own; do not create `src/test/lint/STATUS.md`), listing under Deviations `vitest.config.mts:46` (one include line, with the §3:144 justification) and `package.json:305` (`lint` widened; `compile`/`package`/`package:vsix` inherit it), and pasting this answer under Advisor decisions. In docs/plans/STATUS.md: P0.8 note "ci.yml:34 should run `npm run lint` instead of `npx eslint src`"; P0.11 note "backend include already contains `src/test/lint/**/*.test.ts` (P0.7) — keep it; `allowlist.test.ts` imports `eslint.config.mjs` from TypeScript, which test type-checking will reject (TS7016) unless `allowJs` or a declaration is added".
DO NOT:
Do not write the test under `src/services/` or any directory P8.2 deletes, and do not leave it at a path no vitest project includes.
Do not touch `.github/workflows/ci.yml` (P0.8), `.vscodeignore` (P0.10), `tsconfig*.json` or the vitest coverage/`_wip` settings (P0.11); the vitest edit is the one include line.
Do not use `eslint .`; `coverage/**` is not ignored and its lcov-report scripts would be linted.
Do not keep or re-create an `ignores` list for `src/webview/app/**`, `src/webview/sidebar/**`, `src/webview/NuGet*.ts`; the webview fence names the 2.0 directories instead.
Do not turn `@typescript-eslint/no-restricted-imports` off for allow-listed files; drop only `LEGACY_PATTERNS`.
Do not add denials beyond the §3 table plus the legacy rule (no `**/host/**` or `**/extension*` for webview-2.0, no `allowTypeImports` on anything but `vscode` in core).
Do not narrow `**/extension*`, and do not add it to any set other than core.
Do not create probe or fixture files under `src/core`, `src/host`, `src/protocol` or `src/webview/{main,sidebar-next,shared}` for the fence tests; use `lintText` with virtual `filePath`s.
Do not use `it.each` over the allow-list as the only test; an empty list must still leave runnable tests.
Do not add a `.d.mts` for `eslint.config.mjs` in this item; record the TS7016 risk for P0.11.
Do not run `npm run watch` and `npm run watch:v2` together while measuring; both write `dist/`.
CONTRACT CHANGE: none
VERIFY: `npx eslint src scripts esbuild.mjs` → exit 0, no output; `npm run lint` → exit 0; `grep -c '"lint": "eslint src scripts esbuild.mjs eslint.config.mjs vitest.config.mts .vscode-test.mjs"' package.json` → 1; `grep -n "src/test/lint" vitest.config.mts` → exactly one line (the backend include); `grep -c "export const LEGACY_IMPORT_ALLOWLIST" eslint.config.mjs` → 1; `grep -c "export function createConfig" eslint.config.mjs` → 1; `grep -c "ignores: \['src/webview/app" eslint.config.mjs` → 0; `printf "import * as vscode from 'vscode';\nexport const v = vscode;\n" | npx eslint --stdin --stdin-filename src/core/zz-probe.ts` → exit 1 naming `@typescript-eslint/no-restricted-imports`; the same input with `--stdin-filename src/services/zz-probe.ts` → exit 0; `printf "import { x } from '../services/NuGetService';\nexport const y = x;\n" | npx eslint --stdin --stdin-filename src/core/zz-probe.ts` → exit 1; `npx vitest run --project backend src/test/lint` → Test Files 1 passed, all tests passed, including a test whose title names the self-pruning check; `npx tsc --noEmit` → 0; `npm test` → 43 files passed (42 + 1), 1495 + the new tests; `npm run bench` → green; `npm run package:vsix` → VSIX written; `grep -c "Until then the table is a convention" .github/instructions/core-boundaries.instructions.md` → 0; `git status --short` shows only eslint.config.mjs, package.json, vitest.config.mts, src/test/lint/allowlist.test.ts, CHANGELOG.md, .github/STATUS.md, .github/copilot-instructions.md, .github/instructions/core-boundaries.instructions.md and docs/plans/STATUS.md.
```

`★ Insight ─────────────────────────────────────`
- **Flat config replaces, it does not merge.** In ESLint's flat config, when two objects match the same file and both set `@typescript-eslint/no-restricted-imports`, the later object's options win outright — there is no union of `paths`/`patterns`. That is why the design builds each fence from arrays in one place (`fence(files, { paths, patterns })`) and derives the allow-list variant by subtracting `LEGACY_PATTERNS`: a second block "adding" a denial would silently delete the first block's denials instead.
- **The allow-list points the opposite way from the quarry's `ignores`.** The quarry exempted *legacy* files from the webview fence by `ignores`. The plan's `LEGACY_IMPORT_ALLOWLIST` is a list of *2.0* files allowed to reach into legacy code (the P8.2 wording "`src/services/**` except what core re-exports" is the tell). Once the fences name `src/webview/{main,sidebar-next,shared}` explicitly, legacy webview files are simply outside every fence and the `ignores` list has nothing left to do.
- **Virtual file paths make the config itself testable.** `ESLint.lintText(code, { filePath })` resolves the flat config for a path that need not exist on disk, so the fence behaviour for `src/host/**` and `src/webview/shared/**` can be asserted today, before P2.9 and P3.1 create those directories — and without planting probe files in 2.0 directories that a later salvage item would have to explain. The one thing worth proving explicitly is gitignore-style matching on *relative* specifiers (`../services/x`), which the quarry config assumed and never tested.
`─────────────────────────────────────────────────`
~~~~

Acted on: `DO` steps 1 to 10 as written, with one measured correction: step 1's `LEGACY_PATTERNS` alone do not
deny `../app/x` from a 2.0 webview file (step 7 requires that), so the webview layer also uses
`LEGACY_WEBVIEW_SIBLING_PATTERNS`.

## Exact next step (one item ID)

P0.10

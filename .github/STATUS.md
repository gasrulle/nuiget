# STATUS — .github (agent resources and repo-level items)   commit b377c1e (parent of the P0.9 commit)   2026-10-12T07:35:00Z

git status --short: ` M CHANGELOG.md`, ` M docs/adr/000-release-and-compatibility-policy.md`, ` M docs/plans/STATUS.md`,
` M package-lock.json`, ` M package.json`, ` M tsconfig.json`, ` M .github/STATUS.md` (all belong to the P0.9 commit)

Item: **P0.9 ADR-000 amendments and Node 18 type-checking baseline**. This file is the handoff note for plan
items without a `src/` directory of their own. It is deliberately not `docs/adr/STATUS.md`: that path is
inside the frozen `docs/adr/**` glob and would need the sentinel on every rewrite once P0.5 lands. The P0.3
note it replaces is in commit `b377c1e`.

## Verified by running

```text
baseline npx tsc --noEmit   → exit 0, no output
baseline npx eslint src     → exit 0, no output
baseline npx vitest run     → Test Files 40 passed (40) · Tests 1491 passed (1491)
scratch probe, @types/node@18.15.13 as the first type root → 1 error:
    src/services/NuGetService.ts(1147,52): error TS2345: Argument of type 'Buffer[]' is not assignable to
    parameter of type 'readonly Uint8Array<ArrayBufferLike>[]'   (typings vs TypeScript 6, not a Node API)
scratch probe, @types/node@18.19.130 as the first type root → 0 errors, 0 files from node_modules/@types/node/
npx tsc --noEmit            → exit 0, no output                                   (item gate)
npx tsc --noEmit --explainFiles | grep -c 'node_modules/@types/node/'      → 0   (no Node 24 types in main)
npx tsc --noEmit --explainFiles | grep -c 'node_modules/@types-host/node/' → 274
npx tsc -p tsconfig.test.json --noEmit → exit 0; its program has 139 explainFiles lines from @types/node/ (24)
npm ls @types/node @types-host/node → @types-host/node@npm:@types/node@18.19.130, @types/node@24.19.2,
                                      no invalid, missing or ERESOLVE
npx eslint src              → exit 0, no output
npm test                    → Test Files 40 passed (40) · Tests 1491 passed (1491)
npm run bench               → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npm run package:vsix        → exit 0 · DONE Packaged: nuiget-v1.18.9.vsix (20 files, 528.38 KB);
                              after its `npm install`: lockfile unchanged, 0 Node 24 files in main
git diff b377c1e -- src/    → empty (no source change)
grep -c 'Supported .NET SDKs: 8, 9, 10' docs/adr/000-release-and-compatibility-policy.md      → 0
grep -c 'same change that lands its replacement' docs/adr/000-release-and-compatibility-policy.md → 0
npm run test:ui             → SKIPPED: no source change; not in the plan §2.2 gate list for this item
targeted vitest             → SKIPPED: the item adds no source or test file
```

## Done (tested)

- `package.json`, `package-lock.json`: dev dependency `"@types-host/node": "npm:@types/node@18.19.130"`
  (exact). `@types/node` stays `^24.19.2`; `engines.node` stays `>=22`.
- `tsconfig.json`: `typeRoots` lists `./node_modules/@types-host` before `./node_modules/@types`;
  `types: ["node"]` unchanged. The main program now type-checks against Node 18 declarations only.
- No Node-18 violation exists in legacy code under 18.19.130, so there is nothing to fix and no N-finding.
- `docs/adr/000-release-and-compatibility-policy.md`: D13 (SDK floor 10, resolved-SDK gate, read-only
  below 10), D10 (host baseline and the type wiring), D2, D11, D9 (release procedure), the `**Breaking:**`
  CHANGELOG convention, and D4 (Consequences bullet on legacy deletion timing).

## Done (untested)

- ADR-000 states decisions whose implementation comes later: bundles targeting `node18`/`chrome114` (P0.6),
  the end-to-end run on VS Code 1.85.0 (P0.8), `npm ci` in CI and `package:vsix` (P0.8, P0.10), the
  resolved-SDK gate (P1.6, P2.5).

## Not started

- P0.5: `scripts/hooks/guard.mjs`, the `hooks` block in `.claude/settings.json`, `.gitignore` entry for
  `.claude/.contract-change`.

## Deviations from contract/ADR (file:line each)

- `package.json:322`: the Node 18 declarations are 18.19.130, not 18.15.x. D10 names the host as Node 18.15;
  the declarations therefore also describe APIs added in Node 18.16 to 18.19. 18.15.13 was measured and
  rejected because it is incompatible with TypeScript 6's generic `Uint8Array` (one error in legacy, and
  the same class would recur in 2.0 byte-handling code). Recorded in ADR-000 as a known residual.
- `docs/adr/000-release-and-compatibility-policy.md:3,52-56`: the P0.9 row lists D2, D9, D10, D11, D13. D4 was
  added to the amendment list on advisor approval (second answer below) because the old Consequences bullet
  ("the old route is deleted in the same change that lands its replacement") contradicted it. The plan row
  was not edited.
- D6 sentinel procedure: no `.claude/.contract-change` file was created. The hook arrives in P0.5 and the
  path is not gitignored until then; the plan orders P0.9 before P0.5 for this reason.
- `tsconfig.json:21`: a `//` comment was added. `tsc` and esbuild read the file as JSONC
  (`node esbuild.mjs` exit 0); a strict JSON parser would not.
- `CHANGELOG.md`: the SDK-floor entry uses `**Breaking:**` followed by plain text, the form plan §2.2 step 6
  gives, instead of a fully bold headline.
- npm 11 printed `npm warn install-scripts` lines for packages with install scripts (esbuild, msw, fsevents,
  `@vscode/vsce-sign`) during the install. They are warnings about existing dependencies, not about the new
  alias; all gates pass. Not investigated further.

## Advisor decisions (date, item, question, answer verbatim)

Both consultations used the L1 `architecture-advisor` agent in a fresh session
(`claude -p --agent architecture-advisor "<brief>"`), because the session that created the agent cannot
call it through the Agent tool.

### 2026-10-12 · P0.9 · brief 1 of 2: `@types/node` wiring (the item's ⚑)

Brief:

~~~~text
ITEM: P0.9 ADR-000 amendments + `@types/node@18` for `tsconfig.json` via `types`, 24 for tests (⚑ before changing `@types/node` wiring)            GATE STATUS: baseline on labs/2.0 @ b377c1e: `npx tsc --noEmit` exit 0 / `npx eslint src` exit 0 / `npx vitest run` 40 files, 1491 tests passed. Nothing edited yet.
OBSERVED: The repo has one `@types/node` (devDependency `^24.19.2`, installed 24.19.2) used by `tsconfig.json` (`types: ["node"]`, main program, excludes tests) and `tsconfig.test.json` (`types: ["node","mocha"]`, e2e/ui tests). Plan D10 sets the extension-host baseline to VS Code 1.85 = Node 18.15 and asks for `@types/node@18` for `tsconfig.json`, 24 for tests. Constraints measured, not assumed: (a) the top-level `@types/node` cannot become 18, because `vitest@5.0.3` declares peer `@types/node: ^22.0.0 || >=24.0.0` and `vite@8.3.4` declares `^20.19.0 || >=22.12.0` (both optional peers; `npm ls @types/node` also shows msw, vscode-extension-tester typings deduped onto it). So Node 18 types must be installed under an npm alias. (b) In a scratch directory outside the repo I installed the alias `@types-host/node` -> `npm:@types/node@<v>` and type-checked the unmodified main program with a temporary tsconfig that extends `tsconfig.json` and sets `"typeRoots": ["<scratch>/node_modules/@types-host", "<repo>/node_modules/@types"]`, `"types": ["node"]`. `tsc --explainFiles` shows the program then contains only the aliased Node 18 declarations and zero files from `node_modules/@types/node/` (v24): because the alias directory is itself named `node` inside an earlier type root, every `types: ["node"]` entry and every transitive `/// <reference types="node" />` resolves to it. (c) With `@types/node@18.15.13` (newest 18.15.x, the exact D10 floor): exactly 1 error, `src/services/NuGetService.ts(1147,52): error TS2345: Argument of type 'Buffer[]' is not assignable to parameter of type 'readonly Uint8Array<ArrayBufferLike>[]'` at `Buffer.concat(chunks)`. This is a typings incompatibility between TypeScript 6's generic `Uint8Array<TArrayBuffer>` lib and the old `Buffer` declaration, not a use of a Node >18 API. (d) With `@types/node@18.19.130` (newest 18.x overall): 0 errors, 0 v24 files in the program; it brings its own `undici-types` dependency. (e) ESLint is not type-aware (`parserOptions` has only `tsconfigRootDir`), Vitest does not type-check, CI runs `npx tsc -p tsconfig.test.json` separately, so only `tsc -p tsconfig.json` (`npm run check-types`) sees the change. `package.json` `engines.node` is `>=22` and `.nvmrc` is 24 (the development toolchain, not the extension host). Neither the quarry `package.json` nor its `tsconfig.json` attempted this wiring (both identical to main here).
FILES: docs/plans/2026-10-11-nuiget-2.0-execution-plan.md (D10 at line 54, D13 at line 57, P0.9 row at line 187, P0.11 row at line 189); docs/adr/000-release-and-compatibility-policy.md:1-31; package.json (engines lines 21-24, devDependencies); tsconfig.json:1-36; tsconfig.test.json:1-28; src/services/NuGetService.ts:1138-1150; eslint.config.mjs:14-24; .github/workflows/ci.yml:100-112
CONTRACT/ADR IN PLAY: Plan D10: "Extension-host baseline is VS Code 1.85: Node 18.15, Chromium 114. esbuild node18/chrome114; @types/node@18 for tsconfig.json, 24 for tests." Plan P0.9 gate: "`npx tsc --noEmit` -> 0 (Node-18 violations in legacy are fixed or listed as N-findings)". ADR-000 currently says "Supported .NET SDKs: 8, 9, 10 (noun-first CLI syntax detection stays)", which D13 replaces.
OPTIONS I SEE: 1) Alias `@types-host/node` -> `npm:@types/node@18.15.13` pinned exactly (types equal the floor), `tsconfig.json` gains `typeRoots: ["./node_modules/@types-host", "./node_modules/@types"]` and keeps `types: ["node"]`; fix the one legacy line (e.g. type `chunks` as `Uint8Array[]`) since `src/services/NuGetService.ts` is not named by the item, or list it as an N-finding and leave tsc red (not acceptable for the gate). 2) Same wiring with the alias at `~18.19.130` (0 errors, no legacy edit); the declarations then also describe APIs added in Node 18.16-18.19 that the 18.15 host lacks, so D10 is approximated, not exact. 3) Alias under a different local name and `types: ["<alias>"]` without `typeRoots` (not measured; transitive `/// <reference types="node" />` would then also load v24 into the main program). 4) Top-level `@types/node@18` plus an alias for 24 and `overrides` to silence the vitest/vite peer ranges.
QUESTION: Which wiring and which exact `@types/node` 18.x version should P0.9 commit, is the alias name `@types-host/node` acceptable, may P0.9 touch `src/services/NuGetService.ts:1147` if the chosen version needs it, and should `engines.node` in `package.json` stay `>=22`?
~~~~

Answer (verbatim):

~~~~text
DECISION: Option 2, exact-pinned: devDependency `"@types-host/node": "npm:@types/node@18.19.130"`; `tsconfig.json` gains `"typeRoots": ["./node_modules/@types-host", "./node_modules/@types"]` and keeps `"types": ["node"]`; `src/services/NuGetService.ts` is not touched; `engines.node` stays `>=22`. Alias name `@types-host/node` is accepted.

WHY: D10 (plan line 54) prescribes `@types/node@18` by major only ("Node 18.15" names the host, not a typings patch level), so 18.19.130 satisfies it literally, and it is the DefinitelyTyped line maintained against TypeScript 6's generic `Uint8Array`, which the 2023-era 18.15.13 predates. The single 18.15.13 error at `src/services/NuGetService.ts:1147` (`chunks: Buffer[]` from :1126 passed to `Buffer.concat`) is a typings incompatibility, not a Node-18 violation, so the gate clause "Node-18 violations in legacy are fixed" does not cover it, an edit there is a type error outside the item's files (§2.1, §2.3), and with `skipLibCheck: true` (tsconfig.json:17) the same class would resurface in every byte-handling 2.0 item (P1.4, P4.2, P4.4). The top-level `@types/node` must stay 24 because `node_modules/vitest/package.json:120` declares `^22.0.0 || >=24.0.0` and `node_modules/vite/package.json:124` `^20.19.0 || >=22.12.0`; the alias folder being literally named `node` under the earlier type root is what makes both `types: ["node"]` and transitive `/// <reference types="node" />` resolve to 18 (the brief's `--explainFiles` measurement), which option 3 forfeits and option 4 buys with peer overrides. Exact pin follows `@types/vscode: "1.85.0"` (package.json:326) and the "a caret silently permits newer APIs" gotcha; the residual 18.16–18.19 API surface is a known gap closed at runtime by the P0.8 e2e job on `VSCODE_TEST_VERSION` 1.85.0. `engines.node` describes the development toolchain (vite 8 itself needs ≥ 20.19; `.nvmrc` is 24) and VS Code never reads it for the host; D10's remedy is the typings, not that field. Verified: branch `labs/2.0` @ b377c1e, `git status --short` empty, installed `@types/node` 24.19.2 (package-lock.json:2552-2554), `Buffer.concat` has exactly one non-test call site, esbuild.mjs:26-37 sets no `target` (P0.6's job); the quarry files are outside this sandbox and unverified, which is immaterial because the P0.9 row names no quarry input.

DO:
1. `npm install --save-dev --save-exact @types-host/node@npm:@types/node@18.19.130`. Confirm `package.json` gains exactly `"@types-host/node": "npm:@types/node@18.19.130"` and `@types/node` stays `^24.19.2`. If `tsc` later complains about `undici-types`, look at where npm placed 18.19's copy (nested under `node_modules/@types-host/node/node_modules/` or hoisted) and fix placement; do not fall back to 18.15.13.
2. `tsconfig.json` `compilerOptions`: add `"typeRoots": ["./node_modules/@types-host", "./node_modules/@types"]`; keep `"types": ["node"]`. A one-line `//` comment that the `node` folder name is load-bearing is allowed (tsc and esbuild parse JSONC); the normative text goes in ADR-000. Leave `tsconfig.test.json` as is — its `types: ["node","mocha"]` with default type roots is the "24 for tests" half of D10 and is already true.
3. `docs/adr/000-release-and-compatibility-policy.md` (P0.9 is in D6's named list; the P0.5 hook does not exist yet and `.claude/.contract-change` is not yet gitignored, so create no sentinel): replace lines 20-21 ("Supported .NET SDKs: 8, 9, 10 (noun-first CLI syntax detection stays)…") with D13 (floor 10; gate on the SDK each project resolves, `global.json` pins win; below 10 → `unsupported`, "requires .NET SDK 10 or newer", read-only, browsing still works); add D2, D9 release procedure, D11 and the CHANGELOG `**Breaking:**` convention. The D10 paragraph states: host baseline VS Code 1.85 = Node 18.15 / Chromium 114; `tsconfig.json` type-checks against `@types-host/node` (npm alias of `@types/node@18.19.130`, exact) via `typeRoots`; tests type-check against `@types/node@24`; `engines.node` is the development-toolchain floor, not the host; the 18.16–18.19 typings surface is a known residual covered by the 1.85.0 e2e job; esbuild `node18`/`chrome114` land in P0.6. Update the status/date line.
4. `CHANGELOG.md` `## [Unreleased]` `### Changed`: one `**Breaking:**` headline for the SDK 10 floor (D13 names no later item for it; P0.9 is where D13 is recorded) and one headline for the Node 18 typings baseline; headlines only.
5. Gates in §2.2 order: `npx tsc --noEmit`, `npx eslint src`, `npm test`, `npm run bench`, then `npm run package:vsix` — run it rather than SKIPPED, because `package.json` changed and its embedded `npm install` is the proof that the alias survives a fresh install (the MSW gotcha's reason); `npm run test:ui` as a literal `SKIPPED:` line with the reason.
6. Rewrite `.github/STATUS.md` for P0.9 from the §2.5 template (its line 124 already names P0.9 and it is the established note for items without a `src/` directory; do not create `docs/adr/STATUS.md`, which would put a mutable handoff note inside a D6-frozen path). Paste this answer verbatim under `## Advisor decisions`; under `## Deviations` record the 18.19.130-vs-18.15 typings gap. Tracker: P0.9 `done`, P0.3 Commit column `b377c1e`.
7. Commit via the `git-commit` skill citing P0.9, D2, D9, D10, D11, D13, ADR-000; push `labs/2.0`; wait for green CI.

DO NOT:
Edit `src/services/NuGetService.ts` or any other `src/` file; 18.19.130 needs no such change and it is outside the item's files.
Install `@types/node@18.15.13` "because the floor is 18.15"; D10 names the major only.
Change the top-level `@types/node` to 18, add `overrides` for the vitest/vite peers, or use `--legacy-peer-deps` (option 4).
Use an alias whose package name is not `node` (option 3); transitive `/// <reference types="node" />` would pull v24 back into the program.
Drop `"types": ["node"]` or rely on `typeRoots` alone.
Change `engines.node`, `.nvmrc`, `tsconfig.test.json`, `eslint.config.mjs` or `.github/workflows/ci.yml`.
Add esbuild `target: 'node18'`/`'chrome114'`; that is P0.6.
Create `.claude/.contract-change`; the hook does not exist yet and the path is not yet gitignored, so it could land in the commit.
Mark `npm run package:vsix` SKIPPED.

CONTRACT CHANGE: `docs/adr/000-release-and-compatibility-policy.md` only, by P0.9 (named in D6); no change to `src/protocol/**` or `src/core/contracts.ts`.

VERIFY: `npx tsc --noEmit` → exit 0; `npx tsc --noEmit --explainFiles | grep -c 'node_modules/@types/node/'` → 0 and `npx tsc --noEmit --explainFiles | grep -c 'node_modules/@types-host/node/'` → > 0; `grep -c '"@types-host/node": "npm:@types/node@18.19.130"' package.json` → 1; `grep -c '"@types/node": "^24.19.2"' package.json` → 1; `grep -c '"./node_modules/@types-host"' tsconfig.json` → 1; `npm ls @types/node` → one `@types/node@24.19.2`, no `invalid` or `ERESOLVE`; `npx tsc -p tsconfig.test.json --noEmit` → 0 (tests still on 24); `git diff --stat b377c1e -- src/` → empty; `grep -c 'Supported .NET SDKs: 8, 9, 10' docs/adr/000-release-and-compatibility-policy.md` → 0; `grep -c '"node": ">=22"' package.json` → 1; `npm run package:vsix` → green.
~~~~

Acted on: `DO` steps 1 to 7 as written.

### 2026-10-12 · P0.9 · brief 2 of 2: ADR-000 Consequences bullet versus plan D4

Brief:

~~~~text
ITEM: P0.9 ADR-000 amendments (second brief for this item; the first decided the `@types/node` wiring)            GATE STATUS: working tree on labs/2.0 @ b377c1e with uncommitted P0.9 edits (package.json, package-lock.json, tsconfig.json, docs/adr/000-release-and-compatibility-policy.md): `npx tsc --noEmit` exit 0, main program contains 0 files from node_modules/@types/node/ and 274 explainFiles lines from node_modules/@types-host/node/, `npx tsc -p tsconfig.test.json --noEmit` exit 0. eslint/npm test/bench/package:vsix not yet re-run.
OBSERVED: While amending ADR-000 I read its unchanged Consequences section. The first bullet says: "No dual-protocol period; features migrate one at a time but the old route is deleted in the same change that lands its replacement." Plan decision D4 says the opposite about deletion timing: "One long-lived work branch labs/2.0, no hybrid period, legacy deleted only at the flip ... Both 2.0 webviews are completed before the flip (P8)", and plan item P8.2 is the legacy deletion. The P0.9 row lists the amendments to make as "D2, D10, D11, D13 ..., release procedure (D9), CHANGELOG breaking convention"; D4 is not in that list. P1.1b lists ADR amendments for 002 to 008 only, so no later item is scheduled to fix ADR-000. The same Decision section also still says "Legacy handlers, the nuiget.noRestore migration and compatibility aliases are deleted rather than kept", which is compatible with D4 (it does not say when). I have not touched either sentence.
FILES: docs/adr/000-release-and-compatibility-policy.md (Consequences section, the bullet starting "No dual-protocol period"; the working-tree version includes my uncommitted amendments above it); docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:48 (D4), :50 (D6), :187 (P0.9 row), :203 (P1.1b row), :312-313 (P8.1, P8.2)
CONTRACT/ADR IN PLAY: ADR-000 Consequences: "the old route is deleted in the same change that lands its replacement" versus plan D4: "legacy deleted only at the flip". Plan §2.3 lists "a contract/ADR mismatch" as a universal stop-and-ask trigger. D6: docs/adr/** changes only in the items that name them (P0.9 is one of them) or in an advisor-approved contract-change item.
OPTIONS I SEE: 1) Amend that one Consequences bullet in this item so it matches D4 (no dual-protocol period inside 2.0; 1.x and 2.0 coexist on labs/2.0 behind the `--v2` build switch; legacy is deleted at the flip, P8.2), and record in the handoff note that D4 was added to the P0.9 amendment list on advisor approval. 2) Leave the bullet unchanged, record the mismatch as a candidate finding for P0.13's ledger and a deviation in the handoff note. 3) Treat it as an owner decision.
QUESTION: Should P0.9 correct the ADR-000 Consequences bullet to match D4, and if so with what wording?
~~~~

Answer (verbatim):

~~~~text
DECISION: Option 1. Correct the one Consequences bullet in ADR-000 inside P0.9 so it matches D4, add D4 to the `Amended:` list on line 3, and record the addition as a deviation in the handoff note. Not an owner decision.

WHY: The brief is accurate on the tree: `docs/adr/000-release-and-compatibility-policy.md:52-53` still reads "the old route is deleted in the same change that lands its replacement", which instructs an in-place, feature-by-feature deletion that plan D4 (`:48`, "no hybrid period, legacy deleted only at the flip … Both 2.0 webviews are completed before the flip (P8)"), the risk table (`:347`, "deletion only in P8"), P5.12 (`:280`, ⚑ before deleting any legacy test) and P8.2 (`:313`) all forbid; a literal implementer in P3–P5 could act on the ADR sentence, so it is a hazard, not a cosmetic drift. D6 (`:50`) allows `docs/adr/**` edits "in the items that name them (P0.9, …)", and ADR-000 is P0.9's item file, so this is a named-item edit; the P0.3 precedent ("do not edit the plan") does not transfer because the plan was not an item file and ADR-000 is. Plan `:194` settles the timing: "P0.9 precedes P0.5 so the ADR-000 edit is not blocked by the hook"; P1.1b (`:203`) amends 002 to 008 only, so Option 2 would freeze a known contradiction behind the hook and convert a one-line edit into an unscheduled sentinel item later, which violates the lose-the-least-work rule. Option 3 fails because D4 is an explicit owner decision already taken; aligning an older document to it enforces D1–D13 rather than reopening them, and the Context paragraph the session added (`:12-14`) already declares that this ADR records the plan's §1 decisions and that the plan supersedes the audit plan's execution model, which is where the in-place wording came from. The Decision bullet at `:18-20` ("deleted rather than kept") states only *that* legacy is deleted, not when, and stays as it is; no other ADR states a deletion timing (`grep -n -i "legacy|flip|coexist" docs/adr/00[1-8]*.md` hits only ADR-007:9, a 1.x history sentence in Context).

DO:
1. In `docs/adr/000-release-and-compatibility-policy.md` replace lines 52-53 with one bullet that keeps the lead phrase and cites D4, wrapped at the file's ~100-column width. Candidate wording (the session may tighten it; the four facts in it are the constraints):
   `- No dual-protocol period: the 2.0 webviews and host speak only the 2.0 protocol, and no shim, alias`
   `  or legacy handler bridges 1.x messages or storage. Until the flip (D4), 1.x and 2.0 coexist in the`
   `  tree as separate build entries (\`node esbuild.mjs --v2\` selects 2.0; the default selects legacy),`
   `  a 2.0 feature never replaces a legacy route in place, and the legacy code is deleted in one step`
   `  after both 2.0 webviews are complete (plan items P8.1 and P8.2).`
2. On line 3 change the list to `decisions D2, D4, D9, D10, D11, D13` so the status line does not become the next mismatch.
3. Leave lines 18-20 and every other Consequences bullet untouched.
4. Rewrite the handoff note for P0.9 from the §2.5 template in `.github/STATUS.md` (the convention set by the P0.2 tracker note and `.github/STATUS.md:6-7` for items without a `src/` directory). Under `## Deviations from contract/ADR` add one line: the P0.9 row (plan `:187`) lists D2, D9, D10, D11, D13; D4 was added to the amendment list on advisor approval (this answer) because ADR-000:52-53 contradicted it; the plan row is not edited. Under `## Advisor decisions` paste both P0.9 briefs and both answers verbatim with date and item ID (`git status --short` shows neither has been recorded yet).
5. No separate CHANGELOG bullet for this correction; it rides inside P0.9's existing `[Unreleased]` entry.
6. Continue the item's remaining gates in the §2.2 step 5 order (`npx eslint src`, `npm test`, `npm run bench`, `npm run package:vsix` because `package.json` and `tsconfig.json` changed), then the normal landing steps.

DO NOT:
Answer this with `OWNER MUST DECIDE`; D4 is already the owner's decision and the ADR is being aligned to it.
Create `docs/adr/STATUS.md`; it would sit inside the frozen `docs/adr/**` glob and need the sentinel on every rewrite after P0.5.
Edit the plan's P0.9 row or the D4 text to make the documents agree; record the deviation in the handoff note instead.
Drop the lead phrase "No dual-protocol period" or the Decision bullet at `:18-20`; both remain true under D4.
Defer the fix to P1.1b or a future contract-change item; P1.1b names 002 to 008 only and the hook lands at P0.5.
Touch ADR-007:9 or any other ADR for this; none states a deletion timing.
Reword the bullet to say legacy is deleted "at P8.3" or "at release"; the deletion is P8.2, after the flip PR P8.1.

CONTRACT CHANGE: `docs/adr/000-release-and-compatibility-policy.md`, item P0.9 (named in D6, plan `:50`). No sentinel is required because P0.5 has not landed and plan `:194` orders P0.9 before P0.5 for exactly this reason.

VERIFY: `grep -c 'same change that lands its replacement' docs/adr/000-release-and-compatibility-policy.md` → 0; `grep -c 'D4' docs/adr/000-release-and-compatibility-policy.md` → 2 (status line and the bullet); `grep -c 'P8.2' docs/adr/000-release-and-compatibility-policy.md` → 1; `git diff --stat -- docs/adr` lists only `000-release-and-compatibility-policy.md`; `npx tsc --noEmit` → exit 0 unchanged; `grep -c 'D4' .github/STATUS.md` ≥ 1 after the handoff note is rewritten.

`★ Insight ─────────────────────────────────────`
- The deciding fact was ordering, not wording: plan `:194` deliberately runs P0.9 before the P0.5 hook so ADR-000 can be edited without the sentinel. Any ADR-000 inconsistency found now is cheapest to fix now; the same edit after P0.5 needs an advisor-approved contract-change item that no row schedules.
- "Item files" is a file-level permission (D6 names ADR-000 for P0.9), while the row's amendment list is the item's *minimum* scope. That distinction is what separates this case from the P0.3 precedent, where the plan itself was off-limits because no item names it.
- The handoff-note location matters for frozen globs: a `STATUS.md` under `docs/adr/` would inherit the hook's denial, so handoff notes for doc-only items belong outside `docs/adr/**`.
`─────────────────────────────────────────────────`
~~~~

Acted on: `DO` steps 1 to 6 as written, with the candidate wording unchanged.

## Exact next step (one item ID)

P0.5

# STATUS — .github (agent resources and repo-level items)   commit e29549f (parent of the P8.1 commit)   2026-10-16T13:30:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/STATUS.md`,
`.github/copilot-instructions.md`, `.github/workflows/ci.yml`, `.vscode-test.mjs`, `.vscode/{launch,tasks}.json`,
`ARCHITECTURE.md`, `CHANGELOG.md`, `docs/perf-baseline.md`, `docs/plans/{STATUS,findings-ledger}.md`, `esbuild.mjs`,
`package.json`

Item: **P8.1** — the flip, by the P8.1 ⚑ ruling of 2026-10-16 (verbatim below and in `docs/plans/STATUS.md`,
"P8.1 — ⚑ ruling: the flip"). The default build, the e2e and UI scripts and the CI jobs are 2.0; the 1.x sources stay
in the tree, unbuilt, until P8.2. Rollback: `git revert` of this commit. This note replaces the P7.6 note (in this
file's history at `d1dc584`).

## Verified by running

```text
baseline (e29549f)          → npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npx vitest run exit 0,
                              169 files, 3433 passed, 9 skipped
npx tsc --noEmit            → exit 0
npm run check-types         → exit 0
npx eslint src              → exit 0
npm run lint                → exit 0 (covers esbuild.mjs and .vscode-test.mjs)
npm test                    → exit 0; Test Files 169 passed (169); Tests 3433 passed | 9 skipped (3442)
npm run bench               → exit 0; Test Files 20 passed (20); Tests 119 passed | 1 skipped (120)
npm run docs:check          → exit 0; "docs:protocol:check — docs/protocol.md is up to date."
npx vitest run --project backend src/test/lint → 11 files, 163 passed (163)
rm -rf dist && node esbuild.mjs --production --analyze
                            → dist/extension.js 293183 / 321341 · dist/webview.js 525241 / 575626 ·
                              dist/sidebar.js 319313 / 350684 · [production] Build complete · exit 0
ls dist                     → extension.js sidebar.css sidebar.js webview.css webview.js
grep -c refreshPackagesScoped dist/extension.js → 0 (control: the same build at e29549f → 2)
npm run check:vsix          → check:vsix: OK (exit 0)
rm -rf dist && npm run package && npm run check:vsix → exit 0, check:vsix: OK
node esbuild.mjs --production && npm run test:e2e                         → 25 passing (stable)
VSCODE_TEST_VERSION=1.85.0 npm run test:e2e                               → 25 passing
rm -rf dist && npm run test:ui -- --storage /tmp/nuiget-ui                → 32 passing (56s), exit 0; then
                              npm run check:vsix → check:vsix: OK; git status --porcelain src/test/e2e/fixtures → empty
npm run package:vsix        → exit 0; Tests 3433 passed | 9 skipped; "DONE Packaged: nuiget-v1.18.9.vsix (17 files,
                              565.14 KB)"; npx vsce ls → CHANGELOG.md LICENSE README.md dist/{extension,sidebar,webview}.js
                              dist/{sidebar,webview}.css package.json resources/ (7 files)
VERIFY 5 grep               → copilot-instructions.md:176 (the N65 sighting, history) and docs/perf-baseline.md:17,34,35,36
                              (job names of the measured runs, history) and :117 (the sentence that says so)
CI                          → see the tracker row P8.1 and the next item's commit; expected jobs (10): Lint,
                              Test (ubuntu-latest), Test (windows-latest), SDK probe, E2E (1.85.0), E2E (stable), UI,
                              Build & Package, Benchmark (informational), Perf baseline (informational)
npm run test:ui (1.x)       → SKIPPED: the 1.x UI suite is no longer selected by any script (this item)
```

## Done (tested)

- `esbuild.mjs`: the 2.0 entries only; one ceiling table (the P7.2a values); `isV2`, `--v2`, `NUIGET_V2` gone.
- `package.json` scripts: `watch:v2`, `watch:esbuild:v2`, `test:ui:v2` gone; `test:ui` runs `out/test/ui/v2`.
  `contributes` untouched.
- `.vscode-test.mjs` selects `out/test/e2e/v2-*.e2e.test.js` only.
- `.github/workflows/ci.yml`: legacy `e2e` and `ui` deleted; the 2.0 jobs are `e2e` ("E2E (…)") and `ui` ("UI")
  without `NUIGET_V2`; `build` unchanged except its comment.
- `.vscode/launch.json` "Run 2.0" and `.vscode/tasks.json` `watch:v2`, `npm: watch:esbuild:v2` gone.
- Docs: ARCHITECTURE 2.0 section (intro, sidebar and main panel build sentences, Coexistence, Bundle size, CI table,
  the suites paragraph), copilot-instructions (command list, two moot rows deleted: "Two watchers, one `dist/`",
  "Stale files in `dist/`"; four reworded: "Bundle ceilings are checked in CI", "A 2.0 entry without its stylesheet
  import", "A test outside the `v2` suites runs nowhere" (was "A 2.0 VSIX and the `v2` suites need `NUIGET_V2=1`"),
  "Call at module level in a 2.0 webview module"; the Tooling intro sentence dropped), perf-baseline recipes,
  CHANGELOG `[Unreleased]` (three lines reworded, one `**Breaking:**`).
- Ledger: N27, N32 closed (P8.1).

## Done (untested)

- CI on the pushed commit (recorded in the next item's commit).

## Not started

- P8.2 (⚑): legacy deletion, renames, `bench:save`; residue handed to it in its tracker row.

## Deviations from contract/ADR (file:line each)

- None from a contract or ADR. ADR-000:52-55 (frozen) describes the period up to this commit and stays.
- From the P5.12b map (`docs/plans/test-retirement-map.md:93,99`): `test:ui` is kept as the name and points at
  `out/test/ui/v2`; `test:ui:v2` goes (ruling 2(b); the map is not edited, the tracker note supersedes it).
- From the ruling's text: the `UI` job uses `--storage /tmp/nuiget-ui` (`.github/workflows/ci.yml`), not
  `/tmp/nuiget-ui-v2` (DO 4), because VERIFY 5's `ui-v2` pattern matches that path and README and the macOS tooling
  row already name `/tmp/nuiget-ui`; `ARCHITECTURE.md` "Build System (1.x — removed at P8)" bullet on `--v2`
  reworded (outside the 2.0 section, needed for VERIFY 5); `docs/perf-baseline.md:17,34-36` keep the old job names as
  history, with a sentence under the recipes.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P8.1 (⚑): what file set, script and job shape, ceiling table, CHANGELOG form and ledger handling the flip
implements. Answer, verbatim:

`````text
DECISION: Option 1(b) scope with a grep-defined edit rule; UI script 2(b) (keep the name `test:ui`, point it at the 2.0 glob, delete `test:ui:v2`, recorded as a refinement of the P5.12b map); CI 3(b) (delete the legacy `e2e` and `ui` jobs, the surviving jobs take the ids `e2e`/`ui` and the names `E2E (…)`/`UI`; `build` keeps `needs: [lint, test, e2e]` unchanged and keeps `--analyze`); ceilings 4 as one table with the 2.0 values and no error for `--v2`; CHANGELOG 5(a); N27 and N32 closed at P8.1 with no `dist/` clean; option 7 untouched; note in `.github/STATUS.md`.

WHY: Plan §2.1 already makes CHANGELOG `[Unreleased]`, the ARCHITECTURE 2.0 section and `docs/plans/STATUS.md` the item's files, and the P5.12b ruling (`docs/plans/test-retirement-map.md:93-105`) names `.vscode-test.mjs` and `test:ui` for P8.1; `.vscode-test.mjs` is not optional, because once `NUIGET_V2` leaves the e2e job its `!(v2-*)` branch (`.vscode-test.mjs:9`) would run the 1.x suite against a 2.0 build. The rulesets of `main` (12524593) and `labs` (14504177) require only the contexts `Lint`, `Test` and `Build & Package`, so the ids and names of the E2E and UI jobs are free, and the rows P7.5c kept for 2.0 ("The `E2E (1.85.0)` CI job is the guard"; the N37/N44/N65 signature row; the macOS IPC row `npm run test:ui -- --storage`), README :253-256, `.vscode/tasks.json:149`, copilot rule 1 and both github-actions skill files name the unqualified job names and the script `test:ui`: giving the 2.0 jobs those ids and keeping the script name leaves all of them true without an edit, while the map's literal reading would falsify six places and leave a `:v2` suffix no later item renames. Your measurement (2.0 sidebar 319313 > 1.x ceiling 304097) settles the ceiling table: the single table carries the P7.2a values 321341 / 575626 / 350684 (`esbuild.mjs:38-42`). ADR-000:52-55 says 1.x and 2.0 coexist "until the flip" and that the Breaking-changes section is assembled "at release" (P8.3's bump), so ADR-000 stays untouched (D6) and the CHANGELOG work is one `**Breaking:**` headline plus rewording of the three `[Unreleased]` lines that describe `--v2`. "No renames" in the row title is the P8.2 sentence about `extension.next.ts` and `sidebar-next` (plan :318); a CI job id or a script key is neither a source path nor a test name, and rollback stays "revert this commit" because every change is in build, script, workflow and document files.

DO:
1. `esbuild.mjs`: delete lines 7-9 (`isV2`, the `NUIGET_V2` comment) and the 1.x branch of `ENTRIES` (:22-26) so the three entries are `src/extension.next.ts`, `src/webview/main/index.tsx`, `src/webview/sidebar-next/index.tsx` (comment: "The 2.0 entry points; the 1.x sources stay in the tree until P8.2 and are not built"); delete the 1.x table (:28-36); rename `V2_BUNDLE_CEILINGS` to `BUNDLE_CEILINGS` with its P7.2a comment, ending "P8.2 re-measures and resets."; `reportCeilings` (:130) reads `BUNDLE_CEILINGS[config.outfile]`. Do not add a check for an unknown `--v2` argument.
2. `package.json` scripts: delete `watch:esbuild:v2` and `watch:v2`; set `test:ui` to the body of today's `test:ui:v2` (`tsc -p tsconfig.test.json && extest setup-and-run out/test/ui/v2/*.ui.test.js --code_version max --code_settings src/test/ui/settings.json --open_resource src/test/e2e/fixtures/e2e-workspace`; no `package:vsix` prefix: ExTester's `vscode:prepublish` builds 2.0 unaided and the `ui` job's `check:vsix` checks that build); delete `test:ui:v2`. No other key changes; `contributes` is not touched.
3. `.vscode-test.mjs`: `files: 'out/test/e2e/v2-*.e2e.test.js'`, delete the `v2` const and its comment; new comment: the 2.0 extension-host suites; the 1.x e2e files are compiled by `tsconfig.test.json` but selected by nothing until P8.2 deletes them.
4. `.github/workflows/ci.yml`: delete the jobs `e2e` (:166-255) and `ui` (:256-290). In the former `e2e-v2` (:292-383): id `e2e`, name `E2E (${{ matrix.vscode }})`, remove `NUIGET_V2: '1'`, build step `node esbuild.mjs --production --analyze 2>&1 | tee "$RUNNER_TEMP/esbuild.txt"` (grep line follows), log file and artifact `e2e-output.txt` / `e2e-log-${{ matrix.vscode }}`, step names without "(2.0)", the comment at :291 rewritten without `NUIGET_V2`. In the former `ui-v2` (:387-427): id `ui`, name `UI`, remove `NUIGET_V2: '1'`, run `xvfb-run -a npm run test:ui -- --storage /tmp/nuiget-ui-v2 2>&1 | tee "$RUNNER_TEMP/ui-output.txt"` (the log stays outside the checkout: that is what closes N32), keep the `check:vsix` step, artifact `ui-log`, the comment at :385-386 rewritten without `NUIGET_V2`. `build` (:428-471): `needs: [lint, test, e2e]` unchanged, `node esbuild.mjs --production --analyze` unchanged, comment at :447 "the bundle ceilings" instead of "the 1.x bundle ceilings". Do not add `ui` to `build.needs`.
5. `.vscode/launch.json`: delete the "Run 2.0" configuration (:17-26); "Run Extension" with `watch` now runs 2.0. `.vscode/tasks.json`: delete the tasks `watch:v2` and `npm: watch:esbuild:v2` (:45-80); "Run UI Tests" (:149) stays.
6. Documents, by one rule: edit every line that names a script, flag, variable, job, launch configuration or ceiling table this commit deletes or that would now be a missing script (`watch:v2`, `watch:esbuild:v2`, `test:ui:v2`, `--v2`, `NUIGET_V2`, "Run 2.0", the 1.x table, "E2E 2.0" / "UI 2.0" as current job names) so that it describes the tree after the commit; leave history and sightings. Files: `ARCHITECTURE.md` 2.0 section only (:18 intro; the "Coexistence of 1.x and 2.0" subsection :770-781 becomes a short paragraph: one entry set since P8.1, the 1.x sources stay unbuilt until P8.2; the "Bundle size" bullet :805-808, one table; the CI table :826-834, two legacy rows gone and no `NUIGET_V2`; "The 2.0 entries under test" :836-859 without the variable mechanism, keeping what the suites prove), `.github/copilot-instructions.md` (the command list line for `watch:v2`; the 2.0 gotcha rows "Two watchers, one dist/", "Stale files in dist/", "Bundle ceilings are checked in CI", "A 2.0 entry without its stylesheet import", "A 2.0 VSIX and the v2 suites need NUIGET_V2=1", and the Tooling intro sentence naming `test:ui:v2`; rows that are now moot are deleted, rows that still carry a footgun are reworded; the N65 sighting "(seen on `E2E (stable)` and `E2E 2.0 (stable)`)" is history and stays, the one named exemption), `docs/perf-baseline.md:115-118` (no variable, no flag, `npm run test:ui`), `CHANGELOG.md` `[Unreleased]` only (drop "built with `node esbuild.mjs --v2`, " from the two Added lines; rewrite the "2.0 build switch" line as what remains true: the 2.0 entry points build into the three bundles and `--production --analyze` checks them against size ceilings; add under `### Changed` next to the existing three: `- **Breaking:** nUIget 2.0 replaces the 1.x extension: the 2.0 main panel, sidebar and host are what the package ships`). README, both skill files, the 1.x gotcha section, `src/test/e2e/STATUS.md`, the v2 test header comments and `src/test/e2e/v2Support.ts` are not edited.
7. Ledger (`docs/plans/findings-ledger.md:130`, `:135`): N27 → closed (P8.1): one entry set, the other-set residue cannot occur; `check:vsix` guards any other file in `dist/`; N32 → closed (P8.1): the job that wrote the log into the checkout is gone, the 2.0 job writes under `$RUNNER_TEMP`.
8. Gates after editing, in the §2.2 order: `npx tsc --noEmit`, `npm run check-types`, `npx eslint src`, `npm run lint` (covers `.vscode-test.mjs` and `esbuild.mjs`), `npm test`, `npm run bench`, `npm run docs:check`, then the VERIFY list below, then `npm run package:vsix`.
9. Tracker: P8.1 → done with the commit SHA; note: "UI script: `test:ui` runs `out/test/ui/v2` (refinement of P5.12b map rows :93/:99: the 1.x glob and the `package:vsix` prefix are removed, the name is kept); CI ids `e2e`/`ui` reused by the 2.0 jobs (rulesets require only Lint, Test, Build & Package); N27, N32 closed." Add to the P8.2 row: "`test:ui` is the UI script, there is no `test:ui:v2`; residue for P8.2: the `NUIGET_V2`/`--v2` header comments of `src/test/e2e/v2-*.e2e.test.ts` and `src/test/ui/v2/*.ui.test.ts`, `LEGACY_ONLY_COMMANDS` and its message in `src/test/e2e/v2Support.ts:22` (go with `src/extension.ts`), the N65 history parenthetical; the map rows :93/:99 are superseded by the P8.1 tracker note."
10. Rewrite `.github/STATUS.md` from the §2.5 template (repo-level item, P7.6 precedent) with this ruling verbatim under Advisor decisions, the deviation from the P5.12b map stated, the three bundle sizes and the ten CI job names pasted.
11. One commit through the `git-commit` skill, citing P8.1, D4, ADR-000, N27, N32; push to `labs/2.0`; wait for green CI (expect the ten jobs of VERIFY 7). No tag: P8 is not finished.

DO NOT:
Do not keep a 1.x branch, `isV2`, `--v2` or `NUIGET_V2` anywhere in `esbuild.mjs`, `.vscode-test.mjs`, `ci.yml` or `package.json` "for rollback": rollback is `git revert` of the commit.
Do not raise, lower or re-measure a ceiling; the single table is the P7.2a 2.0 table as it stands.
Do not add a `dist/` clean to `esbuild.mjs` (not named; interacts with watch mode) or an error for an unknown `--v2` argument.
Do not rename, move, edit or delete any file under `src/` (tests included), `src/extension.ts`, `src/webview/app`, `src/webview/sidebar` or any 1.x Vitest test: they keep running in `npm test` until P8.2.
Do not touch `package.json` `contributes`, `docs/adr/**`, `docs/plans/test-retirement-map.md`, `.claude/settings.json` (owner's; `Bash(node esbuild.mjs:*)` :18 and `Bash(npm run test:*)` :7 already cover every command this item runs, :48-49 merely go dead) or the CLAUDE.md files.
Do not add `ui` to `build.needs`, mark any job `continue-on-error`, or change the retry logic of the e2e step.
Do not write a consolidated 2.0.0 section or a dated heading in the CHANGELOG: P8.3's bump turns `[Unreleased]` into `## [2.0.0]`.
Do not run `gh run rerun` on a red `E2E` job after its in-step retry (gotcha row); a red `UI` job with a VSIX-contents failure is a code failure of this item.

CONTRACT CHANGE: none. `src/protocol/**`, `src/core/contracts.ts` and `docs/adr/**` are not touched; ADR-000:52-55 remains true as the description of the period until this commit.

VERIFY:
1. `rm -rf dist && node esbuild.mjs --production --analyze` → `dist/extension.js 293183 / 321341`, `dist/webview.js 525241 / 575626`, `dist/sidebar.js 319313 / 350684` (the sizes of the `--v2` build at e29549f), `[production] Build complete`, exit 0; `ls dist` → exactly `extension.js sidebar.css sidebar.js webview.css webview.js`; `grep -c refreshPackagesScoped dist/extension.js` → 0 (that id lives only in `src/extension.ts` and `src/webview/NuGetSidebarPanel.ts`; the same grep on a build at e29549f prints ≥ 1: the flip proof).
2. `npm run check:vsix` → exit 0 on that build; then `rm -rf dist && npm run package && npm run check:vsix` → exit 0 (the `vscode:prepublish` path that vsce and ExTester take, no variable set).
3. `npm run test:e2e` and `VSCODE_TEST_VERSION=1.85.0 npm run test:e2e`, no variable set, after a plain `node esbuild.mjs --production` → `25 passing` each.
4. `rm -rf dist && npm run test:ui -- --storage /tmp/nuiget-ui-v2`, no variable set → every `src/test/ui/v2` suite passing; then `npm run check:vsix` → exit 0 (the build ExTester packaged is the 2.0 one).
5. `git grep -n -e '--v2' -e NUIGET_V2 -e 'watch:v2' -e 'watch:esbuild:v2' -e 'test:ui:v2' -e 'Run 2.0' -e 'E2E 2.0' -e 'UI 2.0' -e e2e-v2 -e ui-v2 -- esbuild.mjs package.json .vscode-test.mjs .github/workflows/ci.yml .vscode ARCHITECTURE.md .github/copilot-instructions.md docs/perf-baseline.md CHANGELOG.md` → exactly one line, the N65 sighting parenthetical in the gotcha row "A red CI run is not always a code failure".
6. `npm run lint` → 0; `npm run docs:check` → 0; `npx vitest run --project backend src/test/lint` → green; `npm run package:vsix` → `nuiget-v1.18.9.vsix` written, exit 0.
7. CI on the pushed SHA: `gh run view <id> --json jobs --jq '[.jobs[].name] | length, .[]'` → 10: `Lint`, `Test (ubuntu-latest)`, `Test (windows-latest)`, `SDK probe`, `E2E (1.85.0)`, `E2E (stable)`, `UI`, `Build & Package`, `Benchmark (informational)`, `Perf baseline (informational)` (run 38880770134 had 13); all green; the `E2E` job summaries show the three size lines against 321341 / 575626 / 350684.
`````

Remarks of the subagent outside the ruling (summarised): the `main` (12524593) and `labs` (14504177) rulesets require
only `Lint`, `Test` and `Build & Package`; `.github/skills/` has no `bump-version` skill although plan P8.3 names one
(the skill exists as `.claude/skills/bump-version`, see the session report); `.claude/settings.json:48-49`
(`Bash(node esbuild.mjs --v2*)`, `Bash(npm run watch:v2)`) are dead after the flip (owner's file).

## Exact next step (one item ID)

P8.2 (⚑ mandatory: legacy deletion per the retirement map; the guard hook's test-file rule is settled there).

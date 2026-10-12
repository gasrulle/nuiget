# STATUS — .github (agent resources and repo-level items)   commit dc6fb8a (parent of the P0.8 commit)   2026-10-12T10:20:00Z

git status --short: ` M .github/workflows/ci.yml`, `?? .github/dependabot.yml`, ` M .vscode-test.mjs`, ` M package.json`,
` M package-lock.json`, ` M .github/copilot-instructions.md`,
` M .github/instructions/github-actions-ci-cd-best-practices.instructions.md`,
` M .github/instructions/security-and-owasp.instructions.md`, ` M .github/skills/github-actions-efficiency/SKILL.md`,
` M .github/skills/github-actions-efficiency/references/actions.md`,
` M .github/skills/github-actions-efficiency/references/patterns.md`,
` M .github/skills/github-actions-hardening/references/triggers-and-privilege.md`, ` M CHANGELOG.md`,
` M docs/plans/STATUS.md`, ` M .github/STATUS.md` (all belong to the P0.8 commit)

Item: **P0.8 CI rewrite**. This file is the handoff note for plan items without a `src/` directory of their own.
The P0.10 note it replaces is in commit `dc6fb8a`.

## Verified by running

All of the following ran locally on macOS arm64, Node 24.21.0, npm 11.19.0, before the first push. The CI
result of the push is recorded by the next item's note and in the session report; the item gate "one run green
on both OSes" is the push run on `labs/2.0`, because this plan opens no pull request before P8.3.

```text
baseline npx tsc --noEmit   → exit 0, no output
baseline npx eslint src     → exit 0, no output
baseline npx vitest run     → Test Files 44 passed (44) · Tests 1591 passed (1591)
js-yaml parse of ci.yml and dependabot.yml → valid; jobs lint, test, e2e, ui, build, benchmark; 18 `uses:`
                              references, all 40-hex SHAs with a version comment; 0 `npm install`; 0 `@vN` refs;
                              every checkout has persist-credentials false; no expression inside a run script
git ls-remote --tags        → checkout v5.1.0 fbc6f399…, setup-node v5.0.0 a0853c24…, upload-artifact v7.0.2
                              cf430e03…, setup-dotnet v5.4.0 26b0ec14…
VSCODE_TEST_VERSION=1.85.0 npm run test:e2e, override in place → exit 1 before any test:
                              Error [ERR_REQUIRE_ESM]: require() of ES Module node_modules/mocha/index.js from
                              node_modules/@vscode/test-cli/out/runner.cjs not supported.
after removing the override:
  npm ls mocha              → @vscode/test-cli@0.0.15 → mocha@11.8.0 (nested); mocha@12.0.3 direct, deduped for
                              vscode-extension-tester
  lockfile comparison       → 51 packages added, 0 removed, 0 changed; all 51 dev-only; 25 are Mocha 11's own
                              dependencies hoisted to the top level
  rm -rf node_modules && npm ci --no-audit --no-fund → exit 0
  VSCODE_TEST_VERSION=1.85.0 npm run test:e2e → 30 passing (2m), exit 0
  npm run test:e2e (stable)                   → 30 passing (2m), exit 0
  npm audit                 → 4 findings (low 2, moderate 1, high 1), every path under
                              node_modules/@vscode/test-cli; with the override it was 0
npm run test:ui -- --storage /tmp/nuiget-ui → 31 passing (3m), exit 0 (VS Code 1.140.0, ChromeDriver 150)
npx tsc --noEmit            → exit 0, no output
npx eslint src              → exit 0, no output
npm run lint                → exit 0
node --test scripts/hooks   → tests 26 · pass 26 · fail 0
npm test                    → Test Files 44 passed (44) · Tests 1591 passed (1591)
npm run bench               → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
rm -rf dist; npm run package:vsix → exit 0 (starts with npm ci) · DONE Packaged: nuiget-v1.18.9.vsix (17 files)
npm run check:vsix          → exit 0; npx vsce ls → 15 files, none under node_modules
unit tests on Windows       → SKIPPED locally: no Windows machine; first exercised by the CI push run
```

## Done (tested)

- `.github/workflows/ci.yml`: `npm ci --no-audit --no-fund` in every job; four actions pinned by commit SHA;
  workflow-level `shell: bash` (gives `pipefail`, so `command | tee log` can fail) and `NUIGET_SDK_TESTS`;
  Lint runs `npm run lint` and `node --test scripts/hooks`; Test matrix ubuntu + windows with .NET 10; E2E
  matrix VS Code 1.85.0 + stable with a log artifact per leg; new UI job under xvfb with log and screenshots;
  Build & Package runs `npm run check:vsix` and uploads the `vsix` artifact; Benchmark runs on every event and
  cannot fail the run.
- `.github/dependabot.yml`: weekly `github-actions` and `npm` (minor and patch grouped).
- `.vscode-test.mjs`: version from `VSCODE_TEST_VERSION`; the stale `--enable-proposed-api` argument removed
  (`package.json` declares no `enabledApiProposals`).
- `package.json`: `package:vsix` starts with `npm ci --no-audit --no-fund`; the `overrides` block is gone.
- Agent resources that prescribed `npm install` for CI now prescribe `npm ci`: `.github/copilot-instructions.md`
  (Known Issues row and the two pipeline descriptions), `github-actions-ci-cd-best-practices.instructions.md`,
  `security-and-owasp.instructions.md`, the `github-actions-efficiency` skill (three files) and the
  `github-actions-hardening` skill (one file). `.claude/` needs no mirror edit: rules are pointers and skills
  are symlinks.

## Done (untested)

- Everything that only GitHub can run: the Windows unit leg, the Linux xvfb legs on the runner images,
  `setup-dotnet`, artifact upload, Dependabot.
- `ARCHITECTURE.md` still describes the old pipeline (five jobs, `npm install`). Left for P0.12 on advisor
  decision; the tracker row for P0.12 says so.

## Not started

- P0.11: test infrastructure.

## Deviations from contract/ADR (file:line each)

- `package.json` `package:vsix` and the removed `overrides` block, and `package-lock.json`: not in the item's
  output list. Both changed on advisor approval (answers below). Cost of the first: every local
  `npm run package:vsix` reinstalls `node_modules`.
- Candidate finding for P0.13 (no ID yet): removing the override brings back four `npm audit` findings through
  Mocha 11 (`serialize-javascript` high, `mocha` moderate, `diff` and `@vscode/test-cli` low). They are
  development-only, sit under `node_modules/@vscode/test-cli`, and never ship. The override that hid them had
  been verified only on current VS Code, whose extension host is Node 22 or newer.
- Candidate finding for P0.13 (no ID yet): the copilot-instructions gotcha that justified `npm install` cited
  `@emnapi/*` packages that are no longer in the lockfile.
- Docs: the item says "the five docs that say `npm install`". Seven files in five resources were changed (list
  above). `README.md:189` and the `npm install` line of the Build and Run block stay: local development still
  installs with `npm install`.
- `ci.yml`: the separate "Compile E2E tests" step was dropped; `npm run test:e2e` compiles the tests itself.
- The UI job runs `npm run test:ui`, which runs `package:vsix` and therefore a second clean install and the
  full unit suite inside the job. Trimming that is a P7.2 matter.
- The first answer below was given before `.github/STATUS.md` was rewritten for P0.8, so the second answer
  could not see it in the tree and says so.

## Advisor decisions (date, item, question, answer verbatim)

Both consultations used the L1 `architecture-advisor` agent in a fresh session
(`claude -p --agent architecture-advisor "<brief>"`).

### 2026-10-12 · P0.8 · brief 1 of 2: install command, job layout, red-run rule

Brief:

~~~~text
ITEM: P0.8 CI rewrite (npm ci; SHA-pinned actions; unit matrix ubuntu+windows; e2e at VSCODE_TEST_VERSION 1.85.0 and stable; new UI job; check:vsix; artifacts; bench informational; dependabot.yml; SDK matrix = 10 only; update the five docs that say `npm install`)            GATE STATUS: baseline on labs/2.0 @ dc6fb8a: `npx tsc --noEmit` exit 0 / `npx eslint src` exit 0 / `npx vitest run` 44 files, 1591 tests passed. Last CI run on the branch (38223920146) is green. Nothing edited yet.
OBSERVED: Seven points need a decision before editing. (1) The plan row and ADR-000:45 say CI uses `npm ci`. The repository's own guidance says the opposite in several places: `.github/copilot-instructions.md:187` (Known Issues row "CI uses `npm install` not `npm ci`": `@emnapi/core` and `@emnapi/runtime`, transitive optional dependencies via `@rolldown/binding-wasm32-wasi`, resolve differently between npm patch versions and `npm ci` fails on any drift), `.github/instructions/github-actions-ci-cd-best-practices.instructions.md:9-10`, `.github/instructions/security-and-owasp.instructions.md:19`, `.github/skills/github-actions-efficiency/SKILL.md:40-42` and its `references/actions.md:65-66` and `references/patterns.md:19`, `.github/skills/github-actions-hardening/references/triggers-and-privilege.md:61,83`, `ARCHITECTURE.md:1650,1657,1691`, `README.md:189`. Measured: `npm ci --dry-run --no-audit --no-fund` exits 0 locally on npm 11.19.0 / Node 24.21.0 (macOS arm64); `.nvmrc` is `24`, so runners install the newest Node 24.x with its bundled npm, on Linux and Windows, which I cannot reproduce locally. The item says "update the five docs that say `npm install`"; the grep finds nine files. (2) ADR-000:45 also says `package:vsix` uses `npm ci`; package.json:304 is `npm install && npm run check-types && npm test && npm run package && ...`. package.json is not a P0.8 output, and `npm ci` deletes node_modules on every local `package:vsix`, which is a gate command for many later items. (3) `ARCHITECTURE.md:1640-1691` describes the CI jobs and says `npm install` is intentional. Plan §2.2 step 6 allows ARCHITECTURE.md edits only under `## 2.0 Architecture (in progress)`, which P0.12 creates. (4) "bench informational": the benchmark job has `if: github.event_name == 'pull_request'`, so it never runs on pushes to labs/2.0, and the only pull request in this plan is the release one. (5) Jobs that have never run in CI: unit tests on windows-latest (all tests are legacy 1.x code plus the P0.x tests of this session), e2e on VS Code 1.85.0, and the ExTester UI suite (finding N2; `npm run test:ui` = `tsc -p tsconfig.test.json && npm run package:vsix && extest setup-and-run out/test/ui/*.ui.test.js --code_version max ...`). A red leg in code this item did not write is likely. RUN.md §5 allows two red runs before the item is blocked. (6) Plan §2.6 says SDK-dependent integration tests run behind `NUIGET_SDK_TESTS=1` and "CI sets it"; no test reads that variable yet (`grep -rn NUIGET_SDK_TESTS src` is empty) and the workflow has no `actions/setup-dotnet` step today. (7) `node --test scripts/hooks` (P0.5) and `npm run lint` with the widened file list (P0.7 tracker note) are not run by CI today; the item text names neither. Also resolved by the session with `git ls-remote --tags`: actions/checkout v5.1.0 = fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09, actions/setup-node v5.0.0 = a0853c24544627f65ddf259abe73b1d18a591444 (both the newest release of the major the workflow uses today; newer majors v7 exist), actions/upload-artifact v7.0.2 = cf430e030ddbb5b0abf93d22962f4752f3646cd9, actions/setup-dotnet v5.4.0 = 26b0ec14cb23fa6904739307f278c14f94c95bf1 (new uses). The quarry ci.yml is identical to main; the quarry `.vscode-test.mjs` differs in one line (`version: process.env.VSCODE_TEST_VERSION ?? 'stable'`) and still has the `--enable-proposed-api=Gasrulle.nuiget` launch argument the item says to drop.
FILES: docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:186 (P0.8 row), :126 (§2.6), :196 (P0 gate), :302 (P7.2), :396 (N2/N3 rows); docs/adr/000-release-and-compatibility-policy.md:45-48; .github/workflows/ci.yml:1-226; .vscode-test.mjs:1-17; package.json:296-316 (scripts); .github/copilot-instructions.md:108-112,187; .github/instructions/github-actions-ci-cd-best-practices.instructions.md:1-12; .github/skills/github-actions-efficiency/SKILL.md:36-44; ARCHITECTURE.md:1640-1695; README.md:185-192; docs/plans/STATUS.md (P0.8 row Notes from P0.7 and P0.10)
CONTRACT/ADR IN PLAY: ADR-000:45 "Install reproducibility: CI and `package:vsix` use `npm ci`." Plan P0.8 gate: "one PR run green on both OSes (report Windows failures in code you did not write; do not suppress)". Plan §2.2 step 6: "ARCHITECTURE.md only under `## 2.0 Architecture (in progress)`". Plan §2.3 universal trigger: "a failing test you did not write".
OPTIONS I SEE: (1) a) `npm ci --no-audit --no-fund` in every job and rewrite every file that prescribes `npm install` for CI; b) keep `npm install`. (2) a) leave `package:vsix` on `npm install` and record the gap against ADR-000; b) change the script in this item. (3) a) correct only the factual CI statements in the legacy ARCHITECTURE.md section and record the deviation; b) leave ARCHITECTURE.md stale until P0.12/P7.5. (4) a) run benchmarks on every push with `continue-on-error: true`; b) keep them pull-request-only and only relabel the job "informational"; c) run on push without `continue-on-error` but outside the `needs` of the build job. (5) if a new leg is red in code the item did not write: a) fix the test or code in this item; b) record an N-finding and scope the leg down (for example Windows unit job limited to what passes) without `continue-on-error`; c) stop with the item blocked after reporting; d) land the new legs as non-required with `continue-on-error: true` and a tracker item to make them required. (6) a) add `actions/setup-dotnet` 10.0.x and `NUIGET_SDK_TESTS: '1'` to the unit, e2e and UI jobs now; b) add them only to e2e and UI, which run the dotnet CLI today; c) leave both for the first item that needs them. (7) a) add `node --test scripts/hooks` and switch the lint job to `npm run lint`; b) only the lint switch.
QUESTION: Which option for each of (1) to (7), which files count as the docs to update, should existing actions stay on their current major (v5) pinned by SHA with Dependabot proposing the major bumps, and what exactly should the session do if the first run is red in the Windows, VS Code 1.85.0 or UI leg?
~~~~

Answer (verbatim):

~~~~text
`★ Insight ─────────────────────────────────────`
- **The brief was right about the tree but wrong about the cause.** `copilot-instructions.md:187` blames `@emnapi/core` via `@rolldown/binding-wasm32-wasi` for `npm ci` failures. `grep -c emnapi package-lock.json` → 0; the last entry left in `660b78b` (2026-10-10, "modernize dependencies"), and the hoist fix in `afde743` (April) is what the gotcha describes. A gotcha row is a claim about the tree; this one expired silently.
- **Two frozen inputs already presuppose `npm ci`:** ADR-000:45 (amended by P0.9 two days ago, kept) and the P0 gate line (plan :196). The only sources saying otherwise are 1.x-era agent resources that cite the dead cause. That is a "`STATUS.md` claim contradicted by the tree" situation, generalized to docs.
- **"Tests named by title" is a procedural guarantee, not red tape.** The item cannot name a Windows failure before the run exists, so the second brief is what produces the names — and the names in `STATUS.md` are what make a later `skipIf` auditable at P7.3.
`─────────────────────────────────────────────────`

```text
DECISION: (1a) npm ci everywhere, the five .github resources updated; (2b) package:vsix switched to npm ci;
(3b) ARCHITECTURE.md untouched, tracker note on P0.12; (4a) bench on push and PR, continue-on-error, outside
build's needs; (5) branch rule below, never (b) or (d) on a required leg; (6a) setup-dotnet 10.0.x + NUIGET_SDK_TESTS
in unit, e2e and UI; (7a) both. checkout and setup-node stay on their v5 majors, SHA-pinned; Dependabot proposes majors.

WHY: The brief is accurate about the tree except for the cause behind question (1), and that correction decides it:
the gotcha at .github/copilot-instructions.md:187 blames `@emnapi/core` via `@rolldown/binding-wasm32-wasi`, but
`grep -c emnapi package-lock.json` → 0 (last removed in 660b78b, 2026-10-10; the April fix is afde743 "replace npm ci
with npm install ... lockfile drift"), the lockfile is v3 with win32/linux bindings recorded, and ADR-000:45, plan :186,
the P0 gate at :196, RUN.md:32 and the P0.4 allowlist all presuppose `npm ci`. ADR-000:45 names `package:vsix` by name
and is frozen (D6), so the script is fixed here, in the item that owns "npm ci", with advisor approval recorded as P0.7
did for the lint script; a deviation note would be a deliberate ADR mismatch for one word. §2.2 step 6 confines
ARCHITECTURE.md edits to a section P0.12 creates four items from now in the same phase, so P0.12 inherits the fix.
D8 says the bench job is informational; the current `if: pull_request` means it never runs on labs/2.0 (the only PR
is P8.3), and `src/test/benchmarks/run.mjs:49` can throw, so `continue-on-error` does real work. §2.6 says CI sets
`NUIGET_SDK_TESTS`; nothing reads it yet, but P1.6 (`:755 skipIf(NUIGET_SDK_TESTS !== '1')`) is a backend vitest test,
so the unit matrix needs the SDK too, and "SDK matrix = 10 only" is one value, not a dimension. All four tag SHAs
in the brief match `git ls-remote --tags` (checkout v5.1.0 fbc6f399…, setup-node v5.0.0 a0853c24…, upload-artifact
v7.0.2 cf430e03…, setup-dotnet v5.4.0 26b0ec14…); `package.json` declares no `enabledApiProposals`, so dropping
`--enable-proposed-api` is safe. Unverified by me: the quarry `.vscode-test.mjs` (outside my allowed directories);
the session read it and copies from the tree per D3.

DO:
1. ci.yml, every job: `npm ci --no-audit --no-fund`; `actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0`,
   `actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0` (current majors; Dependabot proposes v7),
   `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`,
   `actions/setup-dotnet@26b0ec14cb23fa6904739307f278c14f94c95bf1 # v5.4.0` with `dotnet-version: 10.0.x`.
   Workflow-level `env: NUIGET_SDK_TESTS: '1'`, `DOTNET_NOLOGO: '1'`, `DOTNET_CLI_TELEMETRY_OPTOUT: '1'`.
2. lint (ubuntu): `npm run lint -- --format json -o eslint-report.json` (fallback `npm run lint || true`), then
   `node --test scripts/hooks`.
3. test: `strategy: { fail-fast: false, matrix: { os: [ubuntu-latest, windows-latest] } }`, `defaults.run.shell: bash`
   (windows defaults to pwsh and the summary blocks are bash), setup-dotnet + `dotnet --version` step, coverage run and
   summary on ubuntu, plain `npm test` on windows. No `continue-on-error`.
4. e2e (ubuntu): `strategy: { fail-fast: false, matrix: { vscode: ['1.85.0', 'stable'] } }`, env
   `VSCODE_TEST_VERSION: ${{ matrix.vscode }}`, setup-dotnet, `xvfb-run -a npm run test:e2e 2>&1 | tee e2e-output.txt`,
   upload `e2e-log-${{ matrix.vscode }}` with `if: always()`, `if-no-files-found: ignore` (v4+ rejects duplicate names).
5. `.vscode-test.mjs`: copy the quarry working-tree file (D3), keep `version: process.env.VSCODE_TEST_VERSION ?? 'stable'`,
   delete `'--enable-proposed-api=Gasrulle.nuiget'`. It is in the `lint` script's file list; run `npm run lint`.
6. New ui job (ubuntu, `timeout-minutes: 45`, `needs: [lint, test]` not required): setup-dotnet,
   `xvfb-run -a npm run test:ui -- --storage /tmp/nuiget-ui 2>&1 | tee ui-output.txt`; upload `ui-log` plus
   `/tmp/nuiget-ui/screenshots` `if: always()`, `if-no-files-found: ignore`. Note in STATUS that `test:ui` re-runs
   `package:vsix` (full unit suite) inside; P7.2 may trim it.
7. build: after `node esbuild.mjs --production` add `npm run check:vsix`, then `vsce package`, then upload the
   `.vsix` as artifact `vsix`.
8. benchmark: drop the `if:`; `continue-on-error: true`; name `Benchmark (informational)`; not in build's `needs`.
9. `.github/dependabot.yml`: ecosystems `github-actions` (weekly) and `npm` (weekly, grouped minor+patch,
   `open-pull-requests-limit: 5`). Owner merges; sessions never merge (D9 spirit, RUN.md §7).
10. `package.json:305`: `package:vsix` → `npm ci --no-audit --no-fund && npm run check-types && ...` (advisor-approved
    scope extension, record it on the tracker row and in STATUS with the cost: local node_modules reinstall per run).
11. Docs = the five .github resources that prescribe the exception, rewritten to the new truth (CI and package:vsix use
    npm ci; the emnapi drift cause left the lockfile in 660b78b; if npm ci reports lockfile out of sync, regenerate with
    `npm install --package-lock-only` and commit, never revert to npm install): `.github/copilot-instructions.md:187`,
    `.github/instructions/github-actions-ci-cd-best-practices.instructions.md:9-10`,
    `.github/instructions/security-and-owasp.instructions.md:19`, `.github/skills/github-actions-efficiency/`
    (`SKILL.md:40-42`, `references/actions.md:65-66`, `references/patterns.md:19`),
    `.github/skills/github-actions-hardening/references/triggers-and-privilege.md:61,83`. Leave
    `copilot-instructions.md:111` and `README.md:189` (local development `npm install` stays correct).
12. Tracker: P0.12 row Notes += "ARCHITECTURE.md:1645-1658 and :1691 describe pre-P0.8 CI and package:vsix (five jobs,
    npm install); rewrite the CI/CD Pipeline subsection when the 2.0 section lands". P0.13 row Notes += candidate
    finding: the copilot-instructions npm-install gotcha cited a dependency absent from the lockfile since 660b78b.
13. Red-run branch rule (replaces options 5a–d):
    - red in files this item wrote (ci.yml, .vscode-test.mjs, dependabot.yml, the package.json script) or in the runner
      environment (download, xvfb, ChromeDriver, `npm ci` lockfile sync, missing VS Code 1.85 system library):
      fix forward, no brief; RUN.md §5 two-red limit.
    - red in any test this item did not write (legacy unit on windows, src/test/e2e/* at 1.85.0, src/test/ui/*): do
      not edit, skip or `continue-on-error` anything; send a second §2.4 brief before touching a test, containing the
      failing titles verbatim, the `gh run view <id> --log-failed` excerpt, and per failure a `path:line`
      classification "test-code platform assumption" vs "production behaviour". The answer routes each title to a
      platform-neutral assertion, or to `it.skipIf(process.platform === 'win32')` plus an N-finding scheduled on P7.3
      (gate "windows job green", Ask "Windows-only failures"), or to a blocked item. Titles pasted in STATUS.md are
      what satisfy RUN.md:80 "names them by title". The brief does not consume a red run: first red → brief → fix
      commit → second run; second red → blocked.
14. STATUS: rewrite `.github/STATUS.md` (§2.5); paste this answer under "Advisor decisions" with date and P0.8.

DO NOT:
Fall back to `npm install` in any job or in package:vsix if `npm ci` fails; regenerate the lockfile instead.
Put `continue-on-error` on lint, test, e2e, ui or build, or restrict a matrix leg to a passing subset.
Edit, skip or rewrite any test before a second brief names it by title.
Bump checkout or setup-node to v7 in this item; that is Dependabot's PR for the owner.
Edit ARCHITECTURE.md or docs/adr/**; edit README.md:189 or copilot-instructions.md:111.
Add the `docs:protocol:check` step (P1.1a) or a second SDK version to the dotnet setup (D13).
Touch `src/**` production code to make Windows green.

CONTRACT CHANGE: none. ADR-000:45 is satisfied, not changed. package.json script `package:vsix` and the five .github
resources change in P0.8 by this approval; `.vscode-test.mjs` and `.github/dependabot.yml` are named outputs.

VERIFY:
- `grep -c 'npm install' .github/workflows/ci.yml` → 0; `grep -n 'npm ci' package.json` → the package:vsix line.
- `grep -c '@v[0-9]' .github/workflows/ci.yml` → 0; every `uses:` has a 40-hex SHA and a `# vX.Y.Z` comment matching
  `git ls-remote --tags` (the four SHAs above).
- `grep -rn 'npm install --no-audit --no-fund' .github` → 0 hits in the five resources.
- `node --test scripts/hooks`, `npm run lint`, `npm test`, `npm run bench`, `rm -rf dist && npm run package:vsix`,
  `npm run check:vsix` all exit 0 locally (package:vsix now starts with npm ci).
- `gh run watch <id> --exit-status` on the labs/2.0 push → success with jobs: Lint, Test (ubuntu-latest),
  Test (windows-latest), E2E (1.85.0), E2E (stable), UI, Build & Package (check:vsix step green, artifact `vsix`),
  Benchmark (informational) present and non-blocking; `gh run view <id>` lists artifacts `vsix`, `e2e-log-1.85.0`,
  `e2e-log-stable`, `ui-log`.
- `git diff dc6fb8a..HEAD --stat -- src/test` → empty unless a second brief named tests; then only those files.
```

`★ Insight ─────────────────────────────────────`
- **Why the lint job's JSON report survives the switch to `npm run lint`:** `npm run <script> -- <args>` appends arguments to the script command, so `eslint src scripts esbuild.mjs ... --format json -o eslint-report.json` keeps the step summary working while widening the file list.
- **`continue-on-error` vs. `if: pull_request`:** both make a job "non-blocking", but only the first lets it *run* on `labs/2.0`; a job gated on an event that never happens produces no signal at all, which is what D8's "informational" was meant to avoid.
- **`fail-fast: false` is the matrix's "do not suppress":** without it, a red Windows leg cancels the ubuntu leg mid-run and you lose the evidence you need for the second brief.
`─────────────────────────────────────────────────`
~~~~

Acted on: `DO` steps 1 to 14 as written.

### 2026-10-12 · P0.8 · brief 2 of 2: the Mocha override blocks e2e on VS Code 1.85.0

Brief:

~~~~text
ITEM: P0.8 CI rewrite (second brief; the first decided npm ci, the job layout and the red-run rule)            GATE STATUS: labs/2.0 @ dc6fb8a with one uncommitted edit (`.vscode-test.mjs`: version from VSCODE_TEST_VERSION, `--enable-proposed-api` removed; `npx eslint .vscode-test.mjs` exit 0). Baseline tsc 0 / eslint 0 / vitest 44 files, 1591 tests. Nothing pushed for this item yet, so no red run has been spent.
OBSERVED: Before pushing I ran the new e2e leg locally (macOS arm64, Node 24.21.0). `VSCODE_TEST_VERSION=1.85.0 npm run test:e2e` downloads VS Code 1.85.0 and exits 1 before any test runs: "Error [ERR_REQUIRE_ESM]: require() of ES Module <repo>/node_modules/mocha/index.js from <repo>/node_modules/@vscode/test-cli/out/runner.cjs not supported." The runner is loaded inside the VS Code 1.85 extension host, which is Node 18 (D10); Mocha 12 is ESM-only. The cause is package.json `"overrides": { "@vscode/test-cli": { "mocha": "$mocha" } }` with devDependency `"mocha": "^12.0.3"`: `npm ls mocha` shows `@vscode/test-cli@0.0.15 -> mocha@12.0.3 deduped`. `.github/copilot-instructions.md` Known Issues row "Test CLI's nested Mocha" says: "`@vscode/test-cli` still requests Mocha 11 with vulnerable transitive packages. The scoped override reuses the direct Mocha 12 dependency; verify E2E tests before removing it." Experiment (reverted afterwards; package.json and package-lock.json are back to dc6fb8a): with the `overrides` block deleted and `npm install`, `npm ls mocha` shows `@vscode/test-cli@0.0.15 -> mocha@11.8.0` nested and the direct `mocha@12.0.3` kept for vscode-extension-tester; `VSCODE_TEST_VERSION=1.85.0 npm run test:e2e` → "30 passing (2m)", exit 0; `npm run test:e2e` on stable → "30 passing (2m)", exit 0; package-lock.json diff +748/-46 lines; `npm audit` → 4 findings (low 2, moderate 1, high 1): `serialize-javascript` high ("RCE via RegExp.flags and Date.prototype.toISOString"), `diff` low (denial of service in parsePatch/applyPatch), `mocha` moderate and `@vscode/test-cli` low through them. With the override in place `npm audit` → 0 findings. All four are development-only packages that never ship in the VSIX (`npx vsce ls` lists 15 files, none under node_modules). So the legacy extension passes its e2e suite on the minimum supported VS Code; only the test tooling override is incompatible with a Node 18 extension host. In CI the `E2E (1.85.0)` leg would fail the same way on its first run.
FILES: package.json (devDependencies `mocha`, `@vscode/test-cli`; `overrides` block at the end of the file); .github/copilot-instructions.md Known Issues rows "Dependency vulnerability status is time-sensitive" and "Test CLI's nested Mocha"; .vscode-test.mjs:1-16; node_modules/@vscode/test-cli/out/runner.cjs:10; docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:54 (D10), :186 (P0.8 row), :243 (P3.5 adds e2e-v2 jobs); docs/adr/000-release-and-compatibility-policy.md:31-40 (D10 paragraph: "the end-to-end run on VS Code 1.85.0 covers that gap at runtime")
CONTRACT/ADR IN PLAY: Plan P0.8: "e2e at `VSCODE_TEST_VERSION` 1.85.0 and stable". ADR-000 (D10): the end-to-end run on VS Code 1.85.0 is what covers the residual Node 18.16-18.19 typings gap. The first P0.8 answer classed "runner environment" failures as fix-forward without a brief, but this fix changes `overrides` in package.json and the repository's audit result, which the first approval did not cover.
OPTIONS I SEE: 1) Delete the `overrides` block in this item, regenerate package-lock.json, rewrite the Known Issues row to say the test CLI must keep a Mocha that a Node 18 extension host can `require()`, and record the four development-only audit findings as a candidate finding for P0.13. 2) Keep Mocha 12 for the test CLI and replace the 1.85.0 e2e leg by something else (none identified; the suite cannot start on a Node 18 host). 3) Keep the override and add nested overrides that lift only the vulnerable transitive packages of Mocha 11 (`serialize-javascript`, `diff`) to patched versions; not tested, and it needs majors Mocha 11 does not declare. 4) Treat the audit regression as an owner decision and stop with the item blocked.
QUESTION: Which option, and if it is option 1, is the audit regression acceptable to land without the owner, given that the affected packages are development-only and absent from the VSIX?
~~~~

Answer (verbatim):

~~~~text
DECISION: Option 1. Delete the `overrides` block, regenerate `package-lock.json`, rewrite the "Test CLI's nested Mocha" row, record the four development-only audit findings as a candidate finding for P0.13. This is not `OWNER MUST DECIDE`.

WHY: The 1.85.0 e2e leg is a fixed requirement, not a nice-to-have: plan row P0.8 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:186`) names it, and ADR-000 (`docs/adr/000-release-and-compatibility-policy.md:37-39`) makes that run the only thing covering the Node 18.16–18.19 typings gap under D10; the override makes that leg impossible, not merely red, because `node_modules/@vscode/test-cli/out/runner.cjs:10` does `require("mocha")` inside the extension host and `node_modules/mocha/package.json` declares `"type": "module"` with `engines.node` `^20.19.0 || >=22.12.0`, so no Mocha ≥ 12 can ever load on a 1.85 host (which also closes Options 2 and 3). The override was introduced in `660b78b` with "verified … 30 E2E tests", but `.vscode-test.mjs` then hard-coded `version: 'stable'` (the `-` line in your diff), whose host is Node ≥ 22; it was never exercised on Node 18, and the Known Issues row at `.github/copilot-instructions.md:183` already conditions its removal on "verify E2E tests before removing it", which you did on both versions (30/30). A clean `npm audit` is mandated by nothing in the tree: not the plan, `RUN.md`, any ADR, nor `ci.yml` (every install at lines 29, 71, 105, 161, 193 runs `--no-audit`), and row `:179` already says audit state must be measured live; the affected packages are dev-only and absent from the VSIX (`npx vsce ls` 15 files). Owner territory is scope, release, publishing (plan §2, ADR-000 D9); test-tooling resolution is none of those, and `dependabot.yml`, which P0.8 adds, is the channel that will surface these findings to the owner. Note that the "first P0.8 answer" the brief cites is not in the tree (`.github/STATUS.md:72-75` says no consultation happened for P0.10 and the file has not been rewritten for P0.8), so I could not verify its content; this decision stands on the sources above.

DO:
1. Extend the item's files, on this approval, to: `package.json` (the `overrides` block only), `package-lock.json`, and the two Known Issues rows at `.github/copilot-instructions.md:179` and `:183`. Same precedent as the advisor-approved config changes recorded on the P0.6 and P0.7 tracker rows.
2. Delete the whole `overrides` block (`package.json:360-363`). Do not add an explicit Mocha 11 pin; let `@vscode/test-cli`'s own `^11.7.6` (`node_modules/@vscode/test-cli/package.json:65`) resolve nested. Leave `"mocha": "^12.0.3"` (`package.json:341`) in place: `vscode-extension-tester` declares peer `mocha >=5.2.0` and runs on the Node 24 toolchain, not in the extension host.
3. Regenerate the lockfile with npm 11.19.0 (`npm install`), then confirm the diff adds only the nested subtree: `git diff package-lock.json | grep '^+ *"node_modules/'` lists only `node_modules/@vscode/test-cli/node_modules/*` entries. If any other path appears, read it before committing.
4. Prove the lockfile is `npm ci`-reproducible, since P0.8 switches CI to `npm ci` (ADR-000:45): `rm -rf node_modules && npm ci` → exit 0. A lockfile only `npm install` accepts would turn the first CI run red before any test starts.
5. Rewrite row `:183` to state the real constraint: the Mocha that `@vscode/test-cli` loads runs inside the extension host and must be `require()`-able on Node 18 (D10), so it stays at the test CLI's own Mocha 11; the `E2E (1.85.0)` CI leg is the guard; the four dev-only audit findings through it are expected and never ship. Leave row `:179` as is, or add the four findings to it; do not restate them in two places. The "CI uses `npm install` not `npm ci`" row falls into P0.8's existing "update the five docs that say `npm install`" duty.
6. Add the audit regression as a candidate finding for P0.13 (no ID yet, like the P0.10 `dist/` one) in `.github/STATUS.md` under "Deviations from contract/ADR", and record both P0.8 advisor answers verbatim under "Advisor decisions", stating that the first one was not in the tree when the second was given.
7. CHANGELOG `## [Unreleased]` `### Changed`: one headline, no description, for the test-CLI Mocha change.
8. Then continue P0.8 as the first answer laid out; this is the only package.json change the item makes.

DO NOT:
Add an `npm audit` step or gate to CI to compensate for the findings.
Add nested `overrides` for `serialize-javascript` or `diff` (Option 3): untested, outside Mocha 11's declared ranges, and a major bump hits the same ESM/engines wall.
Drop, mark informational, or `continue-on-error` the 1.85.0 e2e leg.
Touch the direct `mocha` devDependency or any other dependency line.
Change anything under `package.json` `contributes` (universal stop-and-ask trigger).
Let `git status` show an uncommitted `package-lock.json` at the end of the turn; the lockfile commits with the item.

CONTRACT CHANGE: none. `package.json` `overrides` and `package-lock.json` are not frozen paths (D6 covers `src/protocol/**`, `src/core/contracts.ts`, `docs/adr/**` only).

VERIFY: `rm -rf node_modules && npm ci` → exit 0; `npm ls mocha` → `@vscode/test-cli@0.0.15` → `mocha@11.x` nested, direct `mocha@12.0.3` for `vscode-extension-tester`, no `deduped` on the test-cli line; `VSCODE_TEST_VERSION=1.85.0 npm run test:e2e` → "30 passing", exit 0; `npm run test:e2e` → "30 passing", exit 0; `npm audit` → 4 findings whose every path is under `node_modules/@vscode/test-cli/node_modules/` and none under a `dependencies` entry; `npx vsce ls` → 15 files, none under `node_modules/`; `grep -c '"overrides"' package.json` → 0; `npx tsc --noEmit` → 0, `npx eslint src` → 0, `npx vitest run` → 44 files, 1591 tests green.

`★ Insight ─────────────────────────────────────`
- The failure is a process-boundary mismatch, not a version-range mismatch: `@vscode/test-cli` spawns VS Code and runs Mocha *inside the extension host*, so the Mocha it loads is bound by the host's Node (18 on 1.85), while ExTester's Mocha runs in your toolchain Node 24. One package name, two runtimes; the `$mocha` override collapsed them into one and silently broke the one you could not see until the 1.85 leg existed.
- `npm overrides` are a blunt tool for audit hygiene: they rewrite what a transitive consumer gets without checking the consumer's `engines` or module format. The clean audit from `660b78b` was real but unproven on the floor runtime; the new CI matrix is what turns D10 from a typings claim into a tested one.
`─────────────────────────────────────────────────`
~~~~

Acted on: `DO` steps 1 to 8 as written. For step 3, the lockfile diff also adds 25 packages outside the test
CLI's folder; they were read and are Mocha 11's own dependencies, hoisted by npm, all development-only.

## Exact next step (one item ID)

P0.11

# STATUS — .github (agent resources and repo-level documents)   commit 6b6051d (parent of the P8.3 release commit)   2026-10-16T16:00:00Z

git status --porcelain --untracked-files=all (before the commit): modified `CHANGELOG.md`, `README.md`, `package.json`,
`package-lock.json`, `docs/plans/STATUS.md`; new `docs/release-checklist.md` (then this note)

Item: **P8.3** — release 2.0.0, by the P8.3 ⚑ ruling (DO 1-12). This note replaces the P8.2c note (history at
`8b38308`).

## Verified by running

```text
baseline (6b6051d)          → npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npx vitest run exit 0,
                              129 files, 1910 passed, 9 skipped
npx tsc --noEmit            → exit 0
npm run check-types         → exit 0
npx eslint src              → exit 0
npm run lint                → exit 0
npm test                    → exit 0; Test Files 129 passed (129); Tests 1910 passed | 9 skipped (1919)
npm run bench               → exit 0
npm run docs:check          → exit 0; docs:protocol:check — docs/protocol.md is up to date
node esbuild.mjs --production --analyze → exit 0; extension 293183, webview 525241, sidebar 319313 bytes (unchanged
                              since P8.2b; ceilings 322502 / 577766 / 351245)
npm run package:vsix        → exit 0; DONE Packaged: nuiget-v2.0.0.vsix (17 files, 564.82 KB)
npm run check:vsix          → check:vsix: OK
node -p version             → 2.0.0; package-lock.json version and packages[""].version → 2.0.0 2.0.0
npm run test:e2e, npm run test:ui → SKIPPED: no product code changed; CI runs both on the push
```

## Done (tested)

- CHANGELOG.md: the 12 `### Fixed` bullets and the heading removed (owner's decision); the blank line inside
  `### Changed` removed; `## [Unreleased]` renamed `## [2.0.0] - 2026-10-16` by `bump-version` with a fresh empty
  `## [Unreleased]` above; `### Breaking changes` first, with the four former `**Breaking:**` lines as bold headlines.
- `package.json`, `package-lock.json`: 2.0.0 via `npm version 2.0.0 --no-git-tag-version --ignore-scripts`.
- `README.md:90`, `package.json:282`: "Writes the webviews' [perf] marks …" (the `contributes` description approved by
  the ruling).

## Done (untested)

- `docs/release-checklist.md`: the session's filled table and the owner's steps (merge, VSIX, two publishing routes,
  tag and GitHub release). No gate reads it.

## Release pull request (follow-up commit, ruling E)

- Push run 38910717999 on `91c6804`: success on all 10 jobs (Lint, Test ubuntu + windows, SDK probe, E2E 1.85.0,
  E2E stable, UI, Build & Package, Benchmark, Perf); artifacts `vsix` (577598 bytes), `e2e-log-1.85.0`,
  `e2e-log-stable`, `ui-log`, `sdk-probe`, `perf-baseline`.
- `gh pr create` → https://github.com/gasrulle/nuiget/pull/18 (`main` ← `labs/2.0`, not a draft); merge state
  `BLOCKED` right after creation with every check green and no review decision (a ruleset rule the session cannot
  see; the owner merges with the bypass, ruling DO 6).
- This commit fills the tracker's Commit cell (`91c6804`), the PR number and the checklist; `labs/2.0-P8-done` goes on
  it after its green run.

## Not started

- Nothing in P8.3 for a session; merging and publishing are the owner's (`docs/release-checklist.md`).

## Deviations from contract/ADR (file:line each)

- None. Consequence of the owner's CHANGELOG decision (ruling A): 1.18.9 users have the truncation of long prerelease
  versions in CLI search; 2.0.0 does not (it reads `--format json`), and its CHANGELOG does not say it is gone.
- `bump-version` step 4, released history left as is: 1.15.0 above 1.15.1; 1.12.0 and 1.11.0 undated; 1.13.0 dated
  2025-03-12.
- The ruling's VERIFY expects 4 blank lines in the 2.0.0 range; the range counts 5 because it includes the blank line
  before `## [1.18.9]`. The structure is as ruled (heading, `### Breaking changes`, list, `### Added`, `### Changed`).

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P8.3, "Rule on A–E (Fixed bullets, Breaking changes, version and pre-release, STATUS location, commit
split) and confirm the files, edits, gates and order for P8.3." Answer, verbatim:

`````text
VERDICT: Proceed with P8.3 as ruled below. Not `OWNER MUST DECIDE`: the version (2.0.0) is fixed by the plan row, D1 and ADR-000:18; the pre-release fork is a publish-time choice of the owner that changes nothing the session produces, so it goes into `docs/release-checklist.md` as two exact routes; the `contributes` description edit is approved here. Brief checked against the tree: PR #17 CLOSED, `origin/main` = 16831f4 = merge-base, ruleset 12524593 now requires `Lint`, `Build & Package`, `Test (ubuntu-latest)`, `Test (windows-latest)` (strict), 0 approving reviews, squash only, bypass RepositoryRole 5 always; vsce 4.0.0 `node_modules/@vscode/vsce/out/publish.js:86-95` refuses `--pre-release` on a VSIX without the `Microsoft.VisualStudio.Code.PreRelease` property and `.github/workflows/ci.yml:329` packages without it; `*.vsix` is in `.gitignore:20` and `.vscodeignore:41`; `src/extension.ts:76` keys the SDK cache on `packageJSON.version` (a bump rebuilds it once, which the state-reset bullet already says); no test or script asserts the setting description, `1.18.9` (the only source hit is a legacy-cache fixture, `src/extension.test.ts:631`) or the changelog shape; no markdownlint runs. One correction to the brief's observation 2: 1821d0e is after `v1.18.9` (`git log v1.18.9..origin/main`) and sits under `[Unreleased]` on `main`, so the bullet describes a fix that never shipped; the owner's count of 12 was exact.

A → Option 1. Remove all 12 `### Fixed` bullets and the now-empty `### Fixed` heading (CHANGELOG.md:61-75 at 6b6051d, blank lines included). 2.0 has no table-parsing path (`src/core/feeds/search.ts` reads `dotnet package search --format json` only, `src/core/cli/commands.ts:113`), so the 11th bullet is true of 2.0.0 by construction, not by a dedicated fix; the consequence the owner may not have weighed is that 1.18.9 users do have the truncation bug and 2.0.0 will not say it is gone. Record that one sentence in `.github/STATUS.md` and in the §8 report under `Owner action needed`; if the owner wants the line back, the follow-up commit of E reinstates it under a `### Fixed` heading at no cost (before the merge; after publishing the section is released). Do not reword or prune any other bullet.

B → Option 1. `### Breaking changes` is the first subsection under `## [2.0.0] - 2026-10-16`, before `### Added` (ADR-000:57, heading text as written there). The four lines leave `### Changed` (CHANGELOG.md:104-107), lose the `**Breaking:** ` prefix and become whole-line bold headlines (the Fixed/Changed convention), in this order and with this exact text:
`- **nUIget 2.0 replaces the 1.x extension: the 2.0 main panel, sidebar and host are what the package ships**`
`- **nUIget 2.0 requires .NET SDK 10 or newer; projects that resolve an older SDK are read-only**`
`- **2.0 resets the persisted 1.x state: the selected project and source, the prerelease and restore toggles and the split positions are chosen once more, the cached feed data and the SDK cache are rebuilt, and the 1.x entries are removed from workspace and global storage at the first activation**`
`- **The `nuiget.noRestore` setting is no longer migrated to the restore toggle (set the toggle once if it was `true`), and the recent-searches list is gone**`
Also delete the stray blank line inside `### Changed` (CHANGELOG.md:79). The `nuiget.recentSearchesLimit removed` line stays in `### Changed` as P8.2b recorded it. ADR-000 is not touched.

C → Option 1. Bump to 2.0.0. Option 2 contradicts ADR-000:18 and D1; option 3 edits `ci.yml`, which is outside the item and unneeded today. The checklist carries the fact (vsce 4.0.0 `publish.js:86-95`; `ci.yml:329`; VS Code docs "Versions must be different between pre-release and regular releases") and two routes, one command per code block, every command the owner's: (a) D9 as written: from the merged `main`, `npm ci --no-audit --no-fund`, then `npx vsce package --pre-release --out nuiget-v2.0.0-pre-release.vsix`, `npm run check:vsix`, publish with `npx vsce publish --pre-release --packagePath nuiget-v2.0.0-pre-release.vsix` (or the Marketplace upload page; the VSIX carries the flag), and in bold: the regular release must then be 2.0.1 or later, through a new `bump-version` PR branched from `main`, whose CI `vsix` artifact is the release; (b) publish CI's `nuiget-v2.0.0.vsix` as the regular release directly (a deviation from D9's "pre-release first" that only the owner may elect; the checklist says so). Both routes end with the owner's `v2.0.0` (or `v2.0.1`) tag and GitHub release; Open VSX, if any, is the owner's too.

D → `.github/STATUS.md`, rewritten from the §2.5 template (repo-level precedent P7.6, P8.1, P8.2c). No `docs/STATUS.md`.

E → Two commits. The release commit sets P8.3 `done` (gate "artifact present" is provable on the `labs/2.0` push run: `ci.yml:3-6` triggers `build` on push, and it uploads `vsix` with `if-no-files-found: error`), with the PR number blank in the tracker note and the checklist. After its green run and `gh pr create`, a docs-only follow-up commit writes the PR number, run ids and artifact name into the tracker note (and the release commit's SHA into the Commit cell, RUN.md §5.1), the checklist and `.github/STATUS.md`; it lands on the PR branch and re-runs CI, which is expected. `labs/2.0-P8-done` goes on that follow-up SHA after its green run (P8 review: "after P8.3's last commit").

DO:
1. Baseline gates at 6b6051d (already running) → all green; otherwise stop.
2. Text pass on `CHANGELOG.md` before the bump: delete lines 61-75; delete the blank line 79; cut lines 104-107 and hold them for step 4. Then `README.md:90` and `package.json:282`: "Writes the 2.0 webviews' …" → "Writes the webviews' …" (README keeps its backticks around `[perf]`); no other key, default or wording in `contributes` changes.
3. `bump-version` (`.claude/skills/bump-version` → `.github/prompts/bump-version.prompt.md`): `npm version 2.0.0 --no-git-tag-version --ignore-scripts`; rename `## [Unreleased]` to `## [2.0.0] - 2026-10-16`; insert an empty `## [Unreleased]` above it. The skill's step 4 will surface the existing header disorder (1.15.0 before 1.15.1; 1.12.0 and 1.11.0 undated): report it in the STATUS note, never edit released sections.
4. Insert `### Breaking changes` with the four lines of B directly under the new `## [2.0.0] - 2026-10-16` heading (blank line between heading and subsection, blank line after the list, then `### Added`).
5. Gates in the §2.2 order: `npx tsc --noEmit`, `npm run check-types`, `npx eslint src`, `npm run lint`, `npm test`, `npm run bench`, `npm run docs:check`, `node esbuild.mjs --production --analyze` (paste the three sizes), `npm run package:vsix` (its `npm ci` is also the lockfile-sync check; expect `nuiget-v2.0.0.vsix`), `npm run check:vsix`. `test:e2e` and `test:ui`: SKIPPED locally with the reason "no product code changed; CI runs both on the push", literal.
6. Create `docs/release-checklist.md` (CommonMark per the markdown instruction; one command per fenced block with a language id): a "Filled by the session" table (version, release commit SHA, each gate with its result line, VSIX name/size/file count, `labs/2.0` run id, artifact name, PR number: "pending, filled by the follow-up commit") and an "Owner" section: merge (squash only on `main`, so one commit for all of 2.0; keep `labs/2.0` and its `labs/2.0-P*-done` tags; branch 2.0.1 from `main`, never from `labs/2.0`; the required checks are the four named above; `require_extra_approval_for_unattributed_changes` and thread resolution are on and were not verified against this PR, the admin bypass covers them), download of the `vsix` artifact from the PR's last run, the two publishing routes of C with their consequences, tag and GitHub release, and "sessions never publish, tag a release or merge (D9)".
7. Tracker: P8.3 `done`, date 2026-10-16, note with the A decision and its one-sentence consequence, the B/C/D/E rulings in one line each, gate results, the PR number pending. Rewrite `.github/STATUS.md` with this ruling verbatim under Advisor decisions.
8. Commit with the `git-commit` skill (suggested: `build!: release 2.0.0: version bump, 2.0.0 changelog, release checklist (P8.3, D1, D9, ADR-000)`, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); stage by explicit path after `git status --porcelain --untracked-files=all` (the new checklist); push `labs/2.0`; `gh run watch <id> --exit-status` → green on the 10 jobs; `gh api repos/gasrulle/nuiget/actions/runs/<id>/artifacts --jq '.artifacts[].name'` → contains `vsix`.
9. `gh pr create --base main --head labs/2.0 --title 'build!: release nUIget 2.0.0 (P8.3, D1, D4, D9, ADR-000)' --body-file <scratchpad file>`: never let the 1.x PR template fill the body. Body: what 2.0.0 is (one paragraph, ADR-000), link to the CHANGELOG 2.0.0 section and `docs/release-checklist.md`, the squash consequence, the publishing routes in two lines, the evidence (release SHA, run id, artifact `vsix`, gate results), and the A sentence. Not a draft.
10. Follow-up commit (`docs(plans): record the release pull request and the vsix artifact (P8.3)`): PR number, run ids and artifact into the tracker note, the Commit cell with the release SHA, the checklist's pending rows and `.github/STATUS.md`; push; wait for the push run and the PR run → green.
11. `git tag labs/2.0-P8-done` on the follow-up SHA and `git push origin labs/2.0-P8-done`.
12. Stop per RUN.md §7 with the §8 report: `Next open item: none`; `Owner action needed: merge release PR #n (squash), then follow docs/release-checklist.md; say now if the "Long NuGet prerelease versions" line should be reinstated before the merge`. Hand-offs for 2.0.1, not this item: `.github/pull_request_template.md` names only deleted 1.x files; check whether `README.md:250` (`npm run compile`) names a script that exists; a `--pre-release` CI artifact is a one-step `ci.yml` addition if the owner wants pre-releases from CI; `.claude/settings.json:48-49` optional (owner).

DO NOT:
- Run `vsce publish`, `ovsx publish`, `gh pr merge`, `gh release`, enable auto-merge, create a `v2.0.0` tag, or open the PR as a draft (required checks must run and the owner merges it as is).
- Bump to any version but 2.0.0; edit `.github/workflows/ci.yml`, `docs/adr/**`, `src/protocol/**`, `src/core/contracts.ts`, `.claude/settings.json`, `scripts/hooks/**` or the ruleset; create the sentinel.
- Edit a released CHANGELOG section (1.18.9 and older) or reorder the 1.15.x/1.12.0/1.11.0 headers; reword or prune any `### Added` or `### Changed` bullet beyond the four moves, the one blank line and the Fixed deletion.
- Touch any `contributes` key, default or text other than the `nuiget.enablePerformanceLogging` description; change `engines`.
- Fill the PR body from the template, or record the PR number before `gh pr create` printed it.
- Tag `labs/2.0-P8-done` before the follow-up commit's green run; `gh run rerun` anything; mark a job `continue-on-error`.
- Merge `origin/main` into `labs/2.0` (it has not moved: merge-base = 16831f4).

CONTRACT CHANGE: none. `src/protocol/**`, `src/core/contracts.ts` and `docs/adr/**` untouched; the `package.json` `contributes` description edit (:282) and the `README.md:90` row are approved by this ruling as P8.3's files, together with `package.json`/`package-lock.json` (version), `CHANGELOG.md`, `docs/release-checklist.md`, `docs/plans/STATUS.md` and `.github/STATUS.md`.

VERIFY:
- `node -p "require('./package.json').version"` → `2.0.0`; `node -p "const l=require('./package-lock.json'); l.version+' '+l.packages[''].version"` → `2.0.0 2.0.0`.
- `grep -n '^## \[' CHANGELOG.md | head -3` → `8:## [Unreleased]`, `10:## [2.0.0] - 2026-10-16`, then `## [1.18.9] - 2026-10-10`.
- `sed -n '/^## \[2.0.0\]/,/^## \[1.18.9\]/p' CHANGELOG.md | grep '^### '` → exactly `### Breaking changes`, `### Added`, `### Changed` in that order; same range `| grep -c '^$'` → 4; `grep -c '\*\*Breaking:\*\*' CHANGELOG.md` → 0; `grep -c 'Long NuGet prerelease' CHANGELOG.md` → 0.
- `grep -c "2.0 webviews'" README.md package.json` → `README.md:0`, `package.json:0`; `npm run docs:check` → exit 0.
- `npm run package:vsix` → `Packaged: nuiget-v2.0.0.vsix`, exit 0; `npm run check:vsix` → OK; `git status --porcelain --untracked-files=all` shows no `.vsix`.
- `test -f docs/release-checklist.md && grep -c 'pre-release' docs/release-checklist.md` → ≥ 3.
- `gh api repos/gasrulle/nuiget/actions/runs/<release run id>/artifacts --jq '.artifacts[].name'` → includes `vsix`; `gh pr view <n> --json baseRefName,headRefName,isDraft --jq '.baseRefName+" "+.headRefName+" "+(.isDraft|tostring)'` → `main labs/2.0 false`; the PR's run green on the four required contexts.
- `grep -nE '^\| P8\.3 \|' docs/plans/STATUS.md | grep -c '#<n>'` → 1 after the follow-up; `git tag --list 'labs/2.0-P8-done'` → the follow-up SHA; the session's last message is the §8 report with `Next open item: none`.

Files checked (all absolute under /Users/mattias/github/nuiget): .github/agents/architecture-advisor.agent.md; docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:41-160, 313-325; docs/adr/000-release-and-compatibility-policy.md (whole); docs/plans/RUN.md (whole); docs/plans/STATUS.md:119-123, 939-1010, 4016-4060; CHANGELOG.md:1-130, 430-470; .github/prompts/bump-version.prompt.md; .claude/skills/bump-version/SKILL.md; .github/skills/git-commit/SKILL.md; .github/pull_request_template.md; .github/STATUS.md; .github/workflows/ci.yml:1-30, 300-345; package.json:21-24, 278-284, 288, 300-301; README.md:88-92, 250, 266; .vscodeignore:1-2, 38, 41; .gitignore:20; node_modules/@vscode/vsce/out/publish.js:80-100, out/package.js:327-385, out/main.js:126, 204; scripts/check-docs-drift.mjs:98-134; scripts/check-vsix-contents.mjs:11-34; src/core/cli/validate.ts:21-23, 50-99; src/extension.ts:76; src/extension.test.ts:626-634; src/test/lint/extension-config-settings.test.ts:20; .github/instructions/markdown.instructions.md. Commands: git status/log/show/tag/grep, gh pr list, gh run list, gh api rulesets/12524593.
`````

## Exact next step (one item ID)

None for a session: the owner merges PR #18 (squash) and follows `docs/release-checklist.md`.

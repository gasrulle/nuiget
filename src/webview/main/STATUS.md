# STATUS — src/webview/main   commit 20a1a22 (P9.4; its parent 21ff78c closed P9.3)   2026-10-16T21:50:00Z

git status --porcelain --untracked-files=all (before the P9.4 commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`,
`docs/plans/STATUS.md`, `src/webview/main/{MainShell.tsx,MainShell.test.tsx,STATUS.md}`,
`src/webview/main/features/updates/{UpdatesTab.tsx,AllProjectsUpdates.tsx,UpdatesTab.test.tsx}`,
`src/webview/shared/store/{ops.tsx,ops.test.tsx}`, `src/webview/shared/STATUS.md`

Item: **P9.4** — Updates rows wiring (parity audit MU1, MU2, DP2, MU3, MU6, MU7, MU9, MU10; D14, D15), by the
stop-and-ask ruling below. This note replaces the P9.3 note (history at `21ff78c`, its two rulings verbatim there).
The P9.4 commit `20a1a22` went out with the P9.3 note still in this file (the rewrite was refused by a stale read);
this note follows in a docs commit.

## Verified by running

```text
baseline (21ff78c)          → npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npx vitest run exit 0
npx vitest run --project frontend src/webview/shared/store/ops.test.tsx → Tests 17 passed (17); without the ops.tsx
                              change (stashed): `a per-step report keeps every package of the operation busy` fails
npx vitest run --project frontend src/webview/main/features/updates → Tests 26 passed; without the ops.tsx change:
                              `all rows busy during update all` fails (negative control)
npx tsc --noEmit            → exit 0
npm run check-types         → exit 0
npx eslint src              → exit 0
npm run lint                → exit 0
npx vitest run --project frontend src/webview → Test Files 56 passed (56) · Tests 499 passed (499)
npm test                    → exit 0 · Test Files 131 passed (131) · Tests 1934 passed | 9 skipped (1943)
npm run bench               → exit 0
npm run docs:check          → exit 0
rm -rf dist out/esbuild && node esbuild.mjs --production --analyze → exit 0 · dist/extension.js 293359 / 322502 ·
                              dist/webview.js 528634 / 577766 · dist/sidebar.js 320984 / 351245
git diff --name-only HEAD -- src/webview/sidebar src/webview/shared/primitives src/protocol src/core → empty
grep -n 'label="Verified"' src/webview/main/features/updates/*.tsx → no match
npm run package:vsix, npm run test:ui → SKIPPED locally before the push: no host or packaging change
CI run 38965520035 (20a1a22) → 9 jobs green, UI red: the six theme tests, "AssertionError: incomplete node outside the
                              details pane in the main panel under Dark Modern: #_r_1a_-option-0-version >
                              .nuiget-row-version-arrow: expected false to equal true" (and the five other themes).
                              The update arrow was a span of its own (P9.2's Row, first rendered by P9.4); axe leaves a
                              symbol-only element incomplete. Fix attempt 1 (RUN.md §4), by the follow-up ruling below:
                              the arrow is a text node of `.nuiget-row-version`
after the fix: npx tsc --noEmit 0 · npx eslint src 0 · npm run check-types 0 · npm run lint 0 · Row.test.tsx and
                              features/updates 45 passed · src/test/lint 131 passed · npm test 131 files, 1934 passed |
                              9 skipped · docs:check 0 · bundles 293359 / 528561 / 320911
rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui → exit 0 · 37 passing (1m) ·
                              "incomplete node outside" 0 times
```

## Done (tested)

- `UpdatesTab.tsx` and `AllProjectsUpdates.tsx`: rows with `icon` (`packageIconSrc(update.iconUrl)`, in All
  Projects `update.iconUrl ?? icons.get(id)` from the `icons` chunk), `authors`, `verified`, `version` +
  `nextVersion`; the `Verified` `Badge` is gone; sorted by id (`localeCompare`); single project: "No packages
  installed." when the installed list is ready and empty and the project is supported.
- `store/ops.tsx`: `merge` keeps the union of `projectPaths` and `packageIds` across `named` and `progress`.
- `MainShell.tsx`: no `0` on the Updates tab (single and All Projects).
- Tests added: `updates row shows icon and authors`, `updates sorted by id`, `all rows busy during update all`,
  `says "No packages installed." when the project has none, not that it is up to date`, `All Projects: rows take
  the icon of the icons chunk when they carry none, and are sorted by id` (UpdatesTab.test.tsx; `mountAll` gained
  an optional `icons` argument); `a per-step report keeps every package of the operation busy` (ops.test.tsx);
  `the Updates tab shows no 0` (MainShell.test.tsx).
- Named rewrites (by the ruling): `UpdatesTab.test.tsx` `lists the updates with their versions, counts them on the
  tab and passes axe` names `['Moq', 'Newtonsoft.Json', 'Serilog']`; `Update all confirms the packages …` payload
  order Moq, Serilog; `says "No updates available" for a complete empty answer …` tab name `Updates` (no `0`).
- Docs: ARCHITECTURE Updates feature; CHANGELOG `[Unreleased]` `### Changed`.

## Done (untested)

- None in jsdom; the rendering is checked in the UI job's screenshots after the push.

## Not started

- All Projects "No packages installed." (its `installed` fan-out can lag the updates stream; per-section sentences
  stay). Updates-tab vulnerability badge: P9.7.

## Deviations from contract/ADR (file:line each)

- None. The ruling's "no `Verified` badge text in `.nuiget-row-badges`" is asserted on the text: the span exists
  (an empty fragment of badges).
- DO 7 drives `all rows busy during update all` with chunks of the `ops/bulkUpdate` request (a `queued` report
  with both packages names the operation, then a per-step `running` report with one), not with an `ops/progress`
  event: with an event alone the local entry of `run()` still holds both packages and the test passes without the
  fix; with the chunks it fails without it.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P9.4, stop-and-ask (plan §2.1 files): "May P9.4 edit src/webview/shared/store/ops.tsx (+ ops.test.tsx)
for MU3 and src/webview/main/MainShell.tsx (+ MainShell.test.tsx) for MU6, and is the in-file reading above right
(in particular: drop the Verified Badge for the Row prop; icons map as fallback only)?" Answer of the
`architecture-advisor` subagent, verbatim:

`````text
DECISION: Yes to both, scoped, after closing P9.3 first; the in-file reading is right with four corrections (MU10 guard, union semantics, three named assertion rewrites, two doc lines). Not `OWNER MUST DECIDE`.

WHY: Plan row P9.4 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:351`) names MU3 and MU6 in so many words while its input column leaves out the two files that hold them; the P9.3 ruling (`src/webview/main/STATUS.md:129`) approved out-of-row files on exactly that basis, and `MainShell.tsx` was a P9.3 input (`:350`, "MainShell tabs"). The MU3 trace is correct: `touchedBy` fills the full set at `src/webview/shared/store/ops.tsx:185`, the host's first report repeats it (`src/core/ops/PackageWorkflows.ts:186`), then each step reports one id (`:195`) and the spread at `ops.tsx:72` replaces the arrays despite its own comment; `PackageWorkflows.test.ts:745-752` pins the per-step shape, so the host stays as it is and the slice unions. The MU6 trace is correct: `MainShell.tsx:135` passes `rows.length` through, `:141` already applies `|| undefined` to the Installed count, and `UpdatesTab.test.tsx:175` pins the `0` today. In-file: `Row.tsx:131-134` renders `version`/`nextVersion` as the text `3.0.0 → 3.1.0`, so `UpdatesTab.test.tsx:65` and `src/test/ui/v2/main-updates.ui.test.ts:46` stay as written; `Row` has `authors`/`verified`/`icon` (`Row.tsx:37-44`) and the P9.3 ruling (DO NOT, `STATUS.md:121`) already forbids a `Verified` `Badge` beside them; the `icons` chunk is built from the same `update.iconUrl` of the same rows and emitted after the `project` chunk (`src/core/catalog/Catalog.ts:376-389`), so "fallback only" is the one consumption that can never disagree with the row field. `PackageUpdate` carries `iconUrl`, `verified`, `authors` (`src/protocol/domain.ts:96-104`); no contract moves.

DO:
1. Close P9.3 first, as the P9.3 ruling did for P9.2: `git status --porcelain --untracked-files=all` → only `src/webview/main/STATUS.md`; set its header to `commit df2dedb`; fill the empty commit cell of `docs/plans/STATUS.md:125` with `df2dedb`; commit the two files with the `git-commit` skill as `docs(webview/main): record the P9.3 visual check (P9.3, D18)`; push. Then the P9.4 baseline gates green before any edit.
2. `src/webview/shared/store/ops.tsx`: one helper `merge(previous: OperationProgress | undefined, report: OperationProgress): OperationProgress` = `{ ...previous, ...report }` with `projectPaths` = union of both (paths verbatim, never normalized: gotcha "Resource keys built in the webview") and `packageIds` = union deduped case-insensitively keeping the first spelling; when neither side has an array the key stays absent (no `[]`: `ops.test.tsx:198-199` is a strict `toEqual` on the named entry). Use it at `:53` (`named`) and `:72` (`progress`, IN_PROGRESS branch only). Fix the comment at `:71`. `ops.test.tsx`: add `a per-step report keeps every package of the operation busy` (asked/progress with `[A]` × `['Serilog','Moq','Newtonsoft.Json']`, then `running` with `['moq']`, `current: 1`, then `restoring` with `['Moq']`: all three busy until `completed`; `busyPackages` has three keys). `:52-70`, `:72-89` (`restore` with no previous entry stays non-busy) and `:194-205` stay green unchanged.
3. `src/webview/main/MainShell.tsx:135`: `updateCount` → `… ? updatesSlice.rows.length || undefined : undefined` (same rule for `allCount` at `:134`: a sum of 0 is `undefined`); comment "no `0` (MU6)". `MainShell.test.tsx`: add `the Updates tab shows no 0` (answer `updates/get` with two rows → tab `Updates 2`; invalidate `resourceKeys.updates(A, false)` and answer `[]` → tab `Updates`). Rewrite `UpdatesTab.test.tsx:175` to `toHaveAccessibleName('Updates')` (exact, as `:167`).
4. `UpdatesTab.tsx` (`ProjectUpdates`) and `AllProjectsUpdates.tsx` (`ProjectUpdatesSection`) rows: `version={update.installedVersion}`, `nextVersion={update.latestVersion}`, `authors={update.authors}`, `verified={update.verified}`, `icon={src === undefined ? undefined : <img src={src} alt="" />}` with `src = packageIconSrc(update.iconUrl)` (single) and `packageIconSrc(update.iconUrl ?? updates.icons.get(update.id.toLowerCase()))` (All Projects; pass `icons` down as a prop or read `useAllProjects()` in the section). Delete the `Verified` `Badge` at `UpdatesTab.tsx:191`; keep the `CPM` badge; no `description=` (D14).
5. Sort: `items` (`UpdatesTab.tsx:79`) and `rowsOf` (`AllProjectsUpdates.tsx:179`) sort by `a.id.localeCompare(b.id)` after filtering (ICU primary order is alphabetical regardless of case, as 1.x did). Candidates and the bulk payload follow the shown order; the host reorders edits itself (`PackageWorkflows.ts:132,156`), so behaviour is unchanged. Rewrite `UpdatesTab.test.tsx:64` to `['Moq', 'Newtonsoft.Json', 'Serilog']` and `:105-108` to `[Moq …, Serilog …]`; the All Projects payload (`:231-257`) is one package per project and does not move.
6. MU10, single project only: the empty sentence is `'No packages installed.'` when `!unsupported && installed.result !== undefined && installed.result.packages.length === 0 && !updates.sourcesUnavailable` (an unsupported project without a list has `packages: []` too: gotcha "Unsupported project without a list"); `'No updates available.'` otherwise; the `sourcesUnavailable` and filter sentences unchanged. `mountWith` lists three packages by default (`UpdatesTab.test.tsx:25`), so `:173` stays green. All Projects keeps its per-section sentences (its `installed/get` fan-out can lag the updates stream; say so in STATUS).
7. Tests by the plan row's titles, in `UpdatesTab.test.tsx`: at the top of the file, before the first render, set `data-package-icon` on an element (gotcha "`packageIconSrc` in a jsdom test"). `updates row shows icon and authors`: fixture rows with `iconUrl: 'data:…'`, `authors`, `verified: true` on one and nothing on another; assert `package-row-<id> .nuiget-row-icon img` `src` (data URI vs the default), `optionOf` `toHaveTextContent(authors)` and `toHaveAccessibleDescription(/Verified: the package id prefix/)`, no `Verified` badge text in `.nuiget-row-badges`, and `toHaveTextContent('3.0.0 → 3.1.0')`. In the `All Projects` block: a `project` chunk whose row has no `iconUrl` followed by an `icons` chunk `{ serilog: DATA }` before `host.respond` (the bus drops chunks of an answered request) → that row's `img` `src` is `DATA` (this is the proof of "consume the icons chunk"); the Lib row shows the default. `updates sorted by id`: a fixture out of order renders options alphabetically, in both modes. `all rows busy during update all`: confirm Update all (`:95-109` flow), then `host.event('ops/progress', { opId, status: 'running', kind: 'update', projectPaths: [A], packageIds: ['Moq'], current: 1, total: 2 })` → `optionOf('Serilog')` and `optionOf('Moq')` both `aria-busy`, `update-all-button` disabled and reading `Update all (0)`; then `completed` → neither busy.
8. Docs in the same commit: `ARCHITECTURE.md:598-601` ("the count … not while loading, not with `sourcesUnavailable`, never `0`"; rows "icon, authors and the Verified mark from the answer, `installed → latest` with the new version marked, the `CPM` badge", sorted by id; the "No packages installed." sentence); `CHANGELOG.md` `[Unreleased]` `### Changed`: `- **Updates rows show icon, authors and Verified mark with the new version marked, sorted by id; no 0 on the tab; every row of an Update all stays busy until it ends**`; `src/webview/shared/STATUS.md` one line under Done for the ops merge; `src/webview/main/STATUS.md` from the §2.5 template with this ruling verbatim and the three rewritten lines listed; `docs/plans/STATUS.md` row P9.4; the audit file untouched (P9.13).
9. Gates in §2.2 order plus `npm run lint`, `npm run docs:check`, `rm -rf dist out/esbuild && node esbuild.mjs --production --analyze` (paste the three sizes; the ops merge is in the sidebar bundle, ceilings 322502 / 577766 / 351245). Push; after the green run download `ui-screenshots`, view `main-updates` (expected: 32 px icons, `13.0.2 → 13.0.4` with the new version in the git-added colour, authors with the Verified mark, no `Verified` badge, rows in id order, `Updates 2`) and record the `viewed:` line.
10. Commit with the `git-commit` skill citing P9.4, D14, D15, MU1, MU2, DP2, MU3, MU6, MU7, MU9, MU10, ADR-006, N63; stage by explicit path after `git status --porcelain --untracked-files=all`.

DO NOT:
- Change `PackageWorkflows.ts` or `PackageWorkflows.test.ts:745-752` to widen the per-step report; the fix is the slice's, and it then covers the sidebar (`src/webview/sidebar/ProjectUpdates.tsx:49`, `ProjectPackages.tsx:44` read the same `isPackageBusy`) without a sidebar edit.
- Keep a pending set in `UpdatesTab` or `AllProjectsUpdates` (gotcha "An operation that waits in the queue has no `ops/progress`").
- Render a `Verified` `Badge`, fold `by <authors>` into `description`, or pass `description=` on an Updates row (D14; P9.3 ruling).
- Read the `icons` map first or remove the `allProjects.tsx:205` reducer branch and its test (`allProjects.test.tsx:170-187`) as dead: the chunk is the row's "consume" input, and dropping it from `allProjects/updates` is a contract change (`src/protocol/messages.ts`, D6) for no item.
- Build the version cell as a string `a → b` or a ReactNode (`Row.version` is `string` since P9.2; `nextVersion` is the slot).
- Say "No packages installed." for an unsupported project, or under `sourcesUnavailable`.
- Touch `Row.tsx`, `primitives.css`, `tokens.css`, `main.css`, the sidebar, `src/protocol/**`, or any test title the brief does not name beyond the three lines in DO 3 and DO 5.
- `gh run rerun` a red `UI` job that failed inside a test; a screenshot that contradicts DO 9 is a red gate.

CONTRACT CHANGE: none. Files of the item (plan row P9.4 and §2.1): `src/webview/main/features/updates/{UpdatesTab.tsx,AllProjectsUpdates.tsx,UpdatesTab.test.tsx}`, `src/webview/shared/store/{updates.tsx,allProjects.tsx}` (only if a prop or export changes; none is required), `src/webview/main/STATUS.md`, `ARCHITECTURE.md` (2.0 section), `CHANGELOG.md`, `docs/plans/STATUS.md`. Approved additions by this ruling: `src/webview/shared/store/ops.tsx` (the merge helper and its two call sites only), `src/webview/shared/store/ops.test.tsx` (one added title), `src/webview/main/MainShell.tsx` (`:134-135` only), `src/webview/main/MainShell.test.tsx` (one added title), `src/webview/shared/STATUS.md` (one Done line). Named rewrites: `UpdatesTab.test.tsx:64`, `:105-108`, `:175`. The preceding P9.3 closing commit touches `src/webview/main/STATUS.md` and `docs/plans/STATUS.md` only. No other file.

VERIFY: `npx vitest run --project frontend src/webview/main/features/updates src/webview/main/MainShell.test.tsx src/webview/shared/store/ops.test.tsx src/webview/shared/store/allProjects.test.tsx` → exit 0, listing `updates row shows icon and authors`, `all rows busy during update all`, `updates sorted by id`, `a per-step report keeps every package of the operation busy`, `the Updates tab shows no 0`, with every pre-existing title of those files present and green; `git diff --name-only HEAD -- src/webview/sidebar src/webview/shared/primitives src/protocol src/core` → empty; `grep -n 'label="Verified"' src/webview/main/features/updates/*.tsx` → no match; `npm test` → 131+ files, 0 failed; `npm run docs:check` → 0.

Files checked (absolute, under /Users/mattias/github/nuiget): .github/agents/architecture-advisor.agent.md; docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:41-160,321-370; docs/plans/parity-audit-2026-10-16.md:198-346,1084-1100,1218-1219; docs/plans/STATUS.md:122-135; docs/ux/interaction-model.md:11,25,59-66; ARCHITECTURE.md:595-612; src/webview/main/STATUS.md (whole, plus `git diff`); src/webview/shared/store/ops.tsx (whole), ops.test.tsx:52-102,180-260, updates.tsx:1-120, allProjects.tsx:38-58,205,304, allProjects.test.tsx:170-187; src/webview/main/MainShell.tsx:100-180, MainShell.test.tsx:44-68,196-211; src/webview/main/features/updates/{UpdatesTab.tsx,AllProjectsUpdates.tsx} (whole), UpdatesTab.test.tsx:20-72,83-110,161-178,207-257; src/webview/main/features/installed/InstalledProjectSection.tsx:5,124-134; src/webview/shared/packageIcon.ts; src/webview/shared/primitives/Row.tsx:28-160; src/webview/sidebar/{ProjectPackages.tsx:36-44,ProjectUpdates.tsx:40-49}; src/protocol/domain.ts:96-104,309-329; src/core/catalog/Catalog.ts:365-395; src/core/ops/PackageWorkflows.ts:65-75,114,132-195,351, PackageWorkflows.test.ts:740-756; src/host/handlers.ts:196-230; src/test/ui/v2/main-updates.ui.test.ts:36-56; grep of `Verified` over src/test/ui/v2 and src/test/e2e (none in a test); `git show df2dedb --stat`; `git status --porcelain --untracked-files=all`.
`````

Acted on: DO 2-10, with the DO 7 difference under Deviations.

2026-10-16, P9.4, follow-up stop-and-ask (UI red on 20a1a22; the fix needs `Row.tsx`, on the ruling's DO NOT list):
"Which, which files …, and is this fix attempt 1 of the gate under RUN.md §4?" Answer, verbatim:

`````text
DECISION: Option 1. The arrow becomes a text node of `.nuiget-row-version` (`{' → '}` before the `.nuiget-row-version-new` span); the `.nuiget-row-version-arrow` span and its three selector lines go. Fix attempt 1 of the P9.4 UI gate under RUN.md §4 (`docs/plans/RUN.md:83`). Not `OWNER MUST DECIDE`.

WHY: The brief is right about the tree and the cause. The six failures are the same node under six themes (`gh run view 38965520035 --log-failed`: `#_r_1a_-option-0-version > .nuiget-row-version-arrow`, and axe's reason is "Element content contains only non-text characters", not a short-text case), `theme.ui.test.ts:164-167` admits no `incomplete` outside `package-details-panel`, and `Row.tsx:136` is the span's only producer; P9.4 is its first consumer (`git show 20a1a22`: `nextVersion={update.latestVersion}` in both Updates files), so P9.2's green theme run never measured it. Option 1 is the least change that keeps the accessible name and `textContent` `3.0.0 → 3.1.0` (the P9.2 DO NOT at `src/webview/shared/STATUS.md:145` stays honoured: text arrow, no SVG, no `aria-hidden`), keeps `Row.test.tsx:262-267` green unchanged (`/^3\.1\.0$/` on `.nuiget-row-version-new`), keeps `UpdatesTab.test.tsx:65` and `main-updates.ui.test.ts:46`, and the parent `.nuiget-row-version` already inherits on a selected or current row (`primitives.css:172,175`), so the arrow's contrast on a selection needs no new rule. Plan row P9.2 (`:349`) marks only the new version ("new in `--vscode-charts-green`/token"); the arrow's colour is named nowhere, so a muted arrow is within the plan, and Option 2 would spend a change on the P9.2-named test for a colour the plan does not ask for. The gate was green locally because jsdom runs no contrast rule (`theme.ui.test.ts:11`): this is a code failure to fix forward, never a re-run.

DO:
1. Baseline: `git status --porcelain --untracked-files=all` → only `src/webview/main/STATUS.md` (the P9.4 handoff in progress); `npx tsc --noEmit`, `npm run check-types`, `npx eslint src` → 0 before editing.
2. `src/webview/shared/primitives/Row.tsx:136` → `{nextVersion === undefined ? null : <>{' → '}<span className="nuiget-row-version-new">{nextVersion}</span></>}`; keep the comment line above it ("The arrow stays text…") and add to it: "a text node of the version, never an element of its own: axe cannot measure a symbol-only element (theme.ui.test.ts)".
3. `src/webview/shared/primitives/primitives.css`: delete lines 178 and 181 (`… .nuiget-row-version-arrow,` in the inherit block) and line 210 (so the rule at 210-214 starts `.nuiget-row-version-new {`). `grep -rn "nuiget-row-version-arrow" src docs ARCHITECTURE.md .github` → no match (ARCHITECTURE and the interaction model never named it; checked).
4. No test changes: `Row.test.tsx` (18 titles), `UpdatesTab.test.tsx`, `MainShell.test.tsx`, `theme.ui.test.ts` untouched. `git diff --name-only HEAD -- 'src/**/*.test.ts' 'src/**/*.test.tsx'` → empty.
5. `.github/copilot-instructions.md`, 2.0 gotchas, one new row after "`display: contents` and axe": "A symbol-only element and axe | axe's `color-contrast` leaves an element whose visible text has no letter or digit (`→`, a dash, a bullet) `incomplete` ("Element content contains only non-text characters"), and `theme.ui.test.ts` reads any incomplete outside the details pane as red (P9.4: the update arrow, six themes). Keep a symbol in the text node of the words it belongs to (the row's arrow is text of `.nuiget-row-version`), never in a span of its own; jsdom runs no contrast rule, so only the UI job sees it." Leave the "A `title` on a row" row as it is (still true).
6. Gates: `npx vitest run --project frontend src/webview/shared/primitives/Row.test.tsx src/webview/main/features/updates` → green; `npx vitest run --project backend src/test/lint` → green (stylesheet lint); `npm run lint`; `npm test`; `npm run docs:check`; `rm -rf dist out/esbuild && node esbuild.mjs --production --analyze` (paste the three sizes; expect the sidebar bundle a few bytes smaller). Then the local UI run as P9.2 did: `rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui` → 37 passing, or `SKIPPED: <reason>` literally in STATUS.
7. STATUS: `src/webview/main/STATUS.md` gets this ruling verbatim under Advisor decisions, the run id 38965520035 with the pasted assertion, "fix attempt 1 (RUN.md §4)", and the gate lines; `src/webview/shared/STATUS.md` one line under Done (tested): the arrow is a text node since the P9.4 fix-forward, `.nuiget-row-version-arrow` removed. `docs/plans/STATUS.md` row P9.4: add the fix-forward SHA after the push.
8. Commit with the `git-commit` skill: `fix(webview): keep the update arrow in the version's text so axe can measure it (P9.4, P9.2, MU7)`; files by explicit path: `Row.tsx`, `primitives.css`, `.github/copilot-instructions.md`, the two `STATUS.md`, `docs/plans/STATUS.md`. Push; wait for the run. After green: download `ui-screenshots`, view `main-updates.png` (expected: `13.0.2 → 13.0.4` with the arrow muted like the old version and `13.0.4` in the git-added colour, rows otherwise as the P9.4 ruling's DO 9) and record the `viewed:` line; then close P9.4.
9. If the UI job is red again on this SHA inside a test, that is fix attempt 2's trigger: paste the assertion in a new brief before touching anything; a second red after a second fix is `blocked` (RUN.md:83). An N37 download failure before any test ran is the one case for `gh run rerun <id> --failed`.

DO NOT:
- Option 2 (arrow inside `.nuiget-row-version-new`): it rewrites a P9.2-named assertion (`Row.test.tsx:266`) for a colour no plan row asks for.
- `aria-hidden` on the arrow, an SVG alone, or a `Fragment`-free `&rarr;` entity in its own span (same incomplete).
- Add `.nuiget-row-version-arrow` to an allow-list in `theme.ui.test.ts`, widen its `insideDetails` exemption, or exclude the rule: that weakens the gate the item did not name.
- `gh run rerun` the UI job: the failure is inside a test, so it is a code failure, not N37/N65.
- Touch `tokens.css`, `Listbox.tsx`, the Updates features, the sidebar, or any `*.test.ts(x)`.

CONTRACT CHANGE: none. Approved additions to the P9.4 file list for this fix-forward: `src/webview/shared/primitives/Row.tsx` (line 136 and its comment only), `src/webview/shared/primitives/primitives.css` (lines 178, 181, 210 deleted only), `.github/copilot-instructions.md` (one gotcha row), `src/webview/shared/STATUS.md` (one line). No other file.

VERIFY: `grep -rn "nuiget-row-version-arrow" src .github ARCHITECTURE.md docs` → no match; `npx vitest run --project frontend src/webview/shared/primitives/Row.test.tsx` → 18 passed including `an update row reads old → new as text and marks the new version`; `git diff --name-only HEAD~1 -- 'src/**/*.test.ts' 'src/**/*.test.tsx'` → empty; the CI run on the fix SHA: `UI` green with `37 passing`, the six theme tests among them, and `gh run view <id> --log 2>/dev/null | grep -c "incomplete node outside"` → 0.

Files checked (absolute, under /Users/mattias/github/nuiget): src/webview/shared/primitives/Row.tsx:131-137, Row.test.tsx:255-270, primitives.css:168-186,208-216; src/test/ui/v2/theme.ui.test.ts:11,36-59,157-173,225-226; src/webview/shared/STATUS.md:91,119,133,145; .github/copilot-instructions.md:185-186; docs/plans/RUN.md:83; docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:349; `git log --oneline -3`, `git status --porcelain --untracked-files=all`, `git show 20a1a22 --stat` and its diff of the two Updates files; `gh run view 38965520035 --log-failed` (lines 141-143, 265-336); grep of `nuiget-row-version-arrow` over ARCHITECTURE.md, docs, .github, src/test (none).
`````

Note: the VERIFY grep for `nuiget-row-version-arrow` matches only the STATUS notes that quote this history (this file
and `src/webview/shared/STATUS.md`), no code or reference document.

## Exact next step (one item ID)

P9.5.

# STATUS — src/webview/sidebar   commit 8388bff (P9.10 closed; parent of this docs commit)   2026-10-17T12:40:00Z

git status --porcelain --untracked-files=all (before commit (a)): modified `.github/copilot-instructions.md`,
`ARCHITECTURE.md`, `CHANGELOG.md`, `README.md`, `docs/plans/STATUS.md`, `docs/ux/interaction-model.md`,
`src/test/ui/v2/{sidebarWebview.ts,sidebar-parity.ui.test.ts}`,
`src/webview/shared/primitives/{SectionHeader.tsx,SectionHeader.test.tsx}`,
`src/webview/sidebar/{InstalledSection.tsx,ProjectPackages.tsx,ProjectUpdates.tsx,UpdatesSection.tsx,UpdatesSection.test.tsx,SidebarView.test.tsx,sidebar.css,STATUS.md}`

git status --porcelain --untracked-files=all (before commit (b)): modified `.github/copilot-instructions.md`,
`ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `src/test/ui/v2/sidebar.ui.test.ts`,
`src/webview/shared/tokens.css`, `src/webview/sidebar/{SidebarView.tsx,index.test.tsx,sidebar.css,STATUS.md}`;
new `src/webview/sidebar/SidebarParity.test.tsx`

Item: **P9.10** — Sidebar parity (parity audit SB1–SB6, SB8, SB11, SB15, the version overflow), by the stop-and-ask
ruling below, in two commits: (a) behaviour (Update all, sort, `nextVersion`, the project path tooltip); (b) presentation
(section chrome, indent, normal-case project headers, the narrow-width UI assertion). This note replaces the P8.2b note
(history at `6678f0f`).

## Verified by running

```text
baseline (9dd20f1)          → npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npx vitest run exit 0
                              (Tests 1997 passed | 9 skipped (2006)); CI runs 38991283526, 38991279782 → success
grep -n "bulk|Bulk" src/webview/shared/store/outcomes.ts → 1:import type { BulkOutcome, … } (the bulk wording exists)
commit (a):
npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npm run lint 0 · npm run docs:check 0
npx vitest run --project backend src/test/lint → Tests 131 passed (131)
npx vitest run --project frontend src/webview/sidebar src/webview/shared/primitives/SectionHeader.test.tsx → Tests 65 passed (65)
npm test                    → exit 0 · Tests 2002 passed | 9 skipped (2011) · npm run bench → exit 0
rm -rf dist out/esbuild && node esbuild.mjs --production --analyze → dist/extension.js 297016 / 322502 ·
                              dist/webview.js 548715 / 577766 · dist/sidebar.js 332958 / 351245 (+5235: ConfirmDialog, Dialog, layers)
rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui:
  run 1 → 24 passing · 8 failing: the new Update all test asserted "Newtonsoft.Json: 13.0.2 →", which an earlier file's
          update had changed; the dialog stayed open and covered the sidebar for the next seven tests
          (ElementClickInterceptedError … nuiget-dialog-layer). Fixed in the new test itself (below).
  run 2 → 38 passing · 1 failing: main-details 'shows the versions, the details and the README of the current row'
          "Timed out after 60000 ms waiting for the versions with the installed one marked" (feed latency; no file of (a)
          is on that path)
  run 3 → exit 0 · 39 passing (1m) · 15 PNGs
CI runs 38993220342, 38993217034 on fb4a0f9 (commit (a)) → success
commit (b):
npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npm run lint 0 · npm run docs:check 0
npx vitest run --project backend src/test/lint → Tests 131 passed (131) (webview-tokens.test.ts unchanged)
npx vitest run --project frontend src/webview → Tests 556 passed (556)
npm test                    → exit 0 · Tests 2005 passed | 9 skipped (2014) · npm run bench → exit 0
rm -rf dist out/esbuild && node esbuild.mjs --production --analyze → dist/extension.js 297016 / 322502 ·
                              dist/webview.js 548715 / 577766 · dist/sidebar.js 333071 / 351245
rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui:
  run 1 → 39 passing · 1 failing: the new narrow test read the row wrapper's test id instead of the list's (fixed)
  run 2 → 39 passing · 1 failing: the ruling's "name at least as wide as the version" fails for a whole short name
          (Updates `Serilog` 42 px beside `3.1.1 → 4.4.0` 68 px); the invariant became "whole, or cut only by the cap
          and at least as wide as the version" (deviation below)
  run 3 → exit 0 · 40 passing (1m) · 15 PNGs; `[P9.10] 200 px rows`: installed Newtonsoft.Json name 100/103 px beside
          `13.0.2` 31 px, Serilog 42/42 beside 23; updates Newtonsoft.Json 100/103 beside 37 (ellipsised), Serilog 42/42
          beside 68. Newtonsoft.Json is cut by 3 px while its version shows no more than `13.0.2…`: the 70 % cap stays
          (DO 13, no retune).
```

## Done (tested)

- Commit (a): Installed and Updates rows sorted by id (`ProjectPackages.tsx`, `ProjectUpdates.tsx`); an update row passes
  `version` and `nextVersion` (the arrow stays text; "SVG version arrow" closed by deviation, P9.2/P9.4); `SectionHeader`
  `tooltip` (the toggle's `title`), the project path on the All Projects headers of both sections; Update all
  (`sidebar-update-all-button`) beside the Updates count: a `ConfirmDialog` lists the candidates (per project under All
  Projects) and sends `ops/bulkUpdate` or one `ops/bulkUpdateAllProjects` through `useOpsActions().run()`; `central`,
  busy and unsupported rows stay out; no button while the count is unknown or 0, nor for an unsupported project.
- Tests (a): `update all button runs bulk update`, `update all under All Projects sends one ops/bulkUpdateAllProjects
  grouped by project`, `update all cancels without a request, and there is no button without an update`, `an unsupported
  project has no Update all`, the row tooltip assertion added to 'asks the updates of the selected project …'
  (UpdatesSection.test.tsx); `a tooltip goes on the toggle, none without one` (SectionHeader.test.tsx); UI `Update all in
  the Updates header opens the confirmation; Cancel leaves the project file as it was` (sidebar-parity.ui.test.ts) and
  the 15th named state `sidebar-update-all-dialog`.
- Named rewrites (expected array in sorted order; title unchanged): `SidebarView.test.tsx:91`, `:119`, `:162`, `:208`,
  `:241-251` (Delete on Moq then ArrowDown+Enter on Serilog; the host's new list xunit, which keeps the focus), `:315`,
  `:326`, `:415`, `:434`; `UpdatesSection.test.tsx:73`.
- Docs (a): interaction model §1, §5, §8 (`sidebar-update-all-button`); ARCHITECTURE sidebar paragraph; README sidebar
  bullet; CHANGELOG Added and Changed; gotcha "A `title` on a row" (`nextVersion` on both surfaces).

- Commit (b): `tokens.css` `--nuiget-color-section-header-{bg,fg,border}` (aliases of `sideBarSectionHeader-*`;
  forced colours `Canvas`/`CanvasText`; no high-contrast override, follow-up 2) and `--nuiget-tree-indent: 8px`;
  `sidebar.css` the section chrome (background, top line, none after the sash), rows starting at the section title,
  All Projects project headers in normal case indented by `--nuiget-tree-indent` with their rows; `SidebarView` asks
  `config/get` once (`enable()`) and writes `workbench.tree.indent` on its root.
- Tests (b): `the root carries workbench.tree.indent as --nuiget-tree-indent`, `rows start at the section title`, `All
  Projects project headers are in normal case and name their path` (new `SidebarParity.test.tsx`); UI `narrow sidebar
  keeps package name visible` (sidebar.ui.test.ts). Named rewrites (follow-up 2): `index.test.tsx:37-38` (`config/get`
  in the start set, counted once); `ARCHITECTURE.md` the sidebar's start set and "never asks … the settings".
- Docs (b): ARCHITECTURE sidebar paragraph (chrome, indent); CHANGELOG Changed; gotcha "The config slice is lazy".

## Done (untested)

- None.

## Not started

- None of P9.10.

## Deviations from contract/ADR (file:line each)

- "SVG version arrow" of the plan row: the arrow stays the text `→` of `Row.nextVersion` (gotchas "A `title` on a row"
  and "A symbol-only element and axe"; P9.4 evidence), by the ruling.
- SB6 (Clear and Filters) and SB15 (`id version` tooltip) were done by P9.7 and P9.2; (a) asserts the tooltip only.
- `UpdatesSection.tsx`: Update all is not offered for an unsupported single project at all (the ruling's header shows it
  disabled when no candidate is left, its test expects none for an unsupported project); an all-`central` list shows it
  disabled.
- The ruling's one test 'update all cancels without a request, and there is no button without an update' covers the
  empty answer after a `cleanup()`; the unsupported case is its own test (another mount).
- The UI test asserts the dialog's shape (`Update N packages?` and `<id>: <from> → <to>` lines) instead of the ruling's
  `Newtonsoft.Json: 13.0.2 →`: an earlier file updates Newtonsoft.Json before this file runs, so which packages join
  depends on order (local run 1); it closes the dialog in a `finally` so a failure cannot cover later tests.
- (b) `narrow sidebar keeps package name visible` checks that a name is whole, or cut only by its cap and at least as
  wide as its version (the ruling's unconditional `>=` fails for a whole short name beside a long version, local run 2);
  it reads the list from the option's listbox and logs the measured widths (`[P9.10] 200 px rows`).
- (b) HC: the border of the section headers in a high-contrast theme comes from `sideBarSectionHeader.border`'s default
  (`contrastBorder`); gate: `main-installed-single-hc` shows the two header lines (follow-up 2).

## Visual check (RUN.md §4)

CI runs 38993886101 and 38993883918 on 8388bff → success (UI `40 passing`, "15 named states; PNGs in the artifact: 15");
artifact `ui-screenshots` of 38993886101:

- viewed: sidebar-sections.png: INSTALLED and UPDATES headers with their counts, the Update all arrow at the end of the
  Updates header; rows start at the section titles' x (Newtonsoft.Json, Serilog, alphabetical); update rows read
  `13.0.2 → 13.0.4` with the new version marked green.
- viewed: sidebar-update-all-dialog.png: "Update 1 package?" over the sidebar with "Serilog: 3.1.1 → 4.4.0" (Newtonsoft.Json
  was updated by an earlier file), Cancel and Update; readable.
- viewed: sidebar-narrow-200px.png: at 200 px "Newtonsoft.J…" cut by its cap beside a whole `13.0.2`, "Serilog 3.1.1"
  whole; the Updates row "Newtonsoft.J… 13.0…"; the search box reads "Search, or filter: @inst" with the Filters button
  beside it, not over the text (SB6).
- viewed: main-installed-single-hc.png: the sidebar's INSTALLED header has its top line (the HC border from
  `sideBarSectionHeader.border`'s default); the UPDATES header sits right under the sash's line, whose own top line is
  transparent by DO 10 (no double line); rows aligned with the titles.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-17, P9.10 (stop-and-ask: the "SVG version arrow" against the P9.4 gotcha, SB6 done by P9.7, the Update all
operation, chrome, indent, sort, the narrow test). Answer of the `architecture-advisor` subagent, verbatim:

`````text
DECISION: Option 2, sharpened; not OWNER MUST DECIDE. Two commits. (a) behaviour: the sidebar's Updates header gets `Update all (N)` confirmed by the shared `ConfirmDialog` inside the sidebar (no host modal, no new `ui/*` request), rows sorted by id, update rows through `Row.nextVersion` (the arrow stays the text node P9.2/P9.4 settled: "SVG version arrow" is closed by deviation, the new version marked), `SectionHeader` gains a `tooltip` prop for the project path. (b) presentation: three `sideBarSectionHeader-*` tokens and the section chrome scoped to the sidebar's two section headers, rows indented to the section title, All Projects project headers in normal case indented by `workbench.tree.indent` (`--nuiget-tree-indent` written by `SidebarView` from the config slice), the UI assertion `narrow sidebar keeps package name visible`, and the captures viewed. SB6 and SB15 need no product change: P9.7 (a) put Clear and Filters into the shared `SearchBox` (`src/webview/shared/search/SearchBox.tsx:334-335`), and P9.2 put the `id version` tooltip on `.nuiget-row-body` for both densities (`src/webview/shared/primitives/Row.tsx:93,129`); P9.10 asserts the tooltip in a sidebar test and views the 200 px capture for the buttons.

WHY: The brief is right about the tree on every point I checked. (1) The arrow: `ProjectUpdates.tsx:112` passes one string `` `${installed} → ${latest}` `` as `version`, so the new version is not marked green and the tooltip is the raw string; `Row.tsx:138-139` already renders `nextVersion` as `{' → '}<span class="nuiget-row-version-new">`, and the P9.4 fix-forward (red six-theme run; gotchas "A `title` on a row", "A symbol-only element and axe") forbids an SVG or a span of its own: SB11 (audit severity low, unverified) predates that evidence, and `UpdatesSection.test.tsx:74`'s `toHaveTextContent('3.0.0 → 3.1.0')` keeps passing unchanged. (2) Update all: D16 names "sidebar Update all" as the owner's decision; interaction model §5 (`docs/ux/interaction-model.md:81`) already gives bulk update an in-panel Dialog; the row's Files column is `webview/sidebar, shared/primitives`, so the host-modal variant the audit's refuters float would need a 46th request under D6 outside this item; the sidebar's host-modal pattern (`SidebarHost.ts:245-266`) exists only because a central update needs the host's preview, and a bulk update excludes central rows (N76, `UpdatesTab.tsx:89-90`, `AllProjectsUpdates.tsx:246-248`). `UpdateAllDialog` lives in `src/webview/main/features/updates/` and the sidebar must not import `webview/main` (no fence forbids it, but it is the wrong direction and moving it widens the file list past the row), so the sidebar renders its own `ConfirmDialog` body (20 lines). (3) Sort: `ProjectPackages.tsx:41` and `ProjectUpdates.tsx:44` filter only; `UpdatesTab.tsx:88` and `AllProjectsUpdates.tsx:196` sort with `a.id.localeCompare(b.id)` (MU9); seven `SidebarView.test.tsx` assertions and one in `UpdatesSection.test.tsx` state the host's order and are named rewrites below. (4) Chrome and indent: `primitives.css:449-500` paints no background, border or colour on `.nuiget-section-header`; `tokens.css:56-124` aliases no `sideBarSectionHeader-*`; `.nuiget-row-option` is `padding: 0 var(--nuiget-space-4)` (8 px, `primitives.css:90-97`) while the title starts at 4 + 16 + 4 = 24 px (`:465-471`, `:488`), which the local capture `/tmp/nuiget-shots/20261016T222117/sidebar-narrow-200px.png` shows (rows at x≈56, "INSTALLED" at x≈72); 1.x aligned rows at 22 px and gave All Projects rows `calc(var(--tree-indent, 8px) + 30px)` (`0457c75:src/webview/sidebar/SidebarApp.css:324-332, 539-541`), suppressed the header border after the sash (`:600-602`) and hovered headers, which VS Code's own pane headers do not; `ExtensionConfig.treeIndent` reaches the webviews only as `config/changed` on change (`SidebarHost.ts:41`) or as the answer to `config/get` once a consumer calls `enable()` (`shared/store/config.tsx:9-38`), and nothing under `src/webview/sidebar` consumes it. `SectionHeader` is shared with the main panel's level-3 headers (`shared/allProjects/folderGroups.tsx`, `InstalledProjectSection`, `AllProjectsUpdates`), so the typography and chrome are scoped in `sidebar.css`, never a level rule in `primitives.css` (MI12 is not in this row; P9.11 owns the main panel's chrome). (5) Overflow: P9.2 already made the compact version give way (`primitives.css:301-315`; `shared/STATUS.md:131`: the 200 px capture reads "Newtonsoft.Json 13.0.2…", the name whole, before P9.2 "Newton… 13.0.2 → 13.0.4"); `Row.test.tsx:245` proves the flex mechanism in jsdom, so the row's named test is a real-layout assertion in the UI suite inside the 200 px drag, and `shared/STATUS.md:169` delegates a retune of the 70 % cap to this item.

DO:

Commit (a) `feat(webview/sidebar): Update all in the Updates header, rows sorted by id, update rows through nextVersion, project path tooltip (P9.10, SB1, SB4, SB8, SB11, SB15, D16, N76, ADR-008)`:

1. Baseline gates green on 9dd20f1 (`npx tsc --noEmit`, `npm run check-types`, `npx eslint src`, `npx vitest run`). Before coding: `grep -n "bulk\|Bulk" src/webview/shared/store/outcomes.ts` → at least one hit (the bulk outcome wording the main panel already uses; the sidebar's `outcomes.ts` re-exports it).
2. `src/webview/sidebar/ProjectUpdates.tsx:112`: replace the one string with `version={update.installedVersion}` and `nextVersion={update.latestVersion}`. Nothing else in `Row` changes.
3. Sort after the filter, same comparator as the main panel: `ProjectPackages.tsx:41` → `result.packages.filter(…).sort((a, b) => a.id.localeCompare(b.id)).map(…)`; `ProjectUpdates.tsx:44` → `rows.filter(…).sort((a, b) => a.id.localeCompare(b.id)).map(…)`. Named rewrites, expected arrays only, titles unchanged: `SidebarView.test.tsx:91, :119, :162, :208, :315` `['Serilog', 'Moq']` → `['Moq', 'Serilog']`; `:327` → `['Moq', 'Serilog', 'xunit']`; `:241-251` (sorted order is Moq, Serilog, xunit, so Delete on Moq then ArrowDown+Enter hits Serilog): expected `['Moq', 'Serilog']`, the second answer `removed('op2', 'Serilog')`, the host's new list `installed(A, [pkg('xunit')])`, `expect(option('xunit')).toHaveFocus()`; `UpdatesSection.test.tsx:73` → `['Newtonsoft.Json', 'Serilog']`. No other test changes for the sort.
4. `src/webview/shared/primitives/SectionHeader.tsx`: optional `tooltip?: string` rendered as `title={tooltip}` on the toggle button (`title` the prop stays the heading text). `SectionHeader.test.tsx`: new `a tooltip goes on the toggle, none without one` (`toHaveAttribute('title', '/w/App/App.csproj')`; without the prop `not.toHaveAttribute('title')`). The `ProjectSection` of `InstalledSection.tsx:57-66` and of `UpdatesSection.tsx:68-77` pass `tooltip={chunk.projectPath}`.
5. Update all in `UpdatesSection.tsx`. Candidates, one pure function in the file (no module-level call): a row of the shown (filtered) list joins when its installed entry exists and `whyNotUpdatable(entry, installed) === undefined` (unsupported and unresolved out), `!isCentral(entry)` (`declaration === 'central'` out; `central-override` joins, N74), and `!isPackageBusy(projectPath, id)`. Single project: from `rows`, `installed.result`. All Projects: per chunk of `all.updates` without `error`, with `all.chunks.get(chunk.projectPath)?.result` as its installed list; groups with at least one package. Header: `actions={count !== undefined && count > 0 ? <IconButton label={`Update all (${candidates.length})`} data-testid="sidebar-update-all-button" disabled={candidates.length === 0} onClick={() => setConfirming(true)}><ArrowUpIcon /></IconButton> : undefined}` (`count` is already undefined while loading, on an unreachable source, on an errored chunk: no button then). Dialog, in the section: `<ConfirmDialog open={confirming && candidates.length > 0} title={n === 1 ? 'Update 1 package?' : `Update ${n} packages?`} confirmLabel="Update" onCancel={() => setConfirming(false)} onConfirm={confirm}>` with `<ul className="nuiget-sidebar-bulk-list">` of `` `${id}: ${installedVersion} → ${latestVersion}` `` and, under All Projects, `<p className="nuiget-sidebar-bulk-lead">In {projectName}:</p>` per group (mirror `UpdateAllDialog.tsx`; copy `main.css:186-193` into `sidebar.css` under the `nuiget-sidebar-bulk-*` names). `confirm`: `setConfirming(false)`, then `run('ops/bulkUpdate', { projectPath, packages: candidates.map(u => ({ id: u.id, version: u.latestVersion, sourceUrl: u.sourceUrl })) })` or `run('ops/bulkUpdateAllProjects', { projectUpdates: groups.map(g => ({ projectPath, projectName, packages })) })`, `.catch(error => announce(`Update failed: ${…}`))`; `run` from `useOpsActions()` (the rows are busy from the call; the host's `feedback.ts` shows the progress notification and the toast, P9.9; the live region says the outcome through `describeOutcome`).
6. `UpdatesSection.test.tsx`, three new titles with the file's fixtures (`UPDATES` = Serilog 3.0.0→3.1.0 and Newtonsoft.Json central): `update all button runs bulk update` (button named `Update all (1)`; click → `confirm-dialog` text contains `Serilog: 3.0.0 → 3.1.0` and not `Newtonsoft.Json`; `axe(document.body)` with `axeRuleOutcome(results, 'aria-dialog-name')` `'passes'`; `confirm-dialog-confirm` → `host.requests('ops/bulkUpdate').map(r => r.payload)` equals `[{ projectPath: A, packages: [{ id: 'Serilog', version: '3.1.0', sourceUrl: FEED }] }]`, dialog gone); `update all under All Projects sends one ops/bulkUpdateAllProjects grouped by project` (the fixture of `:121-142`, with App's installed chunk carrying Serilog so it is a candidate: payload `projectUpdates` of App→Serilog 3.1.0 and Lib→Moq 4.20.72, in stream order); `update all cancels without a request, and there is no button without an update` (cancel → zero `ops/bulkUpdate`; the empty answer of `:155` → `queryByTestId('sidebar-update-all-button')` null; an unsupported project → null). Also add to `:65-81`: `expect(within(updatesList()).getByTestId('package-row-serilog').querySelector('.nuiget-row-body')).toHaveAttribute('title', 'Serilog 3.0.0 → 3.1.0')` (SB15 closed by P9.2, asserted here).
7. UI: `src/test/ui/v2/sidebarWebview.ts` `ScreenshotState` gains `'sidebar-update-all-dialog'` (ci.yml:312 reads the union; nothing else in CI changes). `sidebar-parity.ui.test.ts`, new `it('Update all in the Updates header opens the confirmation; Cancel leaves the project file as it was')`: open the sidebar, wait for an option in `sidebar-updates-list` (bounded poll as `sidebar.ui.test.ts:59`), click `sidebar-update-all-button`, `findByTestId('confirm-dialog')`, its `textContent` contains `Newtonsoft.Json: 13.0.2 →`, `screenshot('sidebar-update-all-dialog')`, click `confirm-dialog-cancel`, poll until no `confirm-dialog`, assert `fs.readFileSync(csprojPath, 'utf-8') === originalCsproj`.
8. Docs of (a): `docs/ux/interaction-model.md` §1 sidebar density cell "…QuickPicks for choices; Update all in the Updates header, confirmed in-panel", §5 "Bulk update / bulk uninstall" Where cell "Updates/Installed toolbar; the sidebar's Updates header (Update all)", §8 new row `` | `sidebar-update-all-button` | Update all in the sidebar's Updates header | `` (plus `sidebar-update-all-dialog` nowhere: it is a screenshot name, not a hook). `ARCHITECTURE.md:646-650` sidebar paragraph: one sentence for Update all (`sidebar-update-all-button`, `ConfirmDialog`, `ops/bulkUpdate` / `ops/bulkUpdateAllProjects`, central rows out) and one for the sort. `README.md:21` sidebar bullet: "…and Update all in the Updates header". CHANGELOG `[Unreleased]` `### Added`: `- **Update all in the sidebar** — the arrow button of the Updates section header updates every update of the selected project, or of every project under All Projects, after an in-panel confirmation that lists them; centrally managed packages stay out`; `### Changed`: `- **Sidebar rows sorted by package id**`, `- **Sidebar project headers carry the project path as tooltip**`. `.github/copilot-instructions.md` row "A `title` on a row": append "Both surfaces pass `nextVersion` for an update row; never build the arrow into the `version` string (the new version is then unmarked and the tooltip wrong; SB11, P9.10)". Gates of §2.2 plus `npm run docs:check`, `node esbuild.mjs --production --analyze` (three sizes in STATUS; the sidebar now carries `Dialog` and `layers.ts`), tracker row `in progress` with (a)'s scope, `src/webview/sidebar/STATUS.md` rewritten, commit, push, wait for green.

Commit (b) `feat(webview/sidebar): side-bar section chrome, rows indented to the section title with workbench.tree.indent, project headers in normal case (P9.10, SB3, SB4, SB5, ADR-008)`:

9. `src/webview/shared/tokens.css`: in the colour block `--nuiget-color-section-header-bg: var(--vscode-sideBarSectionHeader-background);`, `--nuiget-color-section-header-fg: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));`, `--nuiget-color-section-header-border: var(--vscode-sideBarSectionHeader-border, transparent);`; in the HC body block (`:126-131`) `--nuiget-color-section-header-border: var(--vscode-contrastBorder);`; in the forced-colours block bg `Canvas`, fg `CanvasText`, border `CanvasText`. In the size block one `--nuiget-tree-indent: 8px` (the default of `workbench.tree.indent`). Not added to `REQUIRED` of `webview-tokens.test.ts` (no primitive relies on them; the alias check covers them).
10. `src/webview/sidebar/sidebar.css`, tokens only: `.nuiget-sidebar-section > .nuiget-section-header { background: var(--nuiget-color-section-header-bg); border-top: 1px solid var(--nuiget-color-section-header-border); color: var(--nuiget-color-section-header-fg); }` and `.nuiget-sidebar-section > .nuiget-section-header .nuiget-section-toggle { color: inherit; }`; `.nuiget-sash--horizontal + .nuiget-sidebar-section > .nuiget-section-header { border-top-color: transparent; }` (1.x's double line); `.nuiget-sidebar-section-content .nuiget-row-option { padding-inline-start: calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + var(--nuiget-space-2)); }` (= the title's 24 px; Browse rows under `.nuiget-sidebar-browse` stay at 8 px); `.nuiget-sidebar-project .nuiget-section-heading { font-size: var(--nuiget-font-size-md); font-weight: normal; }`, `.nuiget-sidebar-project .nuiget-section-toggle { padding-inline-start: calc(var(--nuiget-space-2) + var(--nuiget-tree-indent)); text-transform: none; }`, `.nuiget-sidebar-project .nuiget-row-option { padding-inline-start: calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + var(--nuiget-space-2) + var(--nuiget-tree-indent)); }`. No hover rule, no weight change on level 2, nothing in `primitives.css` for this.
11. `SidebarView.tsx`: `const { config, enable } = useConfig(); useEffect(() => enable(), [enable]);` and on `<main>` `style={cssVars({ '--nuiget-tree-indent': `${config?.treeIndent ?? 8}px` })}` (`cssVars` from `../shared/primitives`; ADR-006). Consequence to record: the sidebar now asks `config/get` once at mount; no test counts it (grep of `src/test` for `config/get` is empty; `index.test.tsx:38` counts `perf/mark` only).
12. New `src/webview/sidebar/SidebarParity.test.tsx` (the fixtures of `SidebarView.test.tsx`, a local `installSidebarStylesheet()` that appends `installStylesheet()`'s text plus `readFileSync('src/webview/sidebar/sidebar.css')`): `the root carries workbench.tree.indent as --nuiget-tree-indent` (answer `config/get` with a config object copied from an existing test that has `treeIndent: 16` → the `style` attribute of `nuiget-sidebar` contains `--nuiget-tree-indent: 16px`; `host.event('config/changed', { …, treeIndent: 20 })` → `20px`); `rows start at the section title` (`getComputedStyle(option('Serilog')).paddingInlineStart` is the calc string of DO 10; `getComputedStyle(section-header-installed).textTransform` is `uppercase`); `All Projects project headers are in normal case and name their path` (the fixture of `SidebarView.test.tsx:371-397`: `section-header-project-app` has `title` = A, computed `textTransform` `none`, and its option's `paddingInlineStart` is the All Projects calc string).
13. `src/test/ui/v2/sidebar.ui.test.ts`, new `it('narrow sidebar keeps package name visible')` after the P9.0 test, same drag to 200 px and `finally` restore: for every `[role="option"]` of `sidebar-installed-list` and `sidebar-updates-list` (`executeScript` returning name text, `clientWidth`, `scrollWidth` of `.nuiget-row-name` and `clientWidth` of `.nuiget-row-version`): names are `['Newtonsoft.Json', 'Serilog']` in both lists, every name `clientWidth > 0` and `>= ` its version's `clientWidth`, and `Serilog`'s `scrollWidth <= clientWidth`. No new screenshot (the P9.0 test keeps `sidebar-narrow-200px`). Retune, bounded: after the local UI run, if `Newtonsoft.Json` is cut at 200 px while its version cell shows more than `13.0.2…`, `.nuiget-row--compact .nuiget-row-name { max-width }` (`primitives.css:303`) may rise to at most 80 %, with the measured widths in STATUS; otherwise it stays 70 % and the capture observation is recorded.
14. Docs of (b): CHANGELOG `### Changed`: `- **Sidebar section headers in the side-bar section colours, rows indented to the section title, All Projects headers in normal case indented by workbench.tree.indent**`; `ARCHITECTURE.md` sidebar paragraph: `treeIndent` → `--nuiget-tree-indent` on the root; README settings/commands tables unchanged (no new setting; `workbench.tree.indent` is VS Code's); gotcha row "The config slice is lazy": "`useConfig().config` is `undefined` until `enable()` asked `config/get` or the host sent `config/changed` (on change only, `SidebarHost.ts:41`); a consumer calls `enable()` in an effect, as `SourcesControl.tsx:28` and `SidebarView` do". Gates of §2.2, `npm run docs:check`, `npx vitest run src/test/lint`, `node esbuild.mjs --production --analyze`, `npm run test:ui -- --storage /tmp/nuiget-ui` locally (expect 40 passing: 38 + the two new titles; 15 named states), tracker row `done` with both SHAs, STATUS rewritten, commit, push, green CI, then RUN.md:84: download `ui-screenshots` and view `sidebar-sections` (headers painted and bordered, rows and project titles aligned at 24 px, the arrow button before the Updates count, rows alphabetical), `sidebar-narrow-200px` (name whole or cut only by the cap, version ellipsised, Clear/Filters buttons not over the text: SB6), `sidebar-update-all-dialog` (the dialog over the sidebar, the list readable); record `viewed:` lines in `src/webview/sidebar/STATUS.md`.

DO NOT:
- Add a `ui/*` request or any host modal for Update all (D6; the Files column has neither host nor protocol).
- Render the arrow as an SVG, an `aria-hidden` span or a span of its own, or keep the arrow inside the `version` string (P9.4 evidence; `UpdatesSection.test.tsx:74` stays as written).
- Import anything from `src/webview/main` into `src/webview/sidebar`, or move `UpdateAllDialog` into `shared/`.
- Put a level-3 or chrome rule into `primitives.css` (it repaints the main panel's headers; P9.11/MI12 own those), or a hover background on section headers.
- Indent Browse rows, change the count badge behaviour (ruled at P5.4/P5.10), or shorten the sidebar placeholder.
- Start the bulk update with `bus.request('ops/…')` instead of `useOpsActions().run()`, or include `central` rows, busy rows or an unsupported project's rows.
- Use `style={{…}}` with anything but `cssVars()` of `--nuiget-*` properties.
- Rename an existing test title; only the expected arrays named in DO 3 change.
- Raise the sidebar bundle ceiling: a crossing after `ConfirmDialog` lands is a stop-and-ask with the delta and the top metafile inputs.
- `gh run rerun` a red UI job whose failure is the new dialog test or the narrow test; read the log first (N37/N65 rules apply only to the environmental signatures).

CONTRACT CHANGE: none. `src/protocol/**`, `src/core/contracts.ts` and `docs/adr/**` stay untouched; no `.claude/.contract-change` sentinel. Named test rewrites (expected values only): `src/webview/sidebar/SidebarView.test.tsx:91, 119, 162, 208, 241-251, 315, 327`; `src/webview/sidebar/UpdatesSection.test.tsx:73`. New files: `src/webview/sidebar/SidebarParity.test.tsx`. Edited: `src/webview/sidebar/{UpdatesSection,ProjectUpdates,ProjectPackages,InstalledSection,SidebarView}.tsx`, `src/webview/sidebar/sidebar.css`, `src/webview/sidebar/UpdatesSection.test.tsx`, `src/webview/sidebar/SidebarView.test.tsx`, `src/webview/shared/primitives/{SectionHeader.tsx,SectionHeader.test.tsx}`, `src/webview/shared/tokens.css`, `src/webview/shared/primitives/primitives.css` (only if DO 13's bounded retune is measured), `src/test/ui/v2/{sidebarWebview.ts,sidebar-parity.ui.test.ts,sidebar.ui.test.ts}`, `docs/ux/interaction-model.md`, `ARCHITECTURE.md`, `README.md`, `CHANGELOG.md`, `.github/copilot-instructions.md`, `docs/plans/STATUS.md`, `src/webview/sidebar/STATUS.md`.

VERIFY:
- `git diff --stat 9dd20f1 -- src/protocol src/core/contracts.ts docs/adr` → empty; `ls .claude/.contract-change` → no such file.
- `grep -c "nextVersion" src/webview/sidebar/ProjectUpdates.tsx` → 1; `grep -c "localeCompare" src/webview/sidebar/ProjectPackages.tsx src/webview/sidebar/ProjectUpdates.tsx` → 1 and 1; `grep -rn "webview/main\|'\.\./main" src/webview/sidebar` → empty.
- `grep -n "sidebar-update-all-button" src/webview/sidebar/UpdatesSection.tsx docs/ux/interaction-model.md` → one hit each; `grep -n "sidebar-update-all-dialog" src/test/ui/v2/sidebarWebview.ts src/test/ui/v2/sidebar-parity.ui.test.ts` → one hit each.
- `grep -c "section-header-bg\|section-header-fg\|section-header-border" src/webview/shared/tokens.css` → 9 (three tokens × root, HC border only counts 1, forced colours 3: i.e. ≥ 7); `grep -c "nuiget-tree-indent" src/webview/shared/tokens.css src/webview/sidebar/sidebar.css src/webview/sidebar/SidebarView.tsx` → ≥ 1 each; `grep -n "enable()" src/webview/sidebar/SidebarView.tsx` → 1.
- `npx vitest run --project frontend src/webview/sidebar src/webview/shared/primitives --reporter=verbose 2>&1 | grep -E "update all button runs bulk update|update all under All Projects|update all cancels|a tooltip goes on the toggle|the root carries workbench.tree.indent|rows start at the section title|All Projects project headers are in normal case"` → 7 lines, all ✓; exit 0.
- `npx tsc --noEmit` 0 · `npm run check-types` 0 · `npx eslint src` 0 · `npx vitest run src/test/lint` 0 (testids, tokens, colours, stylesheets, css-baseline) · `npm test` exit 0 (1997 + the new titles passed, 9 skipped) · `npm run bench` 0 · `npm run docs:check` 0.
- `node esbuild.mjs --production --analyze` → three sizes pasted in STATUS; sidebar ≤ 351245, webview ≤ 577766, extension ≤ 322502 (extension and webview expected unchanged from 297016 / 548697).
- `npm run test:ui -- --storage /tmp/nuiget-ui 2>&1 | grep -E "passing|failing|named states"` → `40 passing`, no `failing`, 15 PNGs including `sidebar-update-all-dialog.png`.
- CI green on both pushes; `gh run download <id> -n ui-screenshots -D /tmp/nuiget-shots`; three `viewed:` lines in `src/webview/sidebar/STATUS.md` for `sidebar-sections`, `sidebar-narrow-200px`, `sidebar-update-all-dialog`, none contradicting DO 14.

Files checked: `.github/agents/architecture-advisor.agent.md`; `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:300-359` (P9 why, D14-D19, rows P9.2, P9.7, P9.10, P9.11, P9.12); `docs/plans/parity-audit-2026-10-16.md` §SB1-SB15 and MI12; `docs/plans/STATUS.md:122-134`; `docs/plans/RUN.md:70-100`; `docs/ux/interaction-model.md:7-22, 23-60, 78-123, 160-215`; `docs/ux/reference-1.18.9/narrow-sidebar.jpg`; `src/webview/sidebar/{UpdatesSection,ProjectUpdates,ProjectPackages,InstalledSection,SidebarView}.tsx`, `sidebar.css`, `outcomes.ts`, `STATUS.md:1-30`; `src/webview/sidebar/{SidebarView,UpdatesSection,SidebarLayout,index}.test.tsx` (order assertions and fixtures); `src/webview/shared/primitives/{Row,SectionHeader,IconButton,ConfirmDialog,Dialog,Sash}.tsx`, `Row.test.tsx:240-270`, `SectionHeader.test.tsx`, `testSupport.ts:134-141`, `primitives.css:82-130, 145-215, 286-330, 335-346, 445-500, 656-690, 707-719`; `src/webview/shared/tokens.css:13-33, 51-52, 61, 72, 98, 112-192`; `src/webview/shared/installed/rules.ts:43-77`; `src/webview/shared/store/{config.tsx,StoreProvider.tsx,ops.tsx:179,252}`; `src/webview/shared/search/SearchBox.tsx:303-335`; `src/webview/shared/bus/testSupport.ts`; `src/webview/shared/STATUS.md:122-173`; `src/webview/main/features/updates/{UpdatesTab.tsx:40-240,AllProjectsUpdates.tsx:235-290,UpdateAllDialog.tsx}`; `src/webview/main/main.css:183-196`; `src/host/SidebarHost.ts:27-70, 245-266`, `src/host/feedback.ts`, `src/host/services.ts:97`; `src/protocol/messages.ts:47, 160-162`, `src/protocol/domain.ts:347`; `src/test/ui/v2/{sidebar.ui.test.ts:40-105,sidebar-parity.ui.test.ts:1-80,sidebarWebview.ts:20-60,main-updates.ui.test.ts:46-57,STATUS.md:86-112}`; `src/test/lint/{interaction-model-testids,webview-tokens,webview-stylesheets}.test.ts`; `.github/workflows/ci.yml:310-322`; `eslint.config.mjs:15-52`; `ARCHITECTURE.md:99, 520-540, 630-660`; `README.md:20-35`; `CHANGELOG.md:8-16`; `git show 0457c75:src/webview/sidebar/SidebarApp.tsx:1396-1430, 1905-1922` and `SidebarApp.css:207-226, 324-333, 459-472, 536-542, 592-604`; `/tmp/nuiget-shots/20261016T222117/sidebar-narrow-200px.png`; `git log --oneline -12`.
`````

2026-10-17, P9.10 (a) follow-up (two more host-order arrays under the sort), verbatim:

`````text
P9.10 (a) follow-up ruling — two more order assertions under the sort.

DECISION: Yes. `src/webview/sidebar/SidebarView.test.tsx:415` and `:434` join DO 3's named rewrites of P9.10 (a): expected arrays only, titles unchanged. My list missed them (I grepped `names()` hits and read the contexts of :85-120, :155-165, :200-250, :305-340 only); both are the same kind of assertion as the seven named, so this is the ruling's omission, not a new finding. `:326` was the line of the `['Serilog', 'Moq', 'xunit']` array (my ":327" was off by one); the rewrite there stands.

WHY: Verified in the tree: `:415` asserts the host's order `['Serilog', 'Serilog.Sinks.Console', 'Moq']` after `userEvent.clear(search)`, and `:434` asserts `['Serilog', 'Moq']` after the section re-expands; neither test is about order (the first is about the `@installed` filter and the host's focus request, the second about collapse and selection), so stating the sorted order keeps each test's intent intact. The `@installed SERI` assertion at `:409` is already sorted and needs nothing. `git status --short` shows six modified product files and no commit, as the brief says.

DO:
1. `SidebarView.test.tsx:415` → `expect(names()).toEqual(['Moq', 'Serilog', 'Serilog.Sinks.Console']);`
2. `SidebarView.test.tsx:434` → `expect(names()).toEqual(['Moq', 'Serilog']);`
3. Re-run `npx vitest run --project frontend src/webview/sidebar` → 0 failed before continuing with DO 5-8.
4. In `src/webview/sidebar/STATUS.md` and the tracker note, list the rewrites as nine lines: `SidebarView.test.tsx:91, 119, 162, 208, 241-251, 315, 326, 415, 434` and `UpdatesSection.test.tsx:73`, each "expected array in sorted order; title unchanged".
5. Paste this follow-up verbatim under the (a) ruling in `src/webview/sidebar/STATUS.md`.

DO NOT:
- Change any assertion other than the array value on those two lines (the `'Installed 3'` count, the `SERIx` empty state, the selection assertions and `not.toHaveFocus()` stay).
- Rename either test title.
- Make the sort conditional, or sort in the store, to keep the old order "for the tests".
- Treat a tenth red test, if one appears, as covered by this follow-up: it is a new stop-and-ask.

CONTRACT CHANGE: none.

VERIFY: `npx vitest run --project frontend src/webview/sidebar 2>&1 | grep -E "Tests |failed"` → no `failed`, and the test count equals the file's count before DO 2 (no test added or removed by the sort work); `git diff -- src/webview/sidebar/SidebarView.test.tsx | grep -c "^[-+]        expect(names()).toEqual"` → 16 (eight arrays, each one `-` and one `+`; the :241-251 rewrite adds its own `removed`/`installed`/`toHaveFocus` lines on top).

Files checked: `src/webview/sidebar/SidebarView.test.tsx:405-418, 424-440`; `git status --short` (six modified files, nothing staged or committed).
`````

2026-10-17, P9.10 (b) follow-up (`index.test.tsx:37` and `webview-tokens.test.ts:96`), verbatim:

`````text
P9.10 (b) follow-up ruling — `index.test.tsx:37` and `webview-tokens.test.ts:96`.

DECISION: (1) Named rewrite of `src/webview/sidebar/index.test.tsx:37` adding `'config/get'` to the start set, with a once-count, title unchanged; both ARCHITECTURE sentences corrected. (2) Option (b): drop the high-contrast override of `--nuiget-color-section-header-border` (`tokens.css:140`); `webview-tokens.test.ts:96` stays as written and the P9.8 note ("the high-contrast block stays exactly border, focus, shadow") stays true.

WHY: (1) My ruling's "no test counts it" was wrong: `index.test.tsx:37` asserts the exact set of request types at mount (verified), and `ARCHITECTURE.md:669` and `:685` state that set and that the sidebar never asks for the settings; both become false with DO 11, which is the ruling's own consequence (the lazy slice, `config.tsx:9-38`; `SidebarHost.ts:41` sends `config/changed` on change only). P9.7 did the same for the main entry's `layout/get`. The title "asks the host for the session and the projects" stays true and is a title the plan's "never rename" rule covers. (2) `sideBarSectionHeader.border` is registered by VS Code with `contrastBorder` as its default for every theme kind (dark, light, hcDark, hcLight), so in the two HC themes `--vscode-sideBarSectionHeader-border` already resolves to the contrast border and the `transparent` fallback of `tokens.css:87` applies only where no theme sets either (the four default non-HC themes); the HC override is redundant, and removing it keeps the HC block the lint pins. Not verified against VS Code source in this repository (no theme data in `node_modules`); the gate that proves it is `theme.ui.test.ts`'s two HC passes plus the `main-installed-single-hc` capture, where the sidebar's two headers must show a border line.

DO:
1. `src/webview/sidebar/index.test.tsx:37` → `expect(new Set(asked)).toEqual(new Set(['session/get', 'projects/list', 'config/get', 'perf/mark']));` and after `:38` add `expect(asked.filter(type => type === 'config/get')).toHaveLength(1);` (one `enable()`, once under StrictMode too; if StrictMode yields 2, the slice's `known` guard is the thing to read, not the count to relax: stop-and-ask). Comment on the set, if there is one: "+ `config/get` for `workbench.tree.indent` (P9.10)".
2. `ARCHITECTURE.md:669`: "…the sidebar's set is `session/get`, `projects/list`, `config/get` (once, for `workbench.tree.indent`) and the same mark"; `:685`: "The sidebar never asks for suggestions or the source list; it asks `config/get` once, for `workbench.tree.indent`."
3. `src/webview/shared/tokens.css`: delete line 140 (`--nuiget-color-section-header-border: var(--vscode-contrastBorder);`) from the HC block; keep `:87` and the forced-colours `:163`. `npx vitest run src/test/lint/webview-tokens.test.ts` → 0 failed with the file unchanged.
4. Record both in `src/webview/sidebar/STATUS.md` as (b)'s named rewrites: `index.test.tsx:37-38` (set and count), `ARCHITECTURE.md:669, 685`; and the HC decision with the sentence "border in HC comes from `sideBarSectionHeader.border`'s default (`contrastBorder`); gate: `main-installed-single-hc` shows the two header lines". Paste this follow-up verbatim under the (b) ruling.
5. When viewing `main-installed-single-hc.png` (RUN.md:84; it is also a (b) capture now): the sidebar's Installed and Updates headers each have a visible top line. No line → a red gate: then re-add the override under a stop-and-ask naming `webview-tokens.test.ts:96` as the rewrite.

DO NOT:
- Retitle `index.test.tsx`'s test or loosen `:37` to a subset check.
- Rewrite `webview-tokens.test.ts:96` to admit the token (option a): the HC block is pinned on purpose, and the override is redundant.
- Call `enable()` anywhere but once in `SidebarView` (a second consumer would not add a request, but the count assertion is there to catch a loop).
- Leave `ARCHITECTURE.md:669/685` as they are: `npm run docs:check` does not read those sentences, so only the rewrite keeps them true.

CONTRACT CHANGE: none.

VERIFY: `npx vitest run --project frontend src/webview/sidebar/index.test.tsx` → 0 failed; `npx vitest run src/test/lint/webview-tokens.test.ts` → 0 failed, `git diff --stat -- src/test/lint/webview-tokens.test.ts` → empty; `grep -c "section-header-border" src/webview/shared/tokens.css` → 2 (`:87` root alias, forced colours); `grep -n "config/get" ARCHITECTURE.md | grep -c sidebar` → ≥ 1; `grep -n "never asks for suggestions, the source list or the settings" ARCHITECTURE.md` → empty.

Files checked: `src/webview/sidebar/index.test.tsx:28-42`; `src/test/lint/webview-tokens.test.ts:88-98`; `ARCHITECTURE.md:669, 685`; `src/webview/shared/tokens.css:87, 140, 163`; `git log --oneline -2` (fb4a0f9 is (a)).
`````

## Exact next step (one item ID)

P9.11, after P9.10's visual check.

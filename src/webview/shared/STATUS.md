# STATUS — src/webview/shared   UX-P3.12b (on 3b2b29d; the commit that holds this audit follows)   2026-11-16

git status --porcelain --untracked-files=all (before the commit): modified `src/webview/shared/installed/rules.ts`,
`src/webview/shared/installed/rules.test.ts`, `src/webview/sidebar/{packageRows,updateRows,SidebarView,InstalledSection,UpdatesSection}.tsx`,
`src/webview/main/features/installed/InstalledProjectSection.tsx`, `src/webview/main/features/updates/{UpdatesTab,AllProjectsUpdates}.tsx`,
`src/webview/main/main.css`, `docs/plans/STATUS-ux.md`, `docs/plans/handoff/P3.12.md`, this note

Item: **UX-P3.12b** — the code half of UX-P3.12 "Leftover stylesheet debt; store-slice audit" under the
architecture-advisor's opening ruling and its ruling on the DO 10 stop (both pasted in `docs/plans/handoff/P3.12.md`,
which holds the item's whole record). This note replaces the P9.fix-1 note (history at `3b2b29d`) and records the
store-slice audit that the plan row asks for here; the next item in this directory rewrites it, so the tracker row
cites the commit that holds it.

## Verified by running

`npx tsc --noEmit` 0, `npm run lint` 0, `npx vitest run` → `Test Files  181 passed (181)`, `Tests  2594 passed | 9 skipped
(2603)` (2591 before, plus the three new `rules.test.ts` cases). `grep -rn "busyStatus = " src/webview` prints nothing;
`'In progress'` stands in `rules.ts:23` and `SidebarView.test.tsx:302` only; `localeCompare(b.id)` in `rules.ts` only.

## Done (tested)

- `busyText(active, projectPath, packageId)` and `filterById(rows, filter)` in `installed/rules.ts` beside `IN_PROGRESS`
  (V30): the five busy closures and the five filter-and-sort sites call them (`packageRows.tsx`, `updateRows.tsx`,
  `InstalledProjectSection.tsx`, `UpdatesTab.tsx`, `AllProjectsUpdates.tsx`); `usePackageRows` keeps returning
  `busyStatus` as a property that delegates to `busyText`, for `BrowseResults.tsx:53` (ratified).
- `share?: number` on `InstalledSection` and `UpdatesSection` (V70); `SidebarView` passes `layout.split` and
  `100 - layout.split`; each section writes `String(share)` into `cssVars`.
- `main.css`: `.nuiget-source-list, .nuiget-multi-install` share one list rule; `.nuiget-multi-install` keeps only its
  height cap and scroll (V67; design-advisor opening ruling DO 12). The focus-ring offsets stay: −1 on inputs, tabs,
  rows and the dialog, +2 on the check box, 0 on the sash line, each the value DS-FOCUS-1 or DS-DIVIDER-6 names.

## Store-slice audit (research §18; UX-P3.12b)

Columns and verdicts as `docs/research/2026-10-23-ux-research/component-audit.md` §5 (keep: no change; refactor: rules
replaced, structure kept; rebuild: rewritten). Costs in planned days. Read line by line against the invariants of the
architecture-advisor's opening ruling (step 8a), invariant 1 as reworded by its DO 10 ruling: a generation is compared
only inside `src/webview/shared/store`, with the key's own listed generation and by less-than (`useResource.ts:84`,
`projects.tsx:45-46`). A verdict other than keep changes no code here; its proposed tracker row is named.

### a. The store (`src/webview/shared/store`, 14 non-test files, 2,158 lines)

| Component | Verdict | Evidence path:line | Refactor | Rebuild | Tests touched |
|---|---|---|---|---|---|
| `useResource.ts` (129) | keep | the one generic comparison `:84-85`; rejection handled where asked `:80-101`; `asRequestError` `:48-49` (×3 in the store, residual) | — | — | — |
| `projects.tsx` (70) | keep | the first answer dropped only below the key's listed generation `:43-46`, documented `:30-35`; no re-request on invalidation, `projects/changed` replaces the list `:43-44`; a failed first listing recovers only through `projects/changed` `:24-25` (fact) | — | — | — |
| `session.tsx` (138) | keep | actions `snapshot`, `intent`, `settled(id)` `:19-35`, no clear-pending; `settled` only for the request's own id `:109-110`; the presented view built at `:113` only | — | — | — |
| `installed.tsx` (108) | keep | follows `committed` `:39`; key from the host's path `:58`; handlers at creation `:77-85`; `singleProject` `:29-30` (×4, residual) | — | — | — |
| `updates.tsx` (103) | refactor | follows `committed` `:46-48`, key `:49`; the source-recovery retry's timer `:75-80` is not cleared by the effect's cleanup `:67`, and the retry is written again in `allProjects.tsx:241-245` | 0.25 | — | `updates.test.tsx`, `allProjects.test.tsx` |
| `transitive.tsx` (134) | keep | follows `committed` `:49`, key `:76`; its prefetch timer cleared `:63-64`; `metadataKey` `:35` (a second name in `details.tsx:239`, residual) | — | — | — |
| `allProjects.tsx` (374) | refactor | follows `committed` `:160`, `:167`; latest request only, no generation (installed `:314-316` with the reducer guard `:119`, updates `:203-205`, transitive by abort `:253`, `:271`, `:276`); the recovery timer `:241-245` not cleared (with `updates.tsx`); imports `RECOVERY_DELAY_MS` and `metadataKey` from sibling slices `:6-7` | with `updates.tsx` | — | as above |
| `details.tsx` (290) | keep | follows `committed` `:140`; handlers `:108-119`; key prefixes built by hand `:222-223`, the protocol's shape (`src/protocol/domain.ts:234-237`) lower-casing included, so no invalidation is missed (residual) | — | — | — |
| `sources.tsx` (159) | keep | follows `committed` `:57`; `loadConfigFiles` asks on every call `:120-122` (once per dialog open and per add form, `SourceSettingsDialog.tsx:206`, `:74`), against its doc "asked once" `:30` (the item that next edits the file corrects the comment); a failed `sources/configFiles` is stored as `[]` `:121` (fact, unjudged) | — | — | — |
| `search.tsx` (245) | keep | follows `committed` `:110`, `:182`; handlers at creation; `liteKey` `:75` lower-cases id and version (transitive's key the id only, fact) | — | — | — |
| `config.tsx` (49) | keep | lazy: undefined at `:22`, `config/changed` `:26`, `config/get` only when enabled and unknown `:28-36` | — | — | — |
| `ops.tsx` (258) | keep | the one ops sender `:220` (`bus.request(type, payload, { onChunk })`); the outcome handler deletes only its `active` entry `:106-107`, never a row; every `run(` caller attaches `.catch` at the call; private `IN_PROGRESS` `:32` is a status set, `rules.ts:10`'s an exported label record (two meanings, residual) | — | — | — |
| `outcomes.ts` (53) | keep | `projectName` `:8` the same as `InstalledTab.tsx:28` `nameOf` (residual) | — | — | — |
| `StoreProvider.tsx` (48) | keep | the nesting satisfies every slice's dependencies | — | — | — |

Module-level calls (N63): `new Map()` and `new Set()` in `allProjects.tsx:59`, `:82-83`, `:107`, `installed.tsx:26`,
`transitive.tsx:30`, `sources.tsx:38`, `ops.tsx:30`, `:32`; esbuild 0.28.2 drops them when unused (stdin probe), so none
holds a bundle back.

### b. `main.css`'s feature block (as it stands today; the research's 317-590 range no longer maps)

| Section (line) | Verdict | Evidence path:line | Refactor | Rebuild | Tests touched |
|---|---|---|---|---|---|
| Installed tab (`:149-168`, 3 rules) | keep | one placement reach `.nuiget-installed > .nuiget-toolbar` `:158` (ruled to stay); the column-fill block also at `.nuiget-installed-lists` `:162-167` | — | — | — |
| Browse results (`:169-179`, 1 rule) | keep | the column-fill block with `position: relative` `:172-178` | — | — | — |
| Details pane (`:180-348`, 24 rules) | keep | one placement reach `.nuiget-details .nuiget-tabpanel` `:193` (ruled to stay); three README rules filed under it (`:264-270`, `:337-340`, `:343-347`); `.nuiget-details-list` `:316-323` repeats the grouped list rule's six declarations (residual, design-advisor); `.nuiget-readme a` `:337-340` repeats `.nuiget-details a`'s link colour | — | — | — |
| README (`:349-554`, 32 rules) | keep | `code` `:402-410` and `pre` `:464-472` share their colours and face; `font-weight: 600` literal `:364`, `:434` where `:214` reads `--nuiget-font-weight-semibold` (residual) | — | — | — |
| NuGet sources dialog (`:555-643`, 13 rules) | keep | the grouped list rule `:573-582` (this item); `.nuiget-add-source` `:610-614` and `.nuiget-add-source-credentials` `:626-630` identical; `.nuiget-field` `:632` generic, filed here (residual) | — | — | — |
| Install in several projects (`:644-675`, 5 rules) | keep | `.nuiget-multi-install` keeps its height cap and scroll `:654-657`; its row and note repeat the sources row's and caption's declarations (residual) | — | — | — |

### c. Component audit §8.4 today

| Logic | Status | Where |
|---|---|---|
| Busy text | shared in this item | `busyText`, `installed/rules.ts:16-24` |
| Filter and sort by id | shared in this item | `filterById`, `installed/rules.ts:27-30`; the filter alone still counts the header's matches (`sidebar/InstalledSection.tsx:183-184`, `UpdatesSection.tsx:204-205`, residual) |
| Update-all candidates | shared (UX-P3.7d) | `updateCandidates`, `installed/rules.ts:103-111` |
| Bulk selection | state shared (UX-P2.1c), wiring ×4 | `selection/useBulkSelection.ts:21-55`; the `confirming` state, `confirm()` and toolbar per tab (residual) |
| Central predicate, CPM title | duplicated | `central || central-override` ×5 (`UpdatesTab:72-76`, `AllProjectsUpdates:35-39`, `updateRows:54`, `InstalledProjectSection:51`, `packageRows:43`); the override-aware title ×3, the installed rows plain (copy, design-advisor; residual) |
| Row icon `<img>` | `src` shared (`packageIcon.ts:19-21`), JSX ×5 | a `Row` prop would be design trigger 5 (residual) |
| `isVulnerable` | ×2 | `main/MainTabs.tsx:16-17`, `InstalledProjectSection.tsx:14-15` (residual) |
| Perf marks, announce, `ui/focusSearch` | shared | `useShellChrome`, `shellChrome.ts:11-52`; the first-useful-render predicate ×2 (residual) |
| Bulk list in a confirmation | shared | `UpdateAllDialog`, `ConfirmDialog` with `DialogGroups` |
| Workspace-folder caption | helpers shared, loop ×4 | `allProjects/folderGroups.tsx` (`groupByFolder`, `projectGroupIds`); the folder-row loop, its id fallback and the collapse toggle per list; folder rows uppercase in the main panel, normal case in the sidebar (residual) |
| Search input rule | shared | `search/SearchBox.tsx`, `search/search.css` |
| All Projects project header case | shared | `SectionHeader` `level`, `primitives.css:781-786` |
| `CentralUpdateDialog` mounts | one (UX-P3.1a) | `MainShell.tsx:269` |
| `useInstallAction` instances | one | `MainShell.tsx:106` |
| `ui/reportError` reporter | ×2 (outside §8.4) | `main/index.tsx:22-33`, `sidebar/index.tsx:19-29` (residual) |

Residuals are proposed for the planning session as tracker rows in `docs/plans/STATUS-ux.md` (the P3.12 row).

## Done (untested)

The G-UI run of P3.12b: every cell at 0 px (the design-advisor's DO 13).

## Not started

Nothing beyond the run.

## Deviations from contract/ADR (file:line each)

- `src/webview/sidebar/packageRows.tsx:71`: `usePackageRows` still returns `busyStatus`, a property delegating to
  `busyText`, because `BrowseResults.tsx:53` reads it (ratified by the DO 10 ruling).

## Advisor decisions (date, item, question, answer verbatim)

In `docs/plans/handoff/P3.12.md` (opening ruling for P3.12b and the ruling on the DO 10 stop).

## Exact next step (one item ID)

UX-P3.12: the P3.12b run, then the closing of P3.12.

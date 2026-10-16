# STATUS — src/webview/main   commit 3e6a622 (P9.7 closed; parent of this docs commit)   2026-10-17T04:10:00Z

git status --porcelain --untracked-files=all (before commit (a)): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `README.md`,
`docs/plans/STATUS.md`, `docs/ux/interaction-model.md`, `src/test/harness/{scenarios.test.ts,STATUS.md}`,
`src/webview/main/{MainShell.tsx,MainShell.test.tsx,main.css,STATUS.md}`,
`src/webview/main/features/sources/{SourcesControl.tsx,SourcesControl.test.tsx}`, `src/webview/shared/STATUS.md`,
`src/webview/shared/primitives/IconButton.tsx`, `src/webview/shared/search/{SearchBox.tsx,SearchBox.test.tsx,search.css}`

git status --porcelain --untracked-files=all (before commit (b)): modified `ARCHITECTURE.md`, `CHANGELOG.md`,
`docs/plans/STATUS.md`, `docs/ux/interaction-model.md`, `src/test/ui/v2/main-shell.ui.test.ts`,
`src/webview/main/{MainShell.tsx,MainShell.test.tsx,index.tsx,index.test.tsx,STATUS.md}`, `src/webview/shared/STATUS.md`,
`src/webview/shared/primitives/{Tabs.tsx,Tabs.test.tsx}`, `src/webview/shared/search/{SearchBox.tsx,search.css}`,
`src/webview/sidebar/SidebarView.tsx`; new `src/webview/shared/viewState.ts`

Item: **P9.7** — Header parity (parity audit MH1, MH2, MH3, MH4, MH7, MH8, MH13; SB6 through the shared search box),
by the stop-and-ask ruling below, in two commits: (a) header chrome; (b) split and tab memory, the vulnerability
badge. This note replaces the P9.6 note (history at `54603be`, its ruling verbatim there).

## Verified by running

```text
baseline (54603be)          → npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npx vitest run exit 0
                              (Tests 1959 passed | 9 skipped (1968)); CI runs 38980410997, 38980408658 → success
commit (a):
npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npm run lint 0
npx vitest run --project backend src/test/lint → Tests 131 passed (131) · npm run docs:check → exit 0
npx vitest run --project frontend src/webview → Tests 524 passed before the new tests; the three files after: 43 passed
npx vitest run --project integration → exit 0 · Tests 23 passed (23)
npm test                    → exit 0 · Test Files 131 passed (131) · Tests 1965 passed | 9 skipped (1974)
npm run bench               → exit 0
rm -rf dist out/esbuild && node esbuild.mjs --production --analyze → dist/extension.js 293359 / 322502 ·
                              dist/webview.js 542396 / 577766 · dist/sidebar.js 326978 / 351245
rm -rf dist && npm run package && npm run check:vsix → check:vsix: OK
rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui → exit 0 · 38 passing (1m) · 14 PNGs
                              (local main-installed-single: title left, both checkboxes and the selectors right, one line;
                              sidebar-narrow-200px: the sidebar box keeps its placeholder with the Filters button)
CI runs 38982375640 (success, UI job `14 named states; PNGs in the artifact: 14`) and 38982372423 on 3bfc748
commit (b):
npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npm run lint 0 · npm run docs:check 0
npx vitest run --project backend src/test/lint → Tests 131 passed (131)
npx vitest run --project frontend src/webview → Tests 537 passed (537)
npm test                    → exit 0 · Tests 1973 passed | 9 skipped (1982) · npm run bench → exit 0
rm -rf dist out/esbuild && node esbuild.mjs --production --analyze → dist/extension.js 293359 / 322502 ·
                              dist/webview.js 543634 / 577766 · dist/sidebar.js 327034 / 351245 (after the padding fix; npm test
                              again → exit 0, 1973 passed | 9 skipped)
grep -rn "from '../sidebar\|from '../../sidebar" src/webview/main (code) → none
rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui → exit 0 · 38 passing (1m) · 14 PNGs
                              (local: list pane about 35 %; sidebar-narrow-200px placeholder "…, or filter: @install")
```

## Done (tested)

- Commit (a): the header shows `h1` "Manage NuGet packages", the Restore after operations checkbox (`session/set
  { restoreEnabled }`), Include prerelease, the project and source selectors and Refresh, in the 1.x order; Refresh is
  disabled with `LoadingIcon` while `refresh/all` is unanswered, and a `ProgressBar` ("Refreshing") lies over the
  bottom of the search area while it runs or the shown tab's list revalidates; `SourcesControl` marks a failed source
  "(unreachable)" with its error as the tooltip and shows `source-health-indicator`, which sends `sources/refresh`;
  `SearchBox` has Clear and Filters buttons (`tabIndex={-1}`, focus kept), the native cancel button hidden.
- Tests (a): `renders the title as the heading of the panel`, `unchecking Restore after operations asks the host once
  and shows the choice at once`, `refresh is disabled and a progress bar shows while refresh/all is unanswered`, the
  extension of `renders the header, the search box, the tabs, the split and one live region` (both checkboxes)
  (MainShell.test.tsx); `a failed source is marked in the selector and the indicator retries with sources/refresh`
  (SourcesControl.test.tsx); `Clear empties the box and keeps focus; Filters opens the prefix list`
  (SearchBox.test.tsx); `restore toggle in header syncs with sidebar` (src/test/harness/scenarios.test.ts).
- Docs (a): interaction model §1 (header), §2 (Clear and Filters), §8 (`source-health-indicator`); README source
  health and restore; ARCHITECTURE main shell table (Title, Restore, Source selector, Refresh, Search box); CHANGELOG
  `[Unreleased]` Changed.

- Commit (b): `SPLIT.initial` 35; `layout/get` once at mount (ignored once the user moved the sash), `layout/set` from
  `Sash.onChangeEnd` only; the chosen tab kept in the webview state (`viewState` from `index.tsx`, the type in
  `src/webview/shared/viewState.ts`, re-exported by `SidebarView.tsx`), written on a tab choice and on
  `ui/selectProject` with `initialTab`; the Installed tab's vulnerability badge from the lite metadata maps (`Tabs`
  `badge`, tone `error`), none while the metadata is empty. The search box pads only for the buttons it shows (fix of
  (a)'s visual check, below).
- Tests (b): `split position persists`, `a kept split of {} leaves the default 35 %` and of `{"splitPosition":"x"}`,
  `last tab is remembered in the view state`, `an unknown tab starts on Installed`, `a store that throws starts on
  Installed`, `the Installed tab shows a vulnerability badge once the metadata lists one, and none while the metadata
  is unknown` (MainShell.test.tsx); `a tab with a count and a badge names both` (Tabs.test.tsx).
- Named rewrites (b): `MainShell.test.tsx` 'the sash resizes the list through one custom property' `50%` → `35%` (the
  ruling's `:204`) and `52%` → `37%` (follow-up ruling, the 35 % default); `src/test/ui/v2/main-shell.ui.test.ts:44-45`
  `'50%'` → `'35%'`, `0.5` → `0.35`; `src/webview/main/index.test.tsx:36` the start set gains `layout/get`, plus a count
  of one (follow-up ruling, consequence of DO 10).
- Docs (b): ARCHITECTURE Tabs and Split rows, the start-requests sentence; interaction model §2 `default` row;
  CHANGELOG `[Unreleased]` Changed (split, tab memory, vulnerability badge).

## Done (untested)

- None.

## Not started

- None of P9.7.

## Deviations from contract/ADR (file:line each)

- The ruling's "harness project of `vitest.config.mts`" is named `integration` (`vitest.config.mts:82`).
- `Clear empties the box and keeps focus; Filters opens the prefix list` asserts the box's value instead of an
  `onChange` spy: the test harness's `onChange` is its state setter (`SearchBox.test.tsx:11-31`), so the value is what
  `onChange` was given. It also asserts that Tab from the box skips both buttons.
- `restore toggle in header syncs with sidebar` imports `commands` from `../__mocks__/vscode` as `mockCommands`, the
  name `harness.ts:19` uses.
- (b) `search.css`: the ruling's `padding-inline-end: calc(2 * var(--nuiget-target-min))` applies only while Clear shows
  (`.nuiget-search-box--clearable`); an empty box reserves one target for Filters. Reason: (a)'s `sidebar-narrow-200px`
  capture cut the sidebar placeholder to "Search, or filter: @" (P9.6's capture read "…@instal"), a red gate under DO 16.
  The sidebar placeholder was already cut at 200 px before P9.7; that is P9.10's narrow-width overflow.
- (b) The vulnerability test answers the slice's own `transitive/metadata` ask after `waitFor`, and the split test
  checks the once-guard under StrictMode in the same title.

## Visual check (RUN.md §4)

CI run 38982375640 on 3bfc748 (commit (a)), artifact `ui-screenshots`, 14 PNGs:

- viewed: main-installed-single.png: one header line: "Manage NuGet packages" left; Restore after operations (checked),
  Include prerelease, TestProject.csproj, All sources, gear, refresh right; the search box ends in the Filters icon.
- viewed: main-installed-single-light.png: the same header in Light Modern, readable; no wrap.
- viewed: main-installed-single-hc.png: the same header in High Contrast, checkbox borders visible; no wrap.
- viewed: main-installed-all.png: "All Projects (2)" in the selector, header on one line.
- viewed: main-updates.png: header on one line; Updates rows unchanged; the pane empty.
- viewed: main-browse-results.png: Clear (×) and Filters at the end of the box with text; no native cancel button.
- viewed: main-quicksearch-open.png: Clear and Filters in the box, the suggestions below unchanged.
- viewed: sidebar-sections.png: the sidebar box "Search, or filter: @installed, @upd" with the Filters icon.
- viewed: sidebar-narrow-200px.png: RED: the placeholder is cut to "Search, or filter: @" (P9.6: "…@instal"); fixed
  forward in (b) by reserving room only for the buttons shown (deviation above).

CI runs 38983158395 and 38983155758 on 3e6a622 (commit (b)) → success; "Check the named screenshots": `14 named states;
PNGs in the artifact: 14`. Artifact `ui-screenshots` of 38983158395:

- viewed: main-installed-single.png: list pane about 35 % of the split (sash near x 677 of 348-1280); header unchanged.
- viewed: main-updates.png: list pane about 35 %; the update rows' authors end in an ellipsis at that width.
- viewed: main-browse-results.png: list pane about 35 %; Clear (×) and Filters in the box with text.
- viewed: sidebar-narrow-200px.png: the sidebar placeholder reads "Search, or filter: @inst" with the Filters icon
  (P9.6: "…@instal"; (a): "…@"); the main split about 35 %.

Seen at P9.7, for P9.11: in `main-installed-single-hc.png` the dark Newtonsoft.Json icon is invisible on the High
Contrast black.

## Advisor decisions (date, item, question, answer verbatim)
## Advisor decisions (date, item, question, answer verbatim)

2026-10-17, P9.7 (stop-and-ask: files beyond the row's list, the split default against the audit's verifier, the
meaning of "Title", the tab memory, the source of the vulnerability count). Answer of the `architecture-advisor`
subagent, verbatim:

`````text
DECISION: Option 2, as amended here: P9.7 is one tracker item landed in two green commits, (a) header chrome and (b) memory and badges, with the split default 35 % as the plan row says (not option 3), the title as an `h1` inside the webview header (the panel tab stays `nUIget`), the tab kept in the webview's own state (`getState`/`setState`, like the sidebar), the vulnerability badge counted from the lite metadata maps, and the file list below (SourcesControl, Tabs, SearchBox, the harness scenarios, `index.tsx` and the docs are approved as the item's files). No contract change.

WHY: The plan row (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:354`) is the owner's instruction written after the audit, so "split default 35 %" stands over the audit verifier's note at `parity-audit-2026-10-16.md:689`; CLAUDE.md says the plan wins when documents disagree. Split persistence and tab memory follow ADR-001:28-29 verbatim ("surface-local state … stays in the webview via `getState/setState`; the host only persists layout preferences (`layout/*`)"): the host handlers exist (`src/host/handlers.ts:241-255`), and `src/webview/main/index.tsx:19` already acquires the API once, so no host file changes. The 1.x header (`git show 0457c75:src/webview/app/App.tsx:2409-2496` and `docs/ux/reference-1.18.9/installed-filter-count.jpg`) has the heading inside the webview, the restore and prerelease checkboxes, the `⚠` prefix plus a warning button for failed sources, and a refresh button disabled with a loading icon while loading; everything it needs exists in 2.0: `SessionIntent.restoreEnabled` (`src/protocol/domain.ts:214`), `useSources().failed` (`src/webview/shared/store/sources.tsx:10-11`), `sources/refresh` (`src/protocol/messages.ts:147`, `handlers.ts:333-338`, which resets the health tracker through `feeds.reset()` → `serviceIndex.clearCaches()` → `health.reset()` and the `sources/health` event of `src/extension.ts:240-243`), `ProgressBar`, `Spinner`/`LoadingIcon`, `FilterIcon`, `CloseIcon`, `WarningIcon`, `Badge` with `tone` and `title`. The 2.0 host never fills `InstalledPackage.vulnerabilities`; vulnerabilities arrive in `PackageMetadataLite` through the installed slice's `metadata` map (`store/installed.tsx:18`, `InstalledProjectSection.tsx:42`), so the tab badge counts from there and shows nothing while the map is empty (gotcha "Empty is not unknown"). Two commits lose at most half a day on interruption (the P9.6 precedent).

DO:

Commit (a), `feat(webview/main): header parity: title, restore checkbox, source health marker, refresh state, search box buttons (P9.7, MH1, MH4, MH7, MH8, SB6)`:

1. Baseline gates on 54603be before editing: `npx tsc --noEmit`, `npm run check-types`, `npx eslint src`, `npx vitest run` → all green (already recorded in the brief; re-run and paste).
2. `src/webview/main/MainShell.tsx` header, in this order (1.x order, the baseline of D14–D19): `<h1 className="nuiget-main-title">Manage NuGet packages</h1>`; `<label className="nuiget-main-toggle"><input type="checkbox" checked={session?.restoreEnabled ?? true} disabled={!hasSession} onChange={event => set({ restoreEnabled: event.target.checked })} />Restore after operations</label>`; the existing Include prerelease label; the project `<select>`; `<SourcesControl>`; the refresh button. Nothing else about the selectors changes.
3. `src/webview/main/main.css`: `.nuiget-main-title { margin: 0; margin-inline-end: auto; font-size: var(--nuiget-font-size-md); font-weight: 600; }` (em token only: `webview-stylesheets.test.ts:86` forbids px). Keep `.nuiget-main-refresh { margin-inline-start: auto }` or drop it; either is fine once the title pushes the controls to the end.
4. Refresh busy (MH7) in `MainShell.tsx`: `const [refreshing, setRefreshing] = useState(false)`; `refresh` sets it true, sends `refresh/all`, and sets it false in both branches after announcing; `<IconButton label="Refresh" disabled={refreshing} …>{refreshing ? <LoadingIcon /> : <SyncIcon />}</IconButton>` (the label stays "Refresh": `MainShell.test.tsx:137,141` find it by name; do not add an `aria-busy` prop to `IconButton`). Revalidation bar: inside `.nuiget-main-search`, after the `SearchBox`, `{showBar ? <ProgressBar label="Refreshing" /> : null}` with `showBar = refreshing || (!browsing && (tab === 'installed' ? installedSlice.revalidating || allProjects.revalidating : updatesSlice.revalidating || allProjects.updates.revalidating))` (`BrowseList.tsx:83` draws its own bar in browse mode). In `main.css` give `.nuiget-main-search` `position: relative` and the bar `position: absolute; inset-inline: var(--nuiget-space-6); bottom: 0` (a rule `.nuiget-main-search .nuiget-progress` is allowed: the class prefix lint checks class names, not nesting), so the list does not move when the bar appears.
5. `src/webview/main/features/sources/SourcesControl.tsx` (MH4): destructure `failed` too; `const failedByUrl = new Map(failed.map(f => [f.url, f.error]))`; each enabled option renders `{failedByUrl.has(source.url) ? `${source.name} (unreachable)` : source.name}` with `title={failedByUrl.get(source.url) ?? source.url}`; when `failed.length > 0`, next to the gear: `<IconButton label={`${failed.length} source${failed.length === 1 ? '' : 's'} unreachable. Retry`} data-testid="source-health-indicator" className="nuiget-source-health" onClick={() => bus.request('sources/refresh', {}).catch(() => undefined)}><WarningIcon /></IconButton>`. The click sends `sources/refresh`, never the slice's `refresh()` (that re-sends `sources/list`, which does not reset health, so the marker would stay); the slice follows through the `sources/health` event (`[]` from `health.reset()`) and the `resources/invalidated` of scope `sources`. `main.css`: `.nuiget-source-health { color: var(--nuiget-color-warning); }` (token exists, `tokens.css:68`).
6. `src/webview/shared/search/SearchBox.tsx` and `search.css` (MH8, both surfaces, SB6 included since the component is shared): after the `<input>` inside `.nuiget-search-box`, a `<span className="nuiget-search-actions">` holding `{value !== '' ? <IconButton label="Clear search" tabIndex={-1} onMouseDown={keepFocus} onClick={() => change('')}><CloseIcon /></IconButton> : null}` and `<IconButton label="Filters" tabIndex={-1} onMouseDown={keepFocus} onClick={() => change(prefixMode ? '' : '@')}><FilterIcon /></IconButton>`. `IconButton` has no `onMouseDown` prop today: add it to `IconButtonProps` (one optional pass-through prop) rather than wrapping the buttons; the `keepFocus` handler already exists in `SearchBox` and keeps the popup from closing on blur. `tabIndex={-1}` is mandatory: `src/test/ui/v2/main-shell.ui.test.ts:54-58` tabs from the box straight to `installed-tab`. CSS: `.nuiget-search-actions { position: absolute; inset-inline-end: var(--nuiget-space-1); top: 0; bottom: 0; display: flex; align-items: center; }`, `.nuiget-search-box > input { padding-inline-end: calc(2 * var(--nuiget-target-min)); }`, and `.nuiget-search-box > input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }` (not on the Chromium-114 denylist of `webview-css-baseline.test.ts`; the native `×` the brief saw is that control). Keep `.nuiget-search-popup` where it is (it hangs from `.nuiget-search-box`).
7. Tests for (a), named, all new unless marked: `MainShell.test.tsx`: `renders the title as the heading of the panel` (`getByRole('heading', { level: 1, name: 'Manage NuGet packages' })`); `unchecking Restore after operations asks the host once and shows the choice at once` (mirror :105-114: `session/set` with `{ restoreEnabled: false }` exactly once, the box unchecked before the answer, a `session/changed` with `restoreEnabled: true` re-checks it); `refresh is disabled and a progress bar shows while refresh/all is unanswered` (button disabled and `getByRole('progressbar')` present; after the answer both gone and "Refreshed" said once); extend `:79` "renders the header…" to assert both checkboxes. `SourcesControl.test.tsx`: `a failed source is marked in the selector and the indicator retries with sources/refresh` (respond `sources/list` with `failed: [{ url: SOURCES[0].url, error: 'ECONNREFUSED' }]`; the option text ends with `(unreachable)`; `source-health-indicator` present; click sends one `sources/refresh`; then a `sources/health` event with `failed: []` removes the marker and the indicator; axe clean). `SearchBox.test.tsx`: `Clear empties the box and keeps focus; Filters opens the prefix list` (Clear only with text, `onChange('')`, input still `document.activeElement`; Filters → `onChange('@')`; pressed again with `@` → `onChange('')`; axe clean with the buttons). `src/test/harness/scenarios.test.ts`: `restore toggle in header syncs with sidebar`: `createHarness({ tree: TWO_PROJECTS, selectedProject: 'A/A.csproj' })`, resolve both surfaces, `const off = await h.toggle('main', 'restoreEnabled')` → `off.restoreEnabled === false`; `h.settle` until both `main.session?.restoreEnabled` and `sidebar.session?.restoreEnabled` are `false`; `expect(vi.mocked(commands.executeCommand).mock.calls).toContainEqual(['setContext', 'nuiget.restoreEnabled', false])` (import `commands` from `../__mocks__/vscode` as `harness.ts:19` does); an `ops/remove` of a non-central package from the sidebar completes with `h.dotnet.count(dotnetCalls.restore()) === 0`; `h.toggle('sidebar', 'restoreEnabled')` back and `main.session?.restoreEnabled === true`; `expectOneResponsePerRequest` on both.
8. Docs for (a): `docs/ux/interaction-model.md` §1:14-17 (the main header shows the title, the Restore after operations and Include prerelease checkboxes, the project and source selectors, a failed source marked "(unreachable)" with a warning button that retries, and a refresh button disabled while it runs); §4 Revalidating row unchanged (now true for the main panel); §2:30 add "the box has a Clear button and a Filters button that puts `@` in it"; §8 Sources row gains `source-health-indicator`. `README.md:47-49` (the header's source selector marks an unreachable source and its warning button retries) and `:57-58` ("Turn it off with the checkbox in the main panel header or the shield button in the sidebar's title bar; it applies to operations from both views"). `ARCHITECTURE.md:560-567` table: a Title row, a Restore row, the Refresh row (disabled with a loading icon; progress bar under the search box while the shown list revalidates), Search box row (Clear and Filters), Source selector row (unreachable marking, `sources/refresh`). `CHANGELOG.md` `## [Unreleased]` `### Changed`, headline-only bullets, e.g. `- **The main panel header shows the title, the Restore after operations checkbox, an unreachable-source marker with Retry, a busy refresh button and a revalidation bar; the search box has Clear and Filters buttons**`. Do not touch line 53 (it is under `## [2.0.0]`).
9. Gates for (a): `npx tsc --noEmit` 0 · `npm run check-types` 0 · `npx eslint src` 0 · `npx vitest run --project frontend src/webview` · the harness project of `vitest.config.mts` on `src/test/harness` · `npx vitest run src/test/lint` · `npm test` exit 0 · `npm run bench` · `npm run docs:check` 0 · `rm -rf dist out/esbuild && node esbuild.mjs --production --analyze` (paste the three sizes; sidebar grows by two icons and the buttons, expect under a few KB) · `rm -rf dist && npm run package && npm run check:vsix`. Commit, push, wait for green CI.

Commit (b), `feat(webview/main): split 35 % kept through layout/*, last tab kept in view state, Installed vulnerability badge (P9.7, MH2, MH3, MH13, ADR-001)`:

10. `MainShell.tsx`: `SPLIT = { min: 25, max: 75, initial: 35 }` (range stays; the row names only the default). On mount, once under StrictMode (a ref like `markedReady`): `bus.request('layout/get', {}).then(({ result }) => { const kept = result.splitPosition; if (typeof kept === 'number' && Number.isFinite(kept) && !moved.current) { setSplit(Math.min(SPLIT.max, Math.max(SPLIT.min, kept))); } }, () => undefined)`; `moved` is a ref set true in `onChange`. Sash: keep `onChange={setSplit}` and add `onChangeEnd={value => bus.request('layout/set', { splitPosition: value }).catch(() => undefined)}`. Never write from `onChange` (gotcha "Webview state written per pointer step").
11. Tab memory: new `src/webview/shared/viewState.ts` exporting `interface ViewStateStore { getState(): unknown; setState(state: unknown): void }`; `src/webview/sidebar/SidebarView.tsx:23-26` imports it from there and keeps `export type { ViewStateStore }` so `sidebar/index.tsx` and `SidebarView.test.tsx` are untouched (a main → sidebar import is a cross-surface import; the fence does not forbid it, ADR-008 does). `MainShellProps` gains `viewState?: ViewStateStore`; `src/webview/main/index.tsx` does what the sidebar entry does (`const api = acquireVsCodeApi(); const bus = createMessageBus(api); … <MainShell viewState={api} …>`). In `MainShell`: `readMainTab(store)` returns `'installed' | 'updates'` from `(store?.getState() as { tab?: unknown })?.tab` inside try/catch, `'installed'` for anything else; `useState<MainTab>(() => readMainTab(viewState))`; a `keepTab(next)` helper writes `viewState?.setState({ ...(the kept object or {}), tab: next })` and is called from `selectTab` and from the `ui/selectProject` handler when `initialTab` is set. Only `tab` is kept there; the split is the host's (`layout/*`).
12. Vulnerability badge (MH3): `src/webview/shared/primitives/Tabs.tsx`: `TabItem` gains `badge?: { label: string; title: string; tone?: BadgeTone }`, rendered after the count as `{' '}<Badge label={badge.label} title={badge.title} tone={badge.tone} />` (same white-space trick as the count; the title becomes part of the tab name). `MainShell.tsx`: `const isVulnerable = (map, id) => (map.get(id.toLowerCase())?.vulnerabilities?.length ?? 0) > 0`; single project: `installedSlice.metadata.size === 0 ? undefined : (installedSlice.result?.packages.filter(p => isVulnerable(installedSlice.metadata, p.id)).length || undefined)`; All Projects: over `allProjects.chunks` with `allProjects.metadata.get(path)`, `undefined` while no project has metadata; pass `badge: { label: String(n), title: `${n} package${n === 1 ? '' : 's'} with known vulnerabilities`, tone: 'error' }` on the Installed tab only when defined (same tone as the row's `Vulnerable` badge, `InstalledProjectSection.tsx:131`; no severity colours, `ARCHITECTURE.md:241-242`).
13. Tests for (b), named: `MainShell.test.tsx`: `split position persists` (the row's gate: `layout/get` answered `{ splitPosition: 40 }` → `--nuiget-split: 40%;` on `.nuiget-main-split`; `End` on the sash sends exactly one `layout/set` with `{ splitPosition: 75 }`; `layout/get` answered `{}` or `{ splitPosition: 'x' }` keeps `35%`; `layout/get` asked exactly once under StrictMode); `last tab is remembered in the view state` (a store whose `getState()` returns `{ tab: 'updates' }` starts on Updates; choosing Installed calls `setState` with `{ tab: 'installed' }`; `{ tab: 'x' }` and a throwing `getState` start on Installed); `the Installed tab shows a vulnerability badge once the metadata lists one, and none while the metadata is unknown` (respond `installed/get` with three packages, then the slice's `transitive/metadata` request with one entry carrying `vulnerabilities` per the `PackageVulnerability` shape of `domain.ts`; before the metadata answer the tab name is `Installed 3`, after it `Installed 3 1 package with known vulnerabilities`; pattern `InstalledTab.test.tsx:236`). `Tabs.test.tsx`: `a tab with a count and a badge names both` (accessible name `Installed 3 1 package with known vulnerabilities`; axe clean). Named rewrites: `MainShell.test.tsx:204` (`'--nuiget-split: 50%;'` → `35%`), `src/test/ui/v2/main-shell.ui.test.ts:44-45` (`'50%'` → `'35%'`, ratio `0.5` → `0.35`).
14. Docs for (b): `ARCHITECTURE.md:567` Split row (25–75 %, start 35 %, read from `layout/get` at mount, written with `layout/set` when a drag or key ends) and a Tabs row sentence (the chosen tab is kept in the webview state, `viewState`, and restored when the panel reopens; Installed carries the count and, once the lite metadata is known, a vulnerability badge); interaction model §2:25 "(with count badges; the Installed tab also shows how many packages have known vulnerabilities once the metadata is known)"; CHANGELOG `[Unreleased]` `### Changed` headline bullets for the split default and memory, the tab memory and the badge.
15. Gates for (b) as in step 9 plus `npx vitest run --project frontend src/webview/shared/primitives/Tabs.test.tsx src/webview/main/MainShell.test.tsx`; paste the bundle sizes; commit, push, wait for green CI.
16. Visual gate (RUN.md §4) after each green run: `gh run download <id> -n ui-screenshots -D /tmp/nuiget-shots` and open with Read: `main-installed-single`, `main-installed-single-light`, `main-installed-single-hc`, `main-updates`, `main-installed-all`, `main-browse-results` (the box has text, so Clear must be visible and the native `×` gone), `main-quicksearch-open`; after (a) also `sidebar-sections` and `sidebar-narrow-200px` (the shared box with its two buttons at 200 px must keep a usable input). After (b) confirm the list pane is about 35 % in every `main-*` capture. Record `viewed: <file>: <observation>` lines in `src/webview/main/STATUS.md`. A capture with the title wrapping onto a second line, the buttons overlapping the placeholder, or the sidebar input narrower than its placeholder text is a red gate: fix forward, do not raise a ceiling or weaken a test.
17. Handoff: rewrite `src/webview/main/STATUS.md` (§2.5 template, this ruling verbatim under Advisor decisions, both SHAs, every gate pasted); add a dated P9.7 section to `src/webview/shared/STATUS.md` (SearchBox, Tabs, `viewState.ts`, `IconButton.onMouseDown`) and to `src/test/harness/STATUS.md` (the new scenario); set the tracker row P9.7 to `done` with both SHAs; `docs/plans/parity-audit-2026-10-16.md` is P9.13's, leave it. P9.10's SB6 is closed by (a): say so in the tracker note so P9.10 only views the sidebar captures for it.

DO NOT:
- Do not keep the split default at 50 or widen the range to 20–80: the row says 35 and nothing about the range.
- Do not change the panel title in `src/host/MainPanelHost.ts:66` or anything in `package.json` `contributes`: "Title" is the heading in the webview.
- Do not persist the split in the webview state or the tab through `layout/*`: ADR-001:28-29 assigns each to one place.
- Do not send `layout/set` from `Sash.onChange`; only from `onChangeEnd`.
- Do not count the badge from `InstalledPackage.vulnerabilities`, and do not show `0` or any number while the metadata map is empty.
- Do not retry the health marker through `useSources().refresh()` or `refresh/all`; only `sources/refresh` resets the health tracker.
- Do not make the Clear and Filters buttons focusable, and do not put them inside the `role="combobox"` input's label; `tabIndex={-1}` with `onMouseDown` preventDefault.
- Do not add a `forcedOpen` state to `SearchBox` for the Filters button; `change('@')` is the documented trigger (§2).
- Do not add an `aria-busy` prop to `IconButton` or a severity colour to `Badge`; use `disabled` + `LoadingIcon` and the `error` tone.
- Do not import `ViewStateStore` from `src/webview/sidebar` into `src/webview/main`.
- Do not write `style={{ … }}`; only `cssVars` (ADR-006), and no colour literal outside `tokens.css`.
- Do not edit anything under `## [2.0.0]` in CHANGELOG.md; `[Unreleased]` only, headline-only bullets.
- Do not add a second `@typescript-eslint/no-restricted-imports` block.
- Do not rewrite any test other than the two named lines (`MainShell.test.tsx:204`, `main-shell.ui.test.ts:44-45`) and the extension of `MainShell.test.tsx:79`; a red test you did not write is a stop-and-ask.
- Do not `gh run rerun` a red UI job for a screenshot that looks wrong; that is a code failure.

CONTRACT CHANGE: none. Everything used exists in the frozen contracts: `layout/get` and `layout/set` (`src/protocol/messages.ts:115-116`, `LayoutPreferences.splitPosition` at `domain.ts:333-335`, host `handlers.ts:241-255`), `session/set` with `SessionIntent.restoreEnabled` (`domain.ts:214`), `sources/list` and `sources/refresh` carrying `failed` (`messages.ts:146-147`), the `sources/health` event (`messages.ts:195`), `PackageMetadataLite.vulnerabilities` (`domain.ts:129`). No sentinel, no `docs/protocol.md` regeneration, no `package.json` change. Files the item may touch beyond its row: `src/webview/main/{MainShell.tsx,MainShell.test.tsx,main.css,index.tsx,STATUS.md}`, `src/webview/main/features/sources/{SourcesControl.tsx,SourcesControl.test.tsx}`, `src/webview/shared/search/{SearchBox.tsx,SearchBox.test.tsx,search.css}`, `src/webview/shared/primitives/{Tabs.tsx,Tabs.test.tsx,IconButton.tsx}`, new `src/webview/shared/viewState.ts`, `src/webview/sidebar/SidebarView.tsx` (the type import and re-export only), `src/webview/shared/STATUS.md`, `src/test/harness/{scenarios.test.ts,STATUS.md}`, `src/test/ui/v2/main-shell.ui.test.ts:44-45` (named rewrite), `docs/ux/interaction-model.md`, `README.md`, `ARCHITECTURE.md` (2.0 section), `CHANGELOG.md` `[Unreleased]`, `docs/plans/STATUS.md`. Named test rewrites: `src/webview/main/MainShell.test.tsx:204` (`50%` → `35%`); `src/test/ui/v2/main-shell.ui.test.ts:44-45` (`'50%'` → `'35%'`, `0.5` → `0.35`); extension of `MainShell.test.tsx:79` (both checkboxes). No test is deleted, skipped or weakened.

VERIFY:
- `grep -n "initial: 35" src/webview/main/MainShell.tsx` → one line; `grep -n "'layout/get'\|'layout/set'" src/webview/main/MainShell.tsx` → one of each; `grep -n "onChangeEnd" src/webview/main/MainShell.tsx` → one line.
- `grep -n "Manage NuGet packages" src/webview/main/MainShell.tsx` → one `<h1`; `grep -c "restoreEnabled" src/webview/main/MainShell.tsx` → ≥ 2.
- `grep -n "sources/refresh" src/webview/main/features/sources/SourcesControl.tsx` → one line; `grep -n "source-health-indicator" docs/ux/interaction-model.md src/webview/main/features/sources/SourcesControl.tsx` → one hit each.
- `grep -n "tabIndex={-1}" src/webview/shared/search/SearchBox.tsx` → two lines; `grep -n "webkit-search-cancel-button" src/webview/shared/search/search.css` → one line.
- `grep -rn "from '../sidebar\|from '../../sidebar" src/webview/main` → no output.
- `npx vitest run --project frontend src/webview/main/MainShell.test.tsx -t "split position persists"` → 1 passed; `npx vitest run src/test/harness/scenarios.test.ts -t "restore toggle in header syncs with sidebar"` → 1 passed; `npx vitest run --project frontend src/webview/shared/primitives/Tabs.test.tsx src/webview/shared/search/SearchBox.test.tsx src/webview/main/features/sources/SourcesControl.test.tsx` → green.
- `npx tsc --noEmit` → 0; `npm run check-types` → 0; `npx eslint src` → 0; `npm test` → exit 0 with no unhandled rejection; `npm run bench` → 0; `npm run docs:check` → 0; `npm run check:vsix` → 0 after a build.
- `node esbuild.mjs --production --analyze` → three bundles under their ceilings (293359 / 540338 / 325425 before; expect webview and sidebar up by low single-digit KB at most).
- `gh run view <id>` for each commit → all jobs green, UI job with the 14 named states; the PNGs of step 16 viewed and recorded in `src/webview/main/STATUS.md`; `grep -c "viewed:" src/webview/main/STATUS.md` → ≥ 9.
- `git status --porcelain --untracked-files=all` → clean after each commit; `git log --oneline -3` shows the two P9.7 commits on `labs/2.0`.

Files checked: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; `/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` (§0–§4, :325-354); `/Users/mattias/github/nuiget/docs/plans/parity-audit-2026-10-16.md` (:655-850, :1410-1445); `/Users/mattias/github/nuiget/docs/plans/STATUS.md` (:122-135); `/Users/mattias/github/nuiget/docs/plans/RUN.md` (:78-92); `/Users/mattias/github/nuiget/docs/ux/interaction-model.md` (§1–§8); `/Users/mattias/github/nuiget/docs/ux/reference-1.18.9/installed-filter-count.jpg` (viewed); `/Users/mattias/github/nuiget/docs/adr/001-*.md` (:20-40), `006-*.md` (head), `008-*.md` (:1-40); `/Users/mattias/github/nuiget/README.md` (:40-65); `/Users/mattias/github/nuiget/ARCHITECTURE.md` (:525-600); `/Users/mattias/github/nuiget/CHANGELOG.md` (headings, :8-60); `/Users/mattias/github/nuiget/src/webview/main/MainShell.tsx` (whole), `MainShell.test.tsx` (titles, :204), `main.css` (:1-80), `index.tsx`, `STATUS.md` (:1-40, :141, :195-197); `/Users/mattias/github/nuiget/src/webview/main/features/sources/SourcesControl.tsx`, `SourcesControl.test.tsx` (titles), `SourceSettingsDialog.tsx` (:189, :213); `/Users/mattias/github/nuiget/src/webview/main/features/installed/InstalledProjectSection.tsx` (:36-56); `/Users/mattias/github/nuiget/src/webview/main/features/updates/UpdatesTab.tsx` (:229-232); `/Users/mattias/github/nuiget/src/webview/main/features/details/{DetailsPane,TransitiveDetails,DetailsInfo}.tsx` (heading levels); `/Users/mattias/github/nuiget/src/webview/shared/search/SearchBox.tsx`, `search.css`, `SearchBox.test.tsx` (titles); `/Users/mattias/github/nuiget/src/webview/shared/primitives/{Tabs,Tabs.test,Badge,IconButton,ProgressBar,Spinner,Sash,Dialog,index}.tsx|ts`, `icons.tsx` (export list), `primitives.css` (:586-603); `/Users/mattias/github/nuiget/src/webview/shared/store/{sources,installed,updates,allProjects,session,useResource}.tsx|ts`; `/Users/mattias/github/nuiget/src/webview/shared/tokens.css` (:51-68, :138-139); `/Users/mattias/github/nuiget/src/webview/shared/bus/MessageBus.ts` (no `getState`/`setState` use); `/Users/mattias/github/nuiget/src/webview/sidebar/index.tsx`, `SidebarView.tsx` (:1-60, :147-164), `sidebar.css` (:30-46), `SidebarView.test.tsx` (:405-414); `/Users/mattias/github/nuiget/src/host/handlers.ts` (:193, :230-260, :318-345), `MainPanelHost.ts` (:20-80, :96), `SidebarHost.ts` (:28-50, :100-112), `handlers.test.ts` (:125-126), `legacyState.test.ts` (:60-74); `/Users/mattias/github/nuiget/src/extension.ts` (:230-250); `/Users/mattias/github/nuiget/src/protocol/messages.ts` (:115-116, :146-152, :195), `domain.ts` (:66, :129, :196, :209-214, :333-335); `/Users/mattias/github/nuiget/src/core/catalog/Catalog.ts` (:542-560), `feedClients.ts` (:145-150); `/Users/mattias/github/nuiget/src/core/feeds/serviceIndex.ts` (:189-193), `health.ts` (:40-70, :130-150); `/Users/mattias/github/nuiget/src/test/harness/harness.ts` (:19-60, :225-285), `scenarios.test.ts` (:1-20, :718-760), `FakeWebview.ts` (:82), `STATUS.md` (exists, 67 lines); `/Users/mattias/github/nuiget/src/test/__mocks__/vscode.ts` (:255-270); `/Users/mattias/github/nuiget/src/test/ui/v2/main-shell.ui.test.ts` (:20-60), `sidebar.ui.test.ts` (:47, :60-110, :153), `sidebarWebview.ts` (:16-36), screenshot call sites in all `*.ui.test.ts`; `/Users/mattias/github/nuiget/src/test/lint/{webview-css-baseline,webview-stylesheets,interaction-model-testids}.test.ts`; `/Users/mattias/github/nuiget/eslint.config.mjs` (:24-40); `/Users/mattias/github/nuiget/scripts/check-docs-drift.mjs` (:211-278); `/Users/mattias/github/nuiget/package.json` (:116-122, :167-171, :216-222); `git show 0457c75:src/webview/app/App.tsx` (:2400-2500) and `0457c75:src/webview/app/App.css` (:20-45); `git log --oneline -3`, `git status --short` (clean at 54603be).
`````

2026-10-17, P9.7 commit (b) follow-up (stop-and-ask: `index.test.tsx:36` and the sash test's `52%` went red with
DO 10). Answer of the `architecture-advisor` subagent, verbatim:

`````text
P9.7 follow-up ruling (commit (b), "a failing test you did not write"). Both claims verified: `src/webview/main/index.test.tsx:36` asserts the exact start set, `ARCHITECTURE.md:656` states the same set, `MainShell.test.tsx:239-245` reads 50%/52%/75%.

DECISION: Option 1. The ruling's DO 10 puts `layout/get` at mount, so `index.test.tsx:36` and `MainShell.test.tsx:243` (`52%`) are consequences of the named change, not an unnamed test going red on its own; rewrite them as named rewrites of P9.7 (b) and keep the ARCHITECTURE sentence true. Option 2 (deferring the request) adds an ordering rule to the shell for no benefit and still changes the set.

DO:
1. `src/webview/main/index.test.tsx:36`: `new Set(['session/get', 'projects/list', 'config/get', 'layout/get', 'perf/mark'])`; extend the comment at :35 with "layout/get reads the kept split once from MainShell (P9.7)". Add `expect(asked.filter(type => type === 'layout/get')).toHaveLength(1);` next to the `perf/mark` count at :37 so the StrictMode once-guard is asserted at the entry too.
2. `src/webview/main/MainShell.test.tsx` 'the sash resizes the list through one custom property': `50%` → `35%` (already named) and `52%` → `37%` at :243; `75%` at :245 stays (max unchanged).
3. `ARCHITECTURE.md:656`: "start requests are `session/get`, `projects/list`, `config/get`, `layout/get` (the kept split, P9.7) and one `perf/mark`".
4. List all three in the STATUS note under named rewrites with the reason (consequence of DO 10 / the 35 % default), and in the commit body.
5. Re-run `npx vitest run --project frontend src/webview` → 0 failed before committing (b).

DO NOT:
- Do not defer or conditionally send `layout/get` to keep the old set; the mount request is the ruled design.
- Do not widen the assertion to a superset check (`toContain`); keep the exact set so a future extra start request is seen.
- Do not touch any other test; a third red test is a new stop-and-ask.

CONTRACT CHANGE: none.

VERIFY: `grep -n "'layout/get'" src/webview/main/index.test.tsx` → two lines (set and count); `grep -n "37%" src/webview/main/MainShell.test.tsx` → one line; `grep -n "layout/get" ARCHITECTURE.md` → includes line 656; `npx vitest run --project frontend src/webview` → 0 failed.

Files checked: `/Users/mattias/github/nuiget/src/webview/main/index.test.tsx` (:18-42); `/Users/mattias/github/nuiget/src/webview/main/MainShell.test.tsx` (:236-247); `/Users/mattias/github/nuiget/ARCHITECTURE.md` (:654-658); `git log --oneline -2` (3bfc748 on top of 54603be).

The main P9.7 ruling delivered earlier stands unchanged.
`````

## Exact next step (one item ID)

P9.8.

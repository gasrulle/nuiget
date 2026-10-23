# UX inventory of nUIget 2.0 (main panel and sidebar)

Dimension: `ux-inventory`. Research sweep of 2026-10-22, repository `/Users/mattias/github/nuiget`, branch `main` at `e4d6e97`
(the merged 2.0 tree). Read-only: no file under the repository was changed. Every claim cites `path:line` (repository
relative), a fetched URL, a command, or a capture PNG under
`/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/captures/39025149785/20261017T103410/`
(called "the captures" below; named without `.png` where the context is clear).

Method: read every non-test file under `src/webview/**` and the UI files of `src/host/**` (`MainPanelHost.ts`,
`SidebarHost.ts`, `pickers.ts`, `feedback.ts`, `handlers.ts` UI part), `package.json` `contributes`, `src/extension.ts`
(status bar and commands), `docs/ux/interaction-model.md`, the UI test bodies around every `screenshot(...)` call, and all
15 captures. Strings were extracted with a TypeScript AST walk
(`scratchpad/ux-inventory/strings.cjs` → `scratchpad/ux-inventory/strings.tsv`, 893 candidate lines) and curated by hand.
`npx vitest run src/test/lint/interaction-model-testids.test.ts` → 3 of 3 passed (every §8 hook is rendered).

Conventions: "IM" is `docs/ux/interaction-model.md`; "main" the main panel; "SB" the sidebar. Line ranges are inclusive.

---

## 0. Summary of what matters

1. **The main panel has no actions menu at all.** No main-panel `Listbox` receives `onContextMenu`
   (grep: only `src/webview/sidebar/ProjectPackages.tsx:94`, `BrowseResults.tsx:151`, `ProjectUpdates.tsx:102`), yet IM §5
   (`interaction-model.md:82-83,96-98`) promises Shift+F10, the ContextMenu key and right-click on every list, and the main
   Installed list's screen-reader hint says "Shift+F10 opens the actions menu." (`InstalledProjectSection.tsx:40`).
   Right-click on a main row calls `preventDefault()` and opens nothing (`Listbox.tsx:218-223`). `package.json` contributes no
   `webview/context` menu, which is stable API since VS Code 1.72 (fetched
   https://code.visualstudio.com/updates/v1_72: heading "Contributed webview context menus" under "Extension authoring";
   it was a proposal in https://code.visualstudio.com/updates/v1_70), inside the 1.85 baseline.
2. **Enter on a main Updates row updates the package** (`UpdatesTab.tsx:185`, `AllProjectsUpdates.tsx:106`), where IM §5
   (`interaction-model.md:94-95`) says Enter in the main panel "selects it and shows its details". With no secondary action
   and no menu, a keyboard user cannot open an Updates row's details at all (details only on click: `UpdatesTab.tsx:181-184`
   via `Listbox.tsx:203-216`).
3. **Enter in the sidebar Installed list uninstalls at once**, without confirmation (`ProjectPackages.tsx:91`, hint `:85`);
   Browse and Updates Enter install and update the same way (`BrowseResults.tsx:149`, `ProjectUpdates.tsx:100`). IM
   documents it as the "primary action" (`interaction-model.md:95`).
4. **The sidebar never shows the active source's name**, contrary to IM §1 (`interaction-model.md:16-17`): the source is a
   static `$(remote)` title-bar icon (`package.json:94-95`); `SidebarHost.updateTitle` writes the project only
   (`SidebarHost.ts:298-310`). At 200 px the project title itself is reduced to "N" (capture `sidebar-narrow-200px`).
5. **No keybindings and no command category**: `package.json` has no `keybindings` contribution and bakes "nUIget: " into
   every command title instead of `category` (`package.json:83-141`).
6. Coverage of the 15 captures: they show the happy path only. **No capture shows** loading, revalidating, any error,
   sources-unavailable, unsupported, unresolved, CPM, busy rows, stale details, any `@` filter, the bulk-uninstall /
   main Update-all / CPM / multi-install / sources dialogs, sidebar browse, sidebar All Projects, All Projects Updates,
   any QuickPick, the host modal, or the status-bar item (matrix in §1).

---

## 1. Screen × state matrix

State vocabulary from IM §4 (`interaction-model.md:61-76`). Each cell: what renders (component, file:line), its test id when
it has one, and the capture that shows it (or "not captured"). "n/a" = the state cannot occur on that screen.

### 1.1 What each capture actually shows (read from the UI tests and the PNGs)

| Capture | Taken in | State on screen |
|---|---|---|
| `main-installed-single` | `src/test/ui/v2/main-installed.ui.test.ts:49` | Single project, Installed ready, "DIRECT PACKAGES (2)", Transitive collapsed without count; Newtonsoft.Json current; details on the **README** tab although this test selects no tab, README images loaded. Probable cause (order not verified in ExTester itself): `npm run test:ui` passes the glob `out/test/ui/v2/*.ui.test.js` (`package.json:310`), which the shell expands alphabetically, so `main-details.ui.test.ts` (clicks README at `:47`) runs before `main-installed.ui.test.ts`, whose comment "This file runs first" (`:30`) would then be stale; the panel keeps its state (`retainContextWhenHidden`, `MainPanelHost.ts:31`). Header, search empty, tab counts 2/2, toolbar "Select all" / "Uninstall selected (0)". |
| `main-installed-single-light` / `-hc` | `src/test/ui/v2/theme.ui.test.ts:257-275` | Same tab under Light / High Contrast; Serilog clicked (current, hover stays) and Newtonsoft.Json holds keyboard focus after ArrowUp (`:268-271`), so **both rows show the trash action** (one by `:hover`, one by `:focus-within`, `primitives.css:344-348`). "TRANSITIVE PACKAGES (0)" with `net8.0` (prefetch done). Details tab of Serilog. Sidebar Installed + Updates visible on the left. |
| `main-installed-all` | `main-all-projects.ui.test.ts:97` | All Projects (2): headers "TestProject.csproj 2" and "Utility.csproj 1" + `provisional` badge (V3), rows, Transitive collapsed; details empty state; **no count on either tab** (see §3 D-17). |
| `main-transitive-expanded` | `main-transitive.ui.test.ts:95` | Transitive.csproj: "DIRECT PACKAGES (1)", "TRANSITIVE PACKAGES (1)" + `net8.0` expanded, one transitive row; toast "nUIget: Restored 1 project." (the test clicked the restore banner, `:85-87`). |
| `main-transitive-details` | `main-transitive.ui.test.ts:100` | Transitive details view: "Serilog [Transitive]", Version, Authors, "Required by". |
| `main-updates` | `main-updates.ui.test.ts:49` | Updates tab single project, 2 rows `old → new`, "Update all (2)" primary; details empty; toast. |
| `main-browse-results` | `main-search.ui.test.ts:78` | Browse results for "Newtonsoft.Json", `Installed` badge on one row, "9325.4M downloads", details empty, Clear button in the box; toast "nUIget: Uninstalled 1 package." |
| `main-browse-details` | `main-search.ui.test.ts:126` | Browse row current; details: Installed 13.0.2 + Uninstall, Version 13.0.4 + **Update** (enabled), Details tab with facts and 8 collapsed dependency groups. |
| `main-quicksearch-open` | `main-search.ui.test.ts:107` | Suggestion dropdown, one source (no group headers), `›` expanders; the list pane behind is blank. |
| `main-quicksearch-versions` | `main-search.ui.test.ts:112` | Versions level "‹ Serilog", five versions, first active. |
| `main-details-readme` | `main-details.ui.test.ts:56` | README tab with **images not yet loaded**: alt texts "Logo Json.NET", "NuGet version (Newtonsoft.Json)", "Build status" shown as broken images (the test waits only for text, `:48-55`). |
| `sidebar-sections` | `sidebar.ui.test.ts:48` | SB: title "NUIGET: TESTPR…", 6 title icons, search, "INSTALLED 2" (first row focused, trash visible), sash, "UPDATES 2" + Update all arrow; main panel Updates tab with a current row; three stacked toasts. |
| `sidebar-update-all-dialog` | `sidebar-parity.ui.test.ts:58` | SB `confirm-dialog` "Update 1 package?" with "Serilog: 3.1.1 → 4.4.0", Cancel / Update; scrim dims the view. |
| `sidebar-narrow-200px` | `sidebar.ui.test.ts:87` | SB at 200 px: title reduced to "N" + icons; Installed "Newtonsoft.J… 13.0.2" (name cut, version whole); Updates "Newtonsoft.J… 13.0…" (both cut). |

### 1.2 Main panel

| Screen \ state | Loading (first) | Revalidating | Provisional | Unresolved | Centrally managed | Pending op (busy) | Partial / failed op | Stale selection | Empty | Sources unreachable | Unsupported | Error |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Header + search** (`MainShell.tsx:233-280`) | project `<select>` reads "Loading projects…" (`:251`), disabled; source `<select>` disabled until the list is `ready` (`SourcesControl.tsx:42`). Not captured. | `ProgressBar "Refreshing"` under the box while the shown tab revalidates or Refresh runs (`MainShell.tsx:226-227,279`); Refresh icon becomes `LoadingIcon` and disabled (`:256`). Not captured. | n/a | n/a | n/a | n/a | n/a | n/a | "No projects" option (`:251`). Not captured. | source option "<name> (unreachable)" (`SourcesControl.tsx:49`) + warning button `source-health-indicator` (`:54-65`). Not captured. | n/a | `Banner error` "Projects could not be listed: …" (`MainShell.tsx:281`), no Retry. Not captured. |
| **Tab bar** `tab-bar` (`MainShell.tsx:285`) | no count badge while loading (`:177-185`). Not captured. | — | — | — | — | — | — | — | no badge for 0 (`:179,185`) | Updates badge withheld (`:179`) | Installed badge withheld for an unsupported project without packages (`:180-185`) | — |
| **Installed, single project** `installed-list` (`InstalledTab.tsx`, `InstalledProjectSection.tsx`) | `Skeleton` comfortable, 3 rows, `aria-hidden` (`InstalledProjectSection.tsx:93`, `Skeleton.tsx:14-19`); no announcement. Not captured. | rows stay, listbox `aria-busy` (`Listbox.tsx:193`), header spinner (`InstalledProjectSection.tsx:191`, `SectionHeader.tsx:52`). Not captured. | `Badge "provisional"` (info tone) on "Direct packages" header (`InstalledProjectSection.tsx:163,192`). Not captured (single). | version cell "unresolved" + tooltip (`rules.ts:27-29`), status "Unresolved", option `aria-disabled`, actions container removed (`Row.tsx:159`). Not captured. | `Badge "CPM"` title "Centrally managed" (`InstalledProjectSection.tsx:143`). Not captured. | spinner replaces actions, option `aria-busy`, status "Installing/Updating/Uninstalling/Restoring" (`rules.ts:10`, `Row.tsx:129,161`). Not captured. | toast (host, §2.4) + live region sentence (`MainShell.tsx:140-147`); row returns after invalidation. Toasts captured incidentally (`main-updates`, `main-browse-results`). | n/a (list) | `EmptyState` "No packages installed." / "No installed package matches "x"." / "No vulnerable packages." / "Vulnerability data is not available for this project yet." (`InstalledProjectSection.tsx:52-58`). Not captured. | n/a | `Banner warning` "Unsupported project: <reason>" + header `Badge "Unsupported"` (`:100,162`); list kept only for `sdk-too-old` (`:97`). Not captured. | `Banner error` "Installed packages of <P> could not be loaded: …" + Retry (`:92,101`). Not captured. |
| **Installed, All Projects** `installed-list-<name>` | `Skeleton` while `all.status==='loading'` and no sections (`InstalledTab.tsx:183-184`); per project Skeleton (`InstalledProjectSection.tsx:93`). Not captured. | listbox `aria-busy`, header spinner (`:179`). Not captured. | `Badge "provisional"` on the project header (`:163,180`). **Captured** `main-installed-all` (Utility.csproj). | as single. Not captured. | as single. Not captured. | as single. Not captured. | as single. | n/a | "No projects to list." (`InstalledTab.tsx:185`). Not captured. | n/a | banner + `Unsupported` badge per project. Not captured. | per-project error banner + Retry (`InstalledProjectSection.tsx:92`). Not captured. |
| **Transitive, single** `transitive-section`, `transitive-list[-<tfm>]` (`TransitiveSection.tsx`) | `Skeleton` when expanded without a result (`:81`); header spinner (`:109`). Not captured. | listbox `aria-busy` (`:68`). Not captured. | n/a | n/a | n/a | n/a | n/a | n/a | "No transitive dependencies." (`:91`). Not captured. | n/a | n/a | not restored: `Banner warning` "The project has not been restored, so its transitive packages are not known." + **Restore** `transitive-restore-banner` (`:83-87`); `errorKind`: "The assets file of the project could not be read/opened" + Retry (`:14-18,89`); request error banner + Retry (`:80`). Restore banner passed through but not captured (the capture is after Restore). |
| **Transitive, All Projects** (`AllProjectsTransitiveSection.tsx`) | `Skeleton` (`:109`). Not captured. | listbox `aria-busy` while loading (`:131`). Not captured. | n/a | n/a | n/a | n/a | n/a | n/a | "No transitive dependencies." (`:135`). Not captured. | n/a | n/a | "Not restored, so their transitive packages are not known: A, B." + Restore (`:115-119`); "The assets files of N projects could not be read." + Retry (`:120-124`); error banner (`:111`). Collapsed header captured in `main-installed-all`. |
| **Updates, single** `updates-list` (`UpdatesTab.tsx:38-252`) | `Skeleton` while loading with no rows (`:161-162`). Not captured. | rows stay; listbox `aria-busy` also while loading with rows (`:177`); bar under search (`MainShell.tsx:226`). Not captured. | n/a | `whyNotUpdatable` sentence announced on Enter (`:109-112`); row not disabled here. Not captured. | `Badge "CPM"`, title distinguishes override (`:206`); `central` row goes through `cpm-preview-dialog` (`:115-118`) and is excluded from bulk (`:90`). Not captured. | spinner + status (`:203-204`). Not captured. | toast + live region. | n/a | "No updates available." / "No update matches "x"." / "No packages installed." / "Updates could not be checked: no package source answered." (`:165-169`). Not captured. | `Banner warning` `updates-unavailable-banner` "Some package sources could not be checked; the list may be incomplete." + Retry (`:228-230`). Not captured. | read-only: no row action (`:208`), toggle announces (`:126-128`), candidates empty (`:90`). Not captured. | `Banner error` "Updates could not be checked: …" + Retry (`:231-233`). Not captured. |
| **Updates, All Projects** `updates-list-<name>` (`AllProjectsUpdates.tsx`) | `Skeleton` (`:276`, per section `:82`). Not captured. | listbox `aria-busy` (`:101`). Not captured. | n/a | as single (`:218-222`). | as single (`:126,223-226`). | as single. | as single. | n/a | "No updates available." / "No update matches the filter." / "Updates could not be checked." (`:86-91`); "No projects to list." (`:276`); a section with no chunk and not loading: "Updates could not be checked." **without Retry** (`:82`). Not captured. | one banner over all sections "…; the lists may be incomplete." (`:316-318`). Not captured. | banner + `Unsupported` badge in header (`:94,150`). Not captured. | per-section banner + Retry (`:84`), overall banner (`:319-321`). Not captured. |
| **Browse** `browse-list` (`BrowseList.tsx`) | idle (typed, not submitted): `EmptyState` "Press Enter to search for "x"." (`:89-91`); loading: `Skeleton` (`:92-94`). Not captured (in `main-quicksearch-open` the popup covers the pane). | `ProgressBar "Searching again"` **above the list**, not under the box (`:100`); listbox `aria-busy` (`:111`). Not captured. | n/a | n/a | n/a | spinner on a row being installed (`:140`). Not captured. | toast + live region. | n/a (a browse selection is never stale, `details.tsx:190`) | "No results for "x"." / "No package source could be searched for "x"." (`:123`). Not captured. | `browse-unavailable-banner` "Some package sources could not be searched; the results may be incomplete." + Retry (`:101-103`). Not captured. | n/a | full-screen error banner "The search failed: …" + Retry (`:95-97`); inline variant (`:104`). Not captured. Results captured: `main-browse-results`. |
| **Quick-search popup** `search-suggestions` (`SearchBox.tsx`) | note row "Searching…" (`:112-113`). Not captured. | previous suggestions stay while a new ask runs (`search.tsx:185-188`), listbox `aria-busy` (`SearchBox.tsx:344`). Not captured. | n/a | n/a | n/a | n/a | n/a | n/a | no row ("nothing found" closes the popup: `options` empty → `open` false, `:110-114,130`). | n/a | n/a | versions level: "<message>. Press → to retry." (`:121-122`); "No versions available" (`:123-124`); "Loading versions…" (`:119-120`). Not captured. Open + versions captured: `main-quicksearch-open`, `main-quicksearch-versions`. |
| **Details pane** `package-details-panel` (`DetailsPane.tsx`, `DetailsInfo.tsx`) | no selection: "Select a package to see its details." (`MainShell.tsx:301`, `DetailsPane.tsx:88`) — captured in `main-installed-all`, `main-updates`, `main-browse-results`, `main-transitive-expanded`; metadata loading: `Skeleton` (`DetailsInfo.tsx:121-123`); versions loading: option "<v> (loading versions…)" and select disabled (`DetailsPane.tsx:187,190`). Not captured. | — | n/a | primary disabled, title + note "Its reference could not be resolved." (`:120-121,216`). Not captured. | note "Its version is set centrally in Directory.Packages.props: …" (`:217-219`); Update opens `cpm-preview-dialog` (`:138-139`). Not captured. | buttons disabled, primary reads "Working…" (`:173,197,201`). Not captured. | live region "Update of X failed: …" (`:126`) + toast. | `Banner info` "Showing <id> of <P> until the packages of the selected project are listed." + primary disabled "Checking the selected project" (`:117,162`). Not captured. | no versions: "Versions of a local source cannot be listed." / "No versions were found on the package sources." (`:220-226`); no metadata: "No details: a package source could not be reached." / "No package source has details for this version." (`DetailsInfo.tsx:135-137`). Not captured. | `Banner warning` "Offline: … These details come from the package cache on this machine." (`DetailsInfo.tsx:144-150`). Not captured. | primary disabled "Select a single project to install or change this package" when the target is not the committed project (`DetailsPane.tsx:117`). Not captured. | "Details could not be loaded: …" + Retry (`DetailsInfo.tsx:124-126`); "Versions could not be listed: …" + Retry (`DetailsPane.tsx:227`). Not captured. Ready: `main-browse-details`, `main-installed-single-light/-hc`. |
| **README tab** `readme-content` / `readme-empty` (`ReadmeView.tsx`) | `Skeleton` (`:60-62`). Not captured. Images pending show alt text (capture `main-details-readme`). | — | n/a | n/a | n/a | n/a | n/a | n/a | "No README available." `readme-empty` (`:66-68`). Not captured. | n/a | n/a | "The README could not be loaded: …" + Retry (`:63-65`). Not captured. Ready: `main-installed-single`, `main-details-readme`. |
| **Transitive details** `transitive-details` (`TransitiveDetails.tsx`) | n/a (reads slices) | — | n/a | n/a | n/a | n/a | n/a | n/a | "No longer listed as a transitive package." (`:64`); "No traceable top-level package" (`:70`). Not captured. | n/a | n/a | n/a. Ready: `main-transitive-details`. |
| **Whole view** | — | — | — | — | — | — | — | — | — | — | — | `ErrorBoundary` "Something went wrong in this view." + Reload, reports `ui/reportError` (`ErrorBoundary.tsx:38-41`, `main/index.tsx:24-33`). Not captured. |

### 1.3 Sidebar

| Screen \ state | Loading (first) | Revalidating | Provisional | Unresolved | Centrally managed | Pending op | Partial / failed op | Empty | Sources unreachable | Unsupported | Error |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Header** (`SidebarView.tsx:147-166`, view title `SidebarHost.ts:298-310`) | live region "Loading installed packages" (`SidebarView.tsx:135-140`) — the only first-load announcement on either surface. Not captured. | `ProgressBar "Refreshing installed packages"` only for **installed** revalidation (`:165`). Not captured. | n/a | n/a | n/a | n/a | live region `describeOutcome` (`:110-117`). | n/a | n/a | `Banner warning` `sidebar-unsupported` (`:169`). Not captured. | `Banner error` `sidebar-installed-error` + Retry (`:170-172`). Not captured. |
| **Installed, single** `sidebar-installed-list` (`InstalledSection.tsx`, `ProjectPackages.tsx`) | `Skeleton` compact (`InstalledSection.tsx:118`); header spinner (`:134`). Not captured. | listbox `aria-busy` (`:121`), header spinner. Not captured. | `sidebar-installed-provisional`: `Badge "provisional"` inside a span with `title` (`:135-137`). Not captured. | version "unresolved" + `UNRESOLVED_HINT` title, status "Unresolved", disabled (`ProjectPackages.tsx:106-111`). Not captured. | `Badge "CPM"` "Centrally managed" (`:112`). Not captured. | spinner + status (`:109-111`). Not captured. | toast + live region. | `sidebar-installed-empty`: "No packages installed." / "No packages to show." (unsupported) / "No installed packages match "x"." / "No .NET projects found in this workspace." (`ProjectPackages.tsx:75-78,95`, `InstalledSection.tsx:115`). Not captured. | n/a | read-only hint and no row action (`ProjectPackages.tsx:83-85,113-115`). Not captured. | error banner above (`SidebarView.tsx:170-172`); section content empty (`InstalledSection.tsx:117-118`). Not captured. Ready: `sidebar-sections`, `sidebar-narrow-200px`. |
| **Installed, All Projects** `sidebar-installed-list-<name>` | `Skeleton` (`InstalledSection.tsx:99`). Not captured. | listbox `aria-busy` (`:102`). | **no provisional marker** per project (ProjectSection `:57-67` has no `actions`) — see D-07. | as single | as single | as single | as single | as single | n/a | banner only, no header badge (`:48`). Not captured. | "The projects could not be listed: …" + Retry (`:97-98`); per project "Installed packages of <P> could not be loaded: …" + Retry (`:44`). Not captured. |
| **Updates, single** `sidebar-updates-list` (`UpdatesSection.tsx`, `ProjectUpdates.tsx`) | `Skeleton` (`UpdatesSection.tsx:170-171`); header spinner (`:130`). Not captured. | header spinner only, listbox `aria-busy` (`:194`); no bar. Not captured. | n/a | `whyNotUpdatable` announced on Enter (`ProjectUpdates.tsx:76-80`). Not captured. | `Badge "CPM"` with override title (`:118`); Enter opens the host actions menu (`:81-83`). Not captured. | spinner + status (`:116-117`). Not captured. | toast + live region. | `sidebar-updates-empty`: "No updates available." / "No updates match "x"." / "Updates could not be checked." (`UpdatesSection.tsx:26-31`). Not captured. | `sidebar-updates-unavailable` "Some package sources could not be checked." + Retry (`:180-182`). Not captured. | no row action (`ProjectUpdates.tsx:119`), no Update all (`UpdatesSection.tsx:231`). Not captured. | "Updates could not be checked: …" + Retry (`:183-185`). Not captured. Ready: `sidebar-sections`. |
| **Updates, All Projects** `sidebar-updates-list-<name>` | `Skeleton` (`:155`). Not captured. | header spinner (`:136`). | n/a | as single | as single | as single | as single | as single | one banner (`:151-153`). | as single | per project "Updates of <P> could not be checked: …" + Retry (`:72-73`). Not captured. |
| **Update all dialog** `confirm-dialog` (`UpdatesSection.tsx:238-257`) | n/a | n/a | n/a | n/a | central rows excluded (`:47`) | n/a | n/a | n/a | n/a | button hidden (`:231`) | n/a. **Captured** `sidebar-update-all-dialog`. |
| **Browse** `sidebar-browse-list` (`BrowseResults.tsx`) | idle "Press Enter to search." (`:122-124`); `Skeleton` (`:125-127`). Not captured. | "Searching again" bar above the list (`:133`). Not captured. | n/a | n/a | CPM install → actions menu (`:115-118`). Not captured. | spinner, status "Installing" (`:179-180`). Not captured. | toast + live region. | "No results for "x"." / "No package source could be searched for "x"." (`:158`). Not captured. | `sidebar-browse-unavailable` "Some package sources could not be searched." + Retry (`:134-136`). Not captured. | n/a | "The search failed: …" + Retry (`:128-130,137`). Not captured. |
| **Whole view** | — | — | — | — | — | — | — | view hidden by `when: nuiget.hasProjectFiles` (`package.json:76`, set at `src/extension.ts:189`); no `viewsWelcome` contributed. Not captured. | — | — | `ErrorBoundary` (`sidebar/index.tsx:33`). Not captured. |

### 1.4 Coverage count

Of the main-panel cells above that can occur, the captures show: Installed ready (single, All Projects, light, HC),
provisional (All Projects only), Transitive collapsed and expanded (single), Transitive details, Updates ready (single),
Browse results, Browse details, quick-search open and versions, README (loaded and images pending), details empty state.
Sidebar: sections ready, Update all dialog, narrow width. **Every loading, revalidating, error, unavailable, unsupported,
unresolved, CPM, busy and stale cell is "not captured"**, and so are every main dialog (bulk uninstall, Update all,
`cpm-preview-dialog`, `multi-install-dialog`, `source-settings-modal`, `add-source-panel`), every `@` filter mode, group
headers of a multi-source quick-search, All Projects Updates, All Projects transitive expanded, workspace-folder grouping,
sidebar Browse, sidebar All Projects, every host QuickPick, the host CPM modal, the progress notification and the status
bar item.

---

## 2. Action table

"Confirmation" = what stands between the gesture and the write. "Feedback" = everything the user is told. Every
operation's outcome is announced in the surface's live region (`MainShell.tsx:140-147`, `SidebarView.tsx:110-117`, text from
`src/webview/shared/store/outcomes.ts:27-53`), shown as a host toast (`src/host/feedback.ts:142-188`: information on
success, warning with "Show output" on partial / failed / rejected, nothing on cancelled, output channel revealed on
failed), and while queued or running in the status bar item `$(sync~spin) nUIget: operation running` / `… N running, M
queued` (`src/extension.ts:274-284`); a bulk operation also opens a progress notification "nUIget: Updating packages"
etc. with "i of N: <detail>" (`feedback.ts:29-34,107-140`). Below, "std feedback" means exactly that set.

### 2.1 Package operations

| Action | Surface / where | Pointer path | Keyboard path | Confirmation | Feedback |
|---|---|---|---|---|---|
| Install (single project) | main details pane | "Install" primary button `install-update-button` (`DetailsPane.tsx:193-202`) | Tab to the button, Enter/Space | none; CPM project with central entry → `cpm-preview-dialog` "Update central version" (`useInstallAction.ts:86-111`) | std; row busy from the click (`ops.tsx`) |
| Install from a Browse row | main Browse | none (no row button in the main panel; details button only) | Ctrl/Cmd+Enter on the row (`BrowseList.tsx:115-122`) | as above; refused with a live-region sentence when All Projects, no project, list not loaded, already installed, busy (`useInstallAction.ts:60-75`) | std |
| Quick install | main search box | none | ArrowDown to a suggestion, Ctrl/Cmd+Enter (newest version), or ArrowRight → version → Ctrl/Cmd+Enter (`SearchBox.tsx:210-215`, `useSearchTyping.ts:151-177`) | as Install | std; "No version of X was found." / "Versions of X could not be listed: …" (`useSearchTyping.ts:171-176`) |
| Install in projects… | main details, single project of a multi-project workspace, Browse selection not installed (`DetailsPane.tsx:111,203-214`) | "Install in projects…" `multi-install-button` → `multi-install-dialog` checkboxes → "Install in N projects" (`MultiInstallDialog.tsx:125-166`) | Tab / Space / Enter in the dialog | the dialog itself; CPM projects with a central entry or failed preview are not pickable (`:145-156`) | std (bulk: progress notification) |
| Install… (All Projects) | main details under All Projects | primary reads "Install…" (`DetailsPane.tsx:98,128-131,201`) → `multi-install-dialog` | Tab, Enter; Ctrl+Enter on a Browse row only makes it current and announces "Under All Projects, Install… in the details picks the projects." (`BrowseList.tsx:116-120`) | dialog | std |
| Install (sidebar Browse) | SB Browse | row `+` button `row-action-install` (`BrowseResults.tsx:182-184`) | Enter (`:149`); Shift+F10/ContextMenu → host actions menu (`:151-157`) | none; CPM with a central entry or a failed preview → actions menu → host modal (`:105-119`, `SidebarHost.ts:245-267`) | std |
| Install latest / Install version… (sidebar, All Projects) | SB Browse under All Projects | row `+` / Enter / right-click all open the actions QuickPick (`BrowseResults.tsx:83-86`) → version QuickPick (for "version…") → multi-select project QuickPick (`pickers.ts:64-80`) | same via keys | QuickPicks; targets with a central entry left out with an information message "Not installed in …" (`SidebarHost.ts:275-296`); single target → host modal | std |
| Update to latest | main Updates | row arrow `row-action-update` (`UpdatesTab.tsx:208-210`) | **Enter** (`:185`) | none; `central` row → `cpm-preview-dialog` (`:115-118`) | std |
| Update / Downgrade to chosen version | main details | version `<select>` `version-selector` + primary "Update"/"Downgrade" (`DetailsPane.tsx:181-202`) | Tab, Arrow keys in the select, Tab, Enter | none; central → `cpm-preview-dialog` (`:138-139`) | std |
| Update to latest (sidebar) | SB Updates | row arrow `row-action-update` (`ProjectUpdates.tsx:119-121`) | Enter (`:100`) | none; central → actions menu → host modal "Update the central version of X?" (`:81-83`, `SidebarHost.ts:261-266`) | std |
| Update to version… / Change version… | SB actions menu (Installed, Updates, Browse-installed) | right-click → QuickPick (`pickers.ts:99-129`) → version QuickPick (first 50, `SidebarHost.ts:156`) | Shift+F10 / ContextMenu | host modal for central (`SidebarHost.ts:222`) | std; "No package source could be reached for this package" warning (`:153`); "No versions found for X" (`pickers.ts:54`) |
| Uninstall (single) | main Installed | row trash `row-action-uninstall` (`InstalledProjectSection.tsx:149-151`) | Delete / Cmd+Backspace (`:114`, `Listbox.tsx:157-161`) | **none** | std |
| Uninstall (single) | main details | "Uninstall" `uninstall-button` (`DetailsPane.tsx:169-178`) | Tab, Enter | none | std |
| Uninstall (single) | SB Installed | row trash (`ProjectPackages.tsx:113-115`) | **Enter** or Delete / Cmd+Backspace (`:91-92`) | **none** | std |
| Uninstall (single) | SB actions menu (Installed, Updates, Browse) | right-click → "$(close) Uninstall" (`pickers.ts:106,109,117,123`) | Shift+F10 | none; All Projects: a project QuickPick first (`SidebarHost.ts:188`) | std |
| Bulk select | main Installed / Updates | click the check mark, Ctrl/Cmd+click (`Listbox.tsx:210-213`); "Select all" toggle `select-all-button` (`aria-pressed`, `InstalledTab.tsx:215-217`, `UpdatesTab.tsx:221-223`) | Space on the row (`Listbox.tsx:162-167`); Tab to toolbar, Enter | n/a | refused rows announce why (`InstalledTab.tsx:123-126`, `UpdatesTab.tsx:126-133`) |
| Uninstall selected | main Installed | "Uninstall selected (N)" `uninstall-selected-button` (`InstalledTab.tsx:218-220`) | toolbar (one tab stop, arrows, `Toolbar.tsx`) | `confirm-dialog` "Uninstall N packages?" lists "From <P>:" + ids, focus on Cancel (`BulkUninstallDialog.tsx:24-41`, `ConfirmDialog.tsx:26-43`) | std (bulk) |
| Update all / Update selected | main Updates | "Update all (N)" / "Update selected (N)" `update-all-button` (`UpdatesTab.tsx:224-226`, `AllProjectsUpdates.tsx:312-314`) | toolbar | `confirm-dialog` "Update N packages?" "id: old → new" ("In <P>:" groups under All Projects) (`UpdateAllDialog.tsx:17-38`); central rows excluded | std (bulk) |
| Update all | SB Updates header | arrow icon `sidebar-update-all-button` "Update all (N)" (`UpdatesSection.tsx:231-235`) | Tab to it, Enter | `confirm-dialog` in the sidebar (`:238-257`) | std (bulk). Captured `sidebar-update-all-dialog`. |
| Restore | main transitive banner (single / All Projects) | "Restore" in `transitive-restore-banner` (`TransitiveSection.tsx:84`, `AllProjectsTransitiveSection.tsx:116`) | Tab, Enter | none | std ("nUIget: Restored 1 project." captured in `main-transitive-expanded`) |
| CPM central change | main dialog / SB modal | `cpm-preview-confirm` "Update central version" (`CentralUpdateDialog.tsx:110`); host modal button "Update central version" (`SidebarHost.ts:264`) | dialog focus starts on Cancel (`CentralUpdateDialog.tsx:106,109`) | is itself the confirmation | std; outcome adds "; also restored N other projects" (`feedback.ts:58-59`) |

### 2.2 Navigation, selection, context

| Action | Surface | Pointer | Keyboard | Notes |
|---|---|---|---|---|
| Show details of a row | main Installed, Transitive, Browse | click (`onSelect`) | Enter (`onActivate`) (`InstalledProjectSection.tsx:112-113`, `TransitiveSection.tsx:70-71`, `BrowseList.tsx:113-114`) | arrows move the active row only (`Listbox.tsx:127-133`) |
| Show details of a row | **main Updates** | click (`UpdatesTab.tsx:181-184`) | **none** (Enter updates, `:185`) | see D-02 |
| View package details (open full view at the package) | SB rows | actions menu "$(eye) View package details" (`pickers.ts:126`) | Ctrl/Cmd+Enter (`ProjectPackages.tsx:93`, `ProjectUpdates.tsx:101`, `BrowseResults.tsx:150`) | opens the main panel in **Browse** with an exact search for the id (`useSearchTyping.ts:129-138`, `MainPanelHost.ts:48-50`) |
| Copy package ID | SB actions menu | "$(clippy) Copy package ID" (`pickers.ts:125`) | Shift+F10 | status bar `Copied "X" to clipboard` (`SidebarHost.ts:137`) |
| Switch tab | main | click tab (`Tabs.tsx:66`) | Left/Right/Home/End (selects on move, `Tabs.tsx:37-48`) | a filter of another tab is cleared (`MainShell.tsx:199-206`); tab kept in webview state (`:118-128`) |
| Switch details tab | main details | click | arrows | README asked on first show (`DetailsPane.tsx:151-156`) |
| Expand/collapse a section | both | header toggle `section-header-<name>` (`SectionHeader.tsx:39-53`) | Tab, Enter/Space | SB section state kept in webview state (`SidebarView.tsx:92-103`); main section state not kept |
| Resize list/details | main | drag `sash` (`MainShell.tsx:290-299`), double-click resets | Tab to sash, Left/Right (Shift ×10), Home/End, Enter resets to 35 % (`Sash.tsx` keys) | kept via `layout/set` (global state, `handlers.ts:250`) |
| Resize Installed/Updates | SB | drag sash (`SidebarView.tsx:182-193`) | Up/Down, Home/End, Enter → 50 % | kept in webview state |
| Choose project | main header | `project-selector` (`MainShell.tsx:243-254`) | Tab + select keys | "All Projects (N)" first when N > 1 |
| Choose project | SB | title icon `$(project)` → QuickPick "nUIget — Project" (`pickers.ts:10-37`) | — (no keybinding) | view title follows (`SidebarHost.ts:298-310`) |
| Choose source | main header | `source-selector` (`SourcesControl.tsx:37-52`) | Tab + select | "All sources" + enabled sources |
| Choose source | SB | title icon `$(remote)` → QuickPick "nUIget — Package Source" + "$(gear) Manage NuGet Sources…" (`pickers.ts:41-50`) | — | Manage opens the main panel's dialog (`SidebarHost.ts:92-93`) |
| Toggle prerelease / restore | main header checkboxes (`MainShell.tsx:235-242`); SB title icons (`package.json:204-226`) | click | Tab, Space | SB shows status-bar message "nUIget: Pre-release enabled/disabled" 2 s (`SidebarHost.ts:99-109`) |
| Refresh | main `refresh-button` (`MainShell.tsx:256`); SB title `$(refresh)` (`SidebarHost.ts:111-113`) | click | Tab, Enter (main) | main announces "Refreshed" / "Refresh failed" (`MainShell.tsx:215-224`) |
| Open the main panel | Command Palette "nUIget: Manage NuGet Packages"; explorer context on `*.csproj|fsproj|vbproj`; editor title `$(package)`; Solution Explorer project item; SB title `$(link-external)` "Open Full Manager" (`package.json:183-226`, `extension.ts:351-364`) | — | palette only (no keybinding contributed) | the explorer / editor-title entries also select that project on the Installed tab (`MainPanelHost.ts:36-39`); "Open Full Manager" does not navigate |
| Search / filter | both | type; Clear `×` and Filters (funnel) pointer-only (`SearchBox.tsx:333-336`) | `@` opens prefixes; ArrowUp/Down, Enter/Tab take; Escape: close list → clear box → blur (`SearchBox.tsx:174-245`) | main: `searchDebounceMode` decides typing behaviour; SB: 300 ms debounce, ≥ 2 chars (`SidebarView.tsx:123-133`) |
| Focus the search | SB | — | the view being shown sends `ui/focusSearch` (`SidebarHost.ts:58-62`) | the main panel listens (`MainShell.tsx:138`) but **no host sends it to the main panel** (grep: only `SidebarHost.ts:60`) |

### 2.3 Sources (main panel only)

| Action | Pointer | Keyboard | Confirmation | Feedback |
|---|---|---|---|---|
| Open NuGet sources | gear `source-settings` "NuGet sources" (`SourcesControl.tsx:53`); SB source QuickPick "Manage NuGet Sources…" | Tab, Enter | — | `source-settings-modal` dialog, close button "Close NuGet sources" (`SourceSettingsDialog.tsx:222-234`) |
| Enable / disable a source | checkbox in `source-row-<name>` (`:42`) | Tab, Space | none | live region "<name> enabled/disabled" (`:27-30`) |
| Remove a source | trash "Remove <name>" (`:55`) → inline "Remove <name> from <file>?" Remove / Cancel (`:48-53`) | Tab, Enter | in-row confirmation | live region "<name> removed" (`:35`) |
| Add a source | "Add source" footer button → `add-source-panel` form (config file select, URL, insecure checkbox for http, Name, "Credentials" disclosure: Username, Password, encrypt checkbox) → "Add source" / "Back" (`:125-178`) | form keys; focus to URL on open (`:85`) | — | inline error `role="alert"` (`:148`); live region "<name> added" (`:118`) |
| Retry unreachable sources | warning icon `source-health-indicator` "N sources unreachable. Retry" (`SourcesControl.tsx:54-65`) | Tab, Enter | — | the list follows `sources/health` |

### 2.4 Host notifications, modals and QuickPicks (complete list)

| Kind | Text | Where |
|---|---|---|
| Information toast | "nUIget: Installed <id> <version> in <P>", "nUIget: Updated <id> to <version> in <P>", "nUIget: Uninstalled <id> from <P>", "nUIget: Restored <P>" (+ "; also restored N other projects") | `feedback.ts:41-60,103-105` |
| Information toast (bulk) | "nUIget: Installed <id> in N projects.", "nUIget: Updated N packages.", "nUIget: Uninstalled N packages.", "nUIget: Restored N projects." | `feedback.ts:79-91,165` |
| Warning toast + "Show output" | "<done sentence>, but the restore failed: …", "Install of <id> in <P> failed: …", "Update of …", "Uninstall of <id> **in** <P> failed: …", "Restore of <P> failed: …", "… was not started: <message or 'the queue is full'>", bulk "Updated d of N packages; k failed; r restores failed.", "The operation was not started: …" | `feedback.ts:63-76,96-102,163-184` |
| Progress notification | title "nUIget: Installing packages" / "Updating packages" / "Uninstalling packages" / "Restoring projects"; message "i of N: <detail>" / "Restoring i of N: <detail>" | `feedback.ts:29-34,111-139` |
| Status bar item | "$(sync~spin) nUIget: operation running" / "$(sync~spin) nUIget: N running, M queued" | `extension.ts:274-284` |
| Status bar message (2 s) | "nUIget: Pre-release enabled/disabled", "nUIget: Restore after operations enabled/disabled", `Copied "<id>" to clipboard` | `SidebarHost.ts:102,108,137`, `handlers.ts:414` |
| Warning (no prefix) | "Select a specific project for this action.", "No package source could be reached for this package" | `SidebarHost.ts:120,153` |
| Information (no prefix) | "No .NET project files found in the workspace.", "No versions found for <id>", "Not installed in <P…>: <id> has a central entry there; install it from the project to see the preview" | `pickers.ts:12,54`, `SidebarHost.ts:293` |
| Information (prefixed) | "nUIget: NuGet HTTP cache cleared.", "nUIget: SDK version cache cleared." | `extension.ts:369,376` |
| Modal warning | "Update the central version of <id>?" detail "<from> → <to> in <props file> applies to: <projects>", button "Update central version" | `SidebarHost.ts:261-266` |
| QuickPick | "nUIget — Project" (placeholder "Select project"; "All Projects (N)" "Show packages from every project" + separator), "nUIget — Package Source" ("All Sources", sources, "$(gear) Manage NuGet Sources…"), "nUIget — <id> versions", "nUIget — Install <id>" (multi-select, "(installed x)", picked = not installed), "nUIget — <id>" single-project picker ("v<version>"), actions "nUIget — <id>" placeholder "<id> — actions" | `pickers.ts:10-129` |

### 2.5 Settings and other inputs that change the UI

| Input | Effect | Evidence |
|---|---|---|
| `nuiget.searchDebounceMode` (`quicksearch` default / `full` / `off`) | main typing: suggestions after 150 ms, or full search after 300 ms, or nothing; the sidebar always searches after 300 ms | `package.json:257-270`, `useSearchTyping.ts:76-98`, `search.tsx:181`, `SidebarView.tsx:123-133` |
| `nuiget.quickSearchResultsPerSource` (5, 1–10) | suggestions per source | `package.json:250-256`, `handlers.ts:309` |
| `nuiget.searchResultLimit` (20, 1–100) | browse results on both surfaces | `package.json:272-278`, `handlers.ts:303` |
| `nuiget.enablePerformanceLogging` | no UI; log level of `[perf]` marks | `package.json:279-283`, `handlers.ts:425-432` |
| `workbench.tree.indent` | SB All Projects indent only | `services.ts:97`, `SidebarView.tsx:146`, `sidebar.css:129,134` |
| platform (`isWindows`) | encrypted-password checkbox enabled only on Windows | `services.ts:98`, `SourceSettingsDialog.tsx:70,164-171` |
| Session (host `SessionStore`): project, source, prerelease, restore | header controls (main), title icons + view title (SB) | `MainShell.tsx:235-255`, `SidebarHost.ts:32-44,298-310` |
| Context keys | `nuiget.hasProjectFiles` gates the view; `nuiget.prereleaseEnabled`, `nuiget.restoreEnabled` swap title icons | `package.json:76,204-226`, `extension.ts:189`, `SidebarHost.ts:35-36,43-44` |
| Persisted layout | main split (global state via `layout/get|set`), main tab (webview state), SB split + expanded sections (webview state) | `MainShell.tsx:109-114,118-128,297`, `handlers.ts:245-257`, `SidebarView.tsx:30-44,92-103` |
| Theme kind, forced colours, reduced motion | token blocks | `tokens.css:153-231` |

---

## 3. Deviations: interaction model vs implementation

| ID | Model says (IM line) | Code does (path:line) | Severity |
|---|---|---|---|
| D-01 | §5: "Shift+F10 or the ContextMenu key opens the actions menu for the active row; right-click anywhere on the row opens the same menu" (`:96-98`); §5 table: Install/Update and Uninstall also from "context menu" (`:82-83`). | Only the three sidebar lists pass `onContextMenu` (`ProjectPackages.tsx:94`, `BrowseResults.tsx:151`, `ProjectUpdates.tsx:102`); no main list does (grep of `onContextMenu` over `src/webview`). Main right-click: `Listbox.tsx:218-223` prevents the default and calls an undefined handler, so nothing opens (and VS Code's own Cut/Copy/Paste menu is suppressed). The main Installed hint still says "Shift+F10 opens the actions menu." (`InstalledProjectSection.tsx:40`). `MainPanelHost` registers no `ui/contextMenu` (`MainPanelHost.ts:69-77`). | High |
| D-02 | §5: "Enter activates the row (main panel: selects it and shows its details …)" (`:94-95`); "every pointer action is reachable by keyboard" (`:91`). | Main Updates: Enter = update (`UpdatesTab.tsx:185`, `AllProjectsUpdates.tsx:106`; tested in `UpdatesTab.test.tsx:89-93`); details only by click (`UpdatesTab.tsx:181-184`). No keyboard path to the details of an Updates row. | High |
| D-03 | §5: "Delete (Cmd+Backspace on macOS) uninstalls where applicable" (`:96`). | `onDelete` only in `InstalledProjectSection.tsx:114` and `ProjectPackages.tsx:92`. Updates rows (both surfaces) have none, though the SB actions menu offers Uninstall on an updates row (`pickers.ts:123`). | Medium |
| D-04 | §1: "The active project name and source name are always visible: … sidebar view title (project) and title-bar icons (source/prerelease/restore state)" (`:16-17`). | SB source is the static icon `$(remote)` titled "nUIget: Select Package Source" (`package.json:94-95`); no `description`/badge is set (`SidebarHost.ts:298-310` sets `title` only). Project title truncates to "N" at 200 px (capture `sidebar-narrow-200px`, judge). | Medium |
| D-05 | §5 table: "Restore project(s) — Transitive banner, header" (`:87`). | No restore action in either header (`MainShell.tsx:233-257`; SB `view/title` `package.json:204-245`); the header has only the "Restore after operations" toggle. No restore command contributed. | Low |
| D-06 | §7: "the primary button reads Install / Update / Downgrade / Uninstall" (`:144-145`). | Primary reads Install / Update / Downgrade / "Install…" / "Working…" (`DetailsPane.tsx:37-44,201`); Uninstall is a separate secondary button on the Installed line (`:169-178`). With the installed version chosen it reads a disabled "Update" whose reason is a tooltip only; the note is suppressed for that reason (`:122-124,216`; captures `main-installed-single`, `-light`, `-hc`). | Low |
| D-07 | §4 Provisional: badge on "All Projects sections, the main panel's Direct packages header, sidebar Installed section" (`:67`). | SB All Projects project headers carry no provisional badge (`InstalledSection.tsx:57-67`); SB single shows it only when `!all.active` (`:135`). The SB badge's explanation is a `title` on a wrapper span, the main one a `Badge title` read by screen readers (`InstalledSection.tsx:136` vs `InstalledProjectSection.tsx:163`, `Badge.tsx:18-23`). | Low |
| D-08 | §4 Loading (first): "Skeleton rows (3) + `role="status"` text "Loading …"" (`:65`). | Skeleton is `aria-hidden` and defers to `LiveStatus` (`Skeleton.tsx:11-19`); the main panel never announces loading (no "Loading" announce in `src/webview/main`); SB announces only the installed list (`SidebarView.tsx:135-140`). | Low |
| D-09 | §4 Revalidating: "subtle progress bar under the search box; rows `aria-busy`" (`:66`). | `aria-busy` is on the listbox (`Listbox.tsx:193`); rows get it only for a pending operation (`Row.tsx:129`). Browse draws its bar above the list (`BrowseList.tsx:100`, `BrowseResults.tsx:133`); SB updates revalidation shows a header spinner, no bar (`SidebarView.tsx:165` covers installed only). | Low |
| D-10 | §4 Unresolved: "row actions disabled" (`:68`). | `Row.tsx:159-163` removes the actions container for `disabled` rows (nothing is shown disabled). | Low |
| D-11 | §4 Centrally managed: "a `central-override` row … (its badge says so)" (`:69`). | The badge text is always "CPM"; the override is only in the hidden title, and only on Updates rows (`UpdatesTab.tsx:206`, `AllProjectsUpdates.tsx:126`, `ProjectUpdates.tsx:118`); Installed rows say "Centrally managed" for both (`InstalledProjectSection.tsx:143`, `ProjectPackages.tsx:112`). | Low |
| D-12 | §4 Offline / sources unreachable: "Warning banner under the search box with "Retry"" (`:74`). | The banners sit inside the list area: under the toolbar (`UpdatesTab.tsx:228-230`, `AllProjectsUpdates.tsx:316-318`), above the results (`BrowseList.tsx:101-103`), inside the SB Updates section (`UpdatesSection.tsx:151-153,180-182`). | Low |
| D-13 | §4 Error: "Inline error text with "Retry"" (`:76`). | Exceptions without Retry: "Projects could not be listed: …" (`MainShell.tsx:281`); All Projects Updates section "Updates could not be checked." as an `EmptyState` (`AllProjectsUpdates.tsx:82`); multi-install "preview failed" / "could not be read" notes (`MultiInstallDialog.tsx:149,153`). | Low |
| D-14 | §4 Stale selection: "the details panel keeps its content but becomes read-only until the new installed data confirms … or clears it" (`:72`). | A change **to All Projects** clears the selection at once (`details.tsx:194-197`). | Low |
| D-15 | §2: "a Filters button that puts `@` in it" (`:37`). | Filters toggles: with a prefix already typed it empties the box, filter text included (`SearchBox.tsx:335`). | Low |
| D-16 | §2: SB browse Enter "opens the actions menu" for a package with a central entry (`:30`). | It also opens the menu when the preview **fails** (`BrowseResults.tsx:115-118`). | Info |
| D-17 | §2: Tabs "with count badges" (`:29`). | Under All Projects the Installed count needs `allProjects.status === 'ready'` and every chunk (`MainShell.tsx:182-185`); capture `main-installed-all` shows no tab count while the project headers show 2 and 1. By design ("no number while loading", `:180-181`), but the two counts disagree on screen. | Info |
| D-18 | §6: "The sidebar "Open full view" / "View package details" open the main panel and navigate" (`:130-132`). | "Open Full Manager" only reveals the panel (`extension.ts:362-364`); only View package details navigates, always into Browse with an exact search, also for installed and update rows (`useSearchTyping.ts:129-138`). | Info |
| D-19 | §1: compact rows: "a long version shortens with an ellipsis before the name does" (`:12`). | The name is capped at 70 % of the line (`primitives.css:303-308`): at 200 px the Installed row shows "Newtonsoft.J… 13.0.2", the name cut while the version is whole (capture `sidebar-narrow-200px`). | Low |
| D-20 | §5 keyboard map, listbox hints: "Each listbox describes its keys in a visually hidden sentence" (`:100-101`). | Present everywhere (`Listbox.tsx:191,247`) but the sentences disagree with the code (D-01) and with each other (§5.3), and always say "Ctrl+Enter (Cmd+Enter)" whatever the platform. | Low |
| — | Comment drift (not model drift) | `Dialog.tsx:31-32` says the page "is not dimmed, because no theme colour exists for a scrim"; `primitives.css:699-708` paints `--nuiget-color-scrim` (`tokens.css:89-90`), visible in `sidebar-update-all-dialog`. | Info |

Matches verified (no deviation): roving tab stop and Home/End (`Listbox.tsx:135-151`); focus to the row at the same index or
the empty container (`:66-80,106-120`); disabled rows ignore Enter, Ctrl+Enter, Delete (and Space) but keep the menu
(`:141-171`); `aria-multiselectable` / `aria-selected` bulk / `aria-current` details (`:194`, `Row.tsx:125-126`); Space and
Ctrl/Cmd+click and check-mark click toggle (`Listbox.tsx:162-167,210-213`); row actions `aria-hidden`, `tabIndex -1`,
focus kept on the option (`Row.tsx:104-108,160`); D16 Browse Ctrl+Enter and quick-search keys (`BrowseList.tsx:115-122`,
`SearchBox.tsx:193-215`); search Escape ladder (`SearchBox.tsx:229-242`); D17 feedback (`feedback.ts`); the §8 test-id table
(lint passes).

---

## 4. Information architecture

### 4.1 Main panel (editor tab "nUIget", icon `resources/tab-icon.png`, `MainPanelHost.ts:29,61`)

```
main[nuiget-app]                                                    MainShell.tsx:232
├─ header (flex, wraps; gap 8px; padding 8px 16px 4px)              main.css:22-29
│  ├─ h1 "Manage NuGet packages"  (takes free space)                MainShell.tsx:234, main.css:95-100
│  ├─ ☑ "Restore after operations"                                  :235-238
│  ├─ ☐ "Include prerelease"                                         :239-242
│  ├─ select[project-selector] "Project": All Projects (N) | names   :243-254
│  ├─ select[source-selector] "Package source": All sources | names  SourcesControl.tsx:37-52
│  ├─ ⚙ [source-settings] "NuGet sources"                           :53
│  ├─ ⚠ [source-health-indicator] "N source(s) unreachable. Retry"   :54-65 (only when a source failed)
│  └─ ⟳ [refresh-button] "Refresh"                                   MainShell.tsx:256
├─ div[role=search] (padding 4px 16px; bottom border)               main.css:108-113
│  ├─ combobox[search-input] placeholder "Search packages, or filter: @installed, @updates, @vulnerable"
│  │   └─ pointer helpers: × "Clear search" (when non-empty), funnel "Filters"
│  │   └─ popup listbox[search-suggestions]: Filters | Suggestions (per-source group headers when ≥2) | "‹ <id>" + versions
│  └─ ProgressBar "Refreshing" (overlay on bottom edge)
├─ Banner error "Projects could not be listed: …"                     MainShell.tsx:281
├─ split  (list 35 % default, 25–75 %)                               :62, :282-303
│  ├─ list pane (side-bar colour)                                    main.css:151-158
│  │  ├─ [browse mode] BrowseList: bar, banners, listbox[browse-list] comfortable cards
│  │  └─ [default / @filter] tablist[tab-bar] "Package lists"
│  │      ├─ tab[installed-tab] "Installed" (+count, +vulnerable count badge, error tone)
│  │      ├─ tab[updates-tab] "Updates" (+count)
│  │      └─ tabpanel
│  │          ├─ Installed: toolbar "Bulk actions" [Select all] ……… [Uninstall selected (N)]
│  │          │   └─ one scroller: (single) ⌄ DIRECT PACKAGES (N) [provisional][Unsupported] → listbox[installed-list]
│  │          │                    (All Projects) [FOLDER caption when ≥2 folders] ⌄ <Project.csproj> (n) [Unsupported][provisional] → listbox[installed-list-<name>]
│  │          │                    › TRANSITIVE PACKAGES (N) [tfm] → listbox[transitive-list] | per-TFM ⌄ Transitive packages (n) [tfm]
│  │          └─ Updates: toolbar [Select all] ……… [Update all (N) | Update selected (N)]
│  │              └─ banners; (single) listbox[updates-list] | (All Projects) per project ⌄ <Project> (n) → listbox[updates-list-<name>]
│  ├─ sash[sash] "Resize the package list"
│  └─ section[package-details-panel] "Package details"
│      ├─ EmptyState "Select a package to see its details."
│      ├─ DetailsPane
│      │  ├─ header (stays in view): h2 <id>; [info banner stale]
│      │  │   grid: "Installed:" <version> [Uninstall]
│      │  │         "Version:" select[version-selector] [Install|Update|Downgrade|Install…|Working…] [Install in projects…]
│      │  │   notes (why disabled; CPM note; no versions); versions error banner
│      │  └─ tablist "Details sections": Details | README
│      │      ├─ Details: [offline banner] description; dl Version, Author(s), License, Downloads, Package size,
│      │      │           Date published, Project URL, Report abuse; Vulnerabilities; Dependencies (› <tfm> (n) …)
│      │      └─ README: rendered Markdown with per-code-block copy buttons
│      └─ TransitiveDetails: h2 <id> [Transitive]; Version:; Authors:; Required by (per TFM / per project)
├─ layers (portal to body): cpm-preview-dialog, confirm-dialog (bulk uninstall / Update all),
│                             multi-install-dialog, source-settings-modal (→ add-source-panel)
└─ LiveStatus[status-live]
```

Order of row content (comfortable card, `Row.tsx:110-164`): [check mark, multi-select lists only] [32 px icon] then line 1
name (600 weight) + badges; line 2 version (`old → new` with the new one coloured) + meta (Browse: downloads) + authors when a
description exists + status; line 3 description (Browse) or authors with the Verified mark. Actions container after the
option, hover / focus-within only. Badges in Installed rows, in order: SDK, props, CPM, floating | range, Vulnerable
(`InstalledProjectSection.tsx:140-148`); Updates: CPM; Browse: Installed; Transitive: "N projects" (All Projects), Vulnerable.

### 4.2 Sidebar (Activity Bar container "nUIget", icon `resources/sidebar-icon.svg`, view `nuiget.sidebarView`, `package.json:61-78`)

```
view title = <project name> | "All Projects (N)" (rendered by VS Code as "NUIGET: <TITLE>")   SidebarHost.ts:298-310
title-bar actions (view/title, navigation@0..5)                                             package.json:204-245
  @0 Restore toggle   $(verified-filled) "nUIget: Skip restore after operations" (on) | $(verified) "nUIget: Restore after operations" (off)
  @1 Prerelease       $(beaker) "nUIget: Include Pre-release" (off) | beaker-filled.svg "nUIget: Exclude Pre-release" (on)
  @2 $(project)       "nUIget: Select Project"        → QuickPick
  @3 $(remote)        "nUIget: Select Package Source" → QuickPick
  @4 $(refresh)       "nUIget: Refresh Sidebar"
  @5 $(link-external) "nUIget: Open Full Manager"
main[nuiget-sidebar]                                                                        SidebarView.tsx:146
├─ header[role=search] (padding 4px 8px): combobox[sidebar-search-input]
│     placeholder "Search, or filter: @installed, @updates" (+ × Clear, funnel Filters); no suggestions
│  └─ ProgressBar "Refreshing installed packages"
├─ [browse] BrowseResults: bar "Searching again", banners, listbox[sidebar-browse-list] compact rows (+ install action)
└─ [default / @installed / @updates]
   ├─ Banner sidebar-unsupported; Banner sidebar-installed-error
   ├─ section Installed (side-bar section header colours)       sidebar.css:101-115
   │   header ⌄ INSTALLED (n) [provisional]                        section-header-installed
   │   └─ listbox[sidebar-installed-list] | All Projects: FOLDER caption, ⌄ <Project> (n) → sidebar-installed-list-<name>
   ├─ sash (horizontal) "Resize the Installed and Updates sections" (20–80 %, default 50)
   └─ section Updates
       header ⌄ UPDATES (n) [↑ Update all (N)]                     section-header-updates, sidebar-update-all-button
       └─ banners; listbox[sidebar-updates-list] | per project → sidebar-updates-list-<name>
├─ confirm-dialog (Update all), portal
└─ LiveStatus[status-live]
Host chrome: QuickPicks (project, source, actions, version, projects-for-install, single project), modal (CPM), toasts.
```

Compact row (`primitives.css:291-334`): name (max 70 %), version (shrinks with ellipsis), badges pushed to the end;
authors, meta, description and status visually hidden but read. Rows indented to the section title
(`sidebar.css:117-120`), All Projects rows further by `workbench.tree.indent` (`:133-135`).

### 4.3 Controls per container (text and sizes, for sizing work)

Common primitives: every control has `min-height: 24px` (`--nuiget-target-min`, `tokens.css:40`): `.nuiget-button`
(padding 0 12px, radius 2px, `primitives.css:507-516`), `.nuiget-icon-button` (min 24×24, `:367-380`), selects
(`main.css:31-41`, max-width 20em, padding 0 6px), inputs (`main.css:121-131`, `:662-671`), tabs (`primitives.css:799-813`,
padding 0 8px, 2 px bottom indicator, gap 2px between tabs), section toggles (`:467-482`, uppercase, font 0.85em, 600).
Font sizes: sm 0.85em, md 1em, lg 1.15em (`tokens.css:60-62`).

| Container | Controls in order (visible text / accessible name) | Layout facts |
|---|---|---|
| Main header | "Manage NuGet packages" (h1, 1em 600); ☑ "Restore after operations"; ☐ "Include prerelease"; select "Project" (e.g. "TestProject.csproj", "All Projects (2)"); select "Package source" ("All sources"); gear "NuGet sources"; [warning "1 source unreachable. Retry"]; refresh "Refresh" | flex-wrap, gap 8px, padding 8/16/4 (`main.css:22-29`); title `margin-inline-end:auto` pushes the rest right |
| Main search row | input (placeholder 59 characters), × "Clear search", funnel "Filters" | padding 4px 16px, bottom border (`main.css:108-113`) |
| Main tab bar | "Installed" [2] [vulnerable n], "Updates" [2] | start inset `calc(16px - 8px - 1px)` (`main.css:164-166`); V1 "squeezed" |
| Installed toolbar | "Select all" (secondary); "Uninstall selected (0)" (secondary-coloured primary class, pushed to end) | padding 4px 16px, end 6px (`main.css:190-195`); gap 4px (`primitives.css:834-839`); V1, V2 |
| Updates toolbar | "Select all"; "Update all (N)" / "Update selected (N)" (primary) | same |
| Section headers (main) | chevron + "DIRECT PACKAGES (2)" / "TRANSITIVE PACKAGES (1)" + tfm badge / project name normal case + count badge + provisional / Unsupported badges | min-height 24px (`primitives.css:451-455`), start inset 16px (`main.css:168-170`); grouped headers normal case 1em (`main.css:702-708`); V3, V4 |
| Row actions (main) | trash "Uninstall <id>" (Installed); arrow "Update <id> to <v>" (Updates); none in Browse / Transitive | hover / focus-within only (`primitives.css:337-348`) |
| Details header | h2 <id> (1.15em); "Installed:" <v> [Uninstall]; "Version:" [select] [Update / Install / Downgrade / Install… / Working…] [Install in projects…] | grid `max-content minmax(0,max-content) max-content max-content`, gap 6/8 (`main.css:287-292`); padding 8px 16px (`:268-274`) |
| Details tabs | "Details", "README" | `Tabs` primitive |
| Details facts | "Version", "Author(s)", "License", "Downloads", "Package size", "Date published", "Project URL", "Report abuse" → "Report this package"; "Vulnerabilities" ("<sev> severity", "Advisory"); "Dependencies" (› "<tfm> (n)", "Any framework (n)") | dt min-width 7em (`main.css:337-340`) |
| README | per code block: copy button aria "Copy <Language> code", label → "Copied" for 2 s (`markdown.ts:150,167`) | |
| Sources dialog | title "NuGet sources"; description; close "Close NuGet sources"; rows: checkbox + name / URL / config file + trash "Remove <name>" → "Remove <name> from <file>?" [Remove] [Cancel]; footer [Add source] | dialog width min(32em, 100 %) (`primitives.css:710-723`) |
| Add source form | title "Add a NuGet source"; "Add to config file" select; "URL" (placeholder `https://api.nuget.org/v3/index.json`); http → ☐ "Allow an insecure (HTTP) connection to this source"; "Name (optional)" ("Made from the URL when empty"); [Credentials] disclosure → "Username", "Password" (placeholder "Password, or %ENV_VAR% (stored in clear text and read from the environment)"), ☐ "Store the password encrypted" (variants); [Back] [Add source / Adding…] | `main.css:637-686` |
| Confirm dialogs | "Uninstall N packages?" / "Update N packages?" + list; [Cancel] [Uninstall / Update] (Cancel focused) | footer right-aligned, gap 8px (`primitives.css:745-750`) |
| CPM dialog | "<id> is centrally managed"; description; body states; [Cancel] [Update central version] | alertdialog |
| Multi-install dialog | "Install <id> <version>"; "Choose the projects to install it into."; per project checkbox + name + note; [Cancel] [Install in N projects] | `main.css:713-735` |
| SB header | input (placeholder "Search, or filter: @installed, @updates"), × Clear, funnel Filters | padding 4px 8px (`sidebar.css:22-28`) |
| SB section headers | "INSTALLED" [n] [provisional]; "UPDATES" [n] [↑ "Update all (N)"] | VS Code side-bar section colours (`sidebar.css:101-115`) |
| SB row actions | trash "Uninstall <id>"; arrow "Update <id> to <v>"; plus "Install <id> <v>" | hover / focus-within |

---

## 5. Microcopy inventory

Source: `scratchpad/ux-inventory/strings.tsv` (AST extraction; it skips `className`, `data-testid`, `key`, `id`, `value`,
`name` and similar attributes, so a string held only there may be missing), plus `package.json` and the host files.

### 5.1 Strings by place (user-visible, deduplicated)

**Main header and search**: "Manage NuGet packages"; "Restore after operations"; "Include prerelease"; "Project" (aria);
"All Projects (N)"; "Loading projects…"; "No projects"; "Package source" (aria); "All sources"; "<name> (unreachable)";
"NuGet sources" (gear); "N source(s) unreachable. Retry"; "Refresh"; "Refreshing" (progress); search aria "Search
packages, or filter with @installed, @updates or @vulnerable", placeholder "Search packages, or filter: @installed,
@updates, @vulnerable"; "Clear search"; "Filters"; popup labels "Filters" / "Suggestions" / "Versions of <id>";
notes "Searching…", "Loading versions…", "<message>. Press → to retry.", "No versions available"; "Package lists" (tablist);
"Installed", "Updates"; vulnerable badge title "N package(s) with known vulnerabilities"; "Resize the package list";
"Package details" (aria); "Projects could not be listed: …"; live: "Refreshed", "Refresh failed"
(`MainShell.tsx:55-56,194,218-301`, `SourcesControl.tsx:40-58`, `SearchBox.tsx:113-124,299-304,334-335`).

**Installed / Transitive (main)**: "Bulk actions" (toolbar aria); "Select all"; "Uninstall selected (N)"; "Direct packages",
"Direct packages (N)", "Direct packages (k of N)"; "Transitive packages", "Transitive packages (N)", "Transitive packages of
all projects" (aria); badges "SDK" ("Added by the .NET SDK; cannot be uninstalled"), "props" ("Declared in an imported props
file; cannot be uninstalled from the project"), "CPM" ("Centrally managed"), "floating" ("Floating version pattern"),
"range" ("Version range"), "Vulnerable" ("Has known vulnerabilities"), "Unsupported", "provisional" ("Versions come from the
project files; a full evaluation is pending."), "<tfm>" ("Target framework <tfm>"), "N project(s)"; version cells
"unresolved", "* (always latest: v)", "<pattern> (<resolved> | run restore)"; status "Installing / Updating / Uninstalling /
Restoring / In progress / Unresolved"; empties "No packages installed.", "No vulnerable packages.", "No installed package
matches "x".", "Vulnerability data is not available for this project yet.", "No projects to list.", "No .NET projects found
in this workspace.", "No transitive dependencies."; banners "Unsupported project: …", "Installed packages of <P> could not be
loaded: …", "The project has not been restored, so its transitive packages are not known.", "Not restored, so their
transitive packages are not known: …", "The assets file of the project could not be read/opened", "The transitive packages
could not be listed: …", "The assets files of N project(s) could not be read."; buttons "Retry", "Restore"; hints "Space
selects the package for a bulk action. Enter shows its details. Delete uninstalls it. Shift+F10 opens the actions menu.",
"Arrow keys move between the packages. Enter shows the details of one."; dialog "Uninstall 1 package?" / "Uninstall N
packages?", "From <P>:", "Uninstall"; announcements "<id> cannot be uninstalled: …", "<id> is added by the .NET SDK and cannot
be uninstalled", "<id> is declared in an imported props file and cannot be uninstalled from the project", "Uninstall of <id>
failed: …", "Uninstall failed: …"; tooltips "Verified: the package id prefix is reserved by its owner", "Its version could
not be resolved from the project files; edit the project file by hand."
(`InstalledTab.tsx`, `InstalledProjectSection.tsx`, `TransitiveSection.tsx`, `AllProjectsTransitiveSection.tsx`,
`BulkUninstallDialog.tsx`, `rules.ts`, `Row.tsx:99`).

**Updates (main)**: "Select all"; "Update all (N)"; "Update selected (N)"; "Updates" (aria); hints "Space selects the package
for a bulk update. Enter updates it." / "Enter updates the package. Space selects it for Update all."; empties "No updates
available.", "No update matches "x".", "No update matches the filter.", "Updates could not be checked: no package source
answered.", "Updates could not be checked."; banners "Some package sources could not be checked; the list may be
incomplete." / "…; the lists may be incomplete.", "Updates could not be checked: …", "Updates of <P> could not be checked:
…"; row action "Update <id> to <v>"; CPM title "Centrally managed; this project overrides the version"; announcements
"<id> cannot be updated: …", "<id> is centrally managed; update it on its own to see the projects it changes", "Update of
<id> failed: …", "Update failed: …"; dialog "Update 1 package?" / "Update N packages?", "In <P>:", "<id>: old → new",
"Update" (`UpdatesTab.tsx`, `AllProjectsUpdates.tsx`, `UpdateAllDialog.tsx`).

**CPM dialog**: "<id> is centrally managed"; "Installing it sets the central version in Directory.Packages.props for every
project that uses it: <v>." / "Its version is set in Directory.Packages.props for every project that uses it: <v>.";
"Looking up the projects that use the central version…"; "The projects this change reaches could not be listed: …";
"Retry"; "The central entry was not found; the change reaches this project only."; "Changes the central version <a> → <b> in
Directory.Packages.props for:"; "(none)"; "Cancel"; "Update central version" (`CentralUpdateDialog.tsx:34-115`).

**Browse (main)**: hint "Enter shows the package's details; Ctrl+Enter (Cmd+Enter) installs it into the selected project.";
"Press Enter to search for "x"."; "Searching again"; "Some package sources could not be searched; the results may be
incomplete."; "The search failed: …"; "Search results for <q>" (aria); "No results for "x"."; "No package source could be
searched for "x"."; meta "N downloads", "NK downloads", "N.NM downloads"; badge "Installed" ("Installed: v"); live "N
package(s) found for "x"", "No results for "x"", "Under All Projects, Install… in the details picks the projects."
(`BrowseList.tsx`).

**Details**: "Select a package to see its details."; "Installed:"; "Uninstall"; "Version:"; "<v> (installed)"; "<v> (loading
versions…)"; "Install", "Update", "Downgrade", "Install…", "Working…"; "Install in projects…" ("Install this version into
several projects"); reasons "Checking the selected project", "Select a single project to install or change this package",
"A floating or ranged version is changed in the project file", "Its reference could not be resolved", "This version is
installed"; "Showing <id> of <P> until the packages of the selected project are listed."; "Its version is set centrally in
Directory.Packages.props: updating changes it for every project that uses it; uninstalling removes it from this project
only."; "Versions of a local source cannot be listed."; "No versions were found on the package sources."; "Versions could
not be listed: …"; "Details sections" (aria); tabs "Details", "README"; facts "Version", "Author(s)", "License", "View
license", "Downloads", "Package size" (B / KB / MB), "Date published" (YYYY-MM-DD), "Project URL", "Report abuse", "Report
this package"; "Vulnerabilities", "<severity> severity", "Advisory"; "Dependencies", "<tfm> (n)", "Any framework (n)", "No
dependencies."; "Details could not be loaded: …"; "No details: a package source could not be reached."; "No package source
has details for this version."; "Offline: a package source could not be reached. These details come from the package cache
on this machine." / "Offline: no package source knows this version. …"; README "No README available.", "The README could not
be loaded: …", copy "Copy <Lang> code" → "Copied", live "Copied the <lang> code.", "The code could not be copied.";
transitive "Transitive" ("Installed through another package's dependencies"), "Version:", "Authors:", "Required by", "No
traceable top-level package", "No longer listed as a transitive package."; install refusals "Select a single project to install
into.", "The packages of the selected project are not listed yet.", "<id> is already installed (v).", "Install of <id> failed:
…"; multi-install "Install <id> <v>", "Choose the projects to install it into.", "Projects" (aria), "Cancel", "Install in N
project(s)", notes "unsupported", "could not be read", "not listed yet", "centrally managed: install it from the project to see
the preview", "preview failed", "<v> installed", "installed: <v>" (`DetailsPane.tsx`, `DetailsInfo.tsx`, `ReadmeView.tsx`,
`markdown.ts`, `TransitiveDetails.tsx`, `useInstallAction.ts`, `MultiInstallDialog.tsx`).

**Sources**: see §4.3 plus "Sources of the selected project's config files. Remove deletes a source from the file that
declares it.", "Loading sources…", "No NuGet sources are configured.", "The sources could not be listed: …", "NuGet sources"
(aria of the list), "Add a source" (aria of the form), "Enter the URL of the source.", "Stored in clear text: %VAR% is read
from the environment when the source is used", "Store the password encrypted (Windows only); it is stored in clear text",
live "<name> enabled/disabled/removed/added", "<name> could not be enabled/disabled/removed: …"
(`SourceSettingsDialog.tsx`).

**Sidebar**: placeholder "Search, or filter: @installed, @updates"; aria "Search packages, or filter with @installed or
@updates"; "Refreshing installed packages"; "Resize the Installed and Updates sections"; "Installed"; "Updates"; "Update all
(N)"; "provisional"; "Unsupported project: …"; "Installed packages could not be loaded: …"; "The projects could not be listed:
…"; "Installed packages of <P> could not be loaded: …"; empties "No packages installed.", "No packages to show.", "No
installed packages match "x".", "No .NET projects found in this workspace.", "No updates available.", "No updates match
"x".", "Updates could not be checked."; banners "Some package sources could not be checked.", "Some package sources could not
be searched.", "Updates could not be checked: …", "Updates of <P> could not be checked: …", "The search failed: …"; "Press
Enter to search."; "Searching again"; badges "CPM", "Installed", "Installed in k of N" (title "Installed in k of N projects:
…" / "Installed in every project: …"); row actions "Uninstall <id>", "Update <id> to <v>", "Install <id> <v>"; hints "Enter
or Delete uninstalls; Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.", "Read-only. Ctrl+Enter
(Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.", "Enter updates to the latest version (a centrally managed
package: opens the actions menu); Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.", "Enter
installs into the selected project (a package with a central entry in a CPM project: opens the actions menu); Ctrl+Enter
(Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.", "Enter chooses what to do and the projects to install
into."; live "Loading installed packages", "There is no project to install into.", "<id> is already installed (v).", "The
actions of <id> failed: …", "Opening <id> failed: …"; dialog "Update N packages?", "In <P>:", "<id>: old → new"
(`SidebarView.tsx`, `InstalledSection.tsx`, `ProjectPackages.tsx`, `UpdatesSection.tsx`, `ProjectUpdates.tsx`,
`BrowseResults.tsx`, `rowRequests.ts`).

**Shared**: banner prefixes read aloud "Info: ", "Warning: ", "Error: " (`Banner.tsx:16,29`); "Something went wrong in this
view." + "Reload" (`ErrorBoundary.tsx:40`); "Cancel" default (`ConfirmDialog.tsx:26`); outcome sentences (`outcomes.ts:27-53`):
"Installed <id> <v>", "Updated <id> <v>", "Uninstalled <id>", "Restored <P>", "…; also restored N other project(s)", "…,
but the restore failed: …", "<Install|Update|Uninstall|Restore> of <x> was cancelled / was not started: … / failed: …", "N of
N operations completed", "d of N operations completed: …", "The operation was not started: …".

**package.json**: view container "nUIget"; view name "" (`:75`); commands "nUIget: Manage NuGet Packages" (short "nUIget:
Manage Packages"), "nUIget: Refresh Packages", "nUIget: Select Package Source", "nUIget: Select Project", "nUIget: Include
Pre-release", "nUIget: Exclude Pre-release", "nUIget: Restore after operations", "nUIget: Skip restore after operations",
"nUIget: Refresh Sidebar", "nUIget: Open Full Manager", "nUIget: Clear NuGet HTTP Cache", "nUIget: Clear SDK Version Cache"
(`:83-141`); settings descriptions (`:250-283`).

### 5.2 Terminology verdict

| Pair | Verdict | Evidence |
|---|---|---|
| package / reference | Clean: "package" throughout; "reference" only in the unresolved messages ("its reference could not be resolved") | `rules.ts:48,69`, `DetailsPane.tsx:121` |
| uninstall / remove | Clean for packages ("Uninstall" in every UI string; `remove` only in the protocol and the outcome map keys); "Remove" is used for **sources** only | `outcomes.ts:5-6`, `SourceSettingsDialog.tsx:49-55`; QuickPick uses the `$(close)` icon for Uninstall where the webviews use a trash can (`pickers.ts:106,109,117,123` vs `InstalledProjectSection.tsx:150`) |
| source / feed | Clean: "feed" never appears in a user-visible string (grep of `strings.tsv`) | — |
| install / update / restore | Consistent verbs; IM §5 `:89` terminology holds | — |
| transitive "packages" vs "dependencies" | Mixed: headers say "Transitive packages", empties say "No transitive dependencies." | `TransitiveSection.tsx:91,103` |

### 5.3 Inconsistencies

| # | Inconsistency | Instances |
|---|---|---|
| M1 | Casing of the same noun | "All sources" (`SourcesControl.tsx:45`) vs "All Sources" (`pickers.ts:44`); "NuGet sources" (`SourceSettingsDialog.tsx:226`, `SourcesControl.tsx:53`) vs "Manage NuGet Sources…" (`pickers.ts:46`) vs "Package source" (aria, `SourcesControl.tsx:40`) vs "nUIget — Package Source" (`pickers.ts:48`) |
| M2 | Prerelease spelling and case | "Include prerelease" (`MainShell.tsx:241`) vs "Include Pre-release" / "Exclude Pre-release" (`package.json:104,109`) vs "Pre-release enabled" (`SidebarHost.ts:102`) |
| M3 | Command title casing and category | "nUIget: Restore after operations" / "Skip restore after operations" (sentence case) vs "Include Pre-release", "Manage NuGet Packages" (Title Case) (`package.json:83-141`); the "nUIget: " prefix is in each title instead of `category`, so it also shows in menus that drop categories (VS Code: "The Command Palette … prefixes commands with their `category` … The editor context menu … doesn't show the category label", https://code.visualstudio.com/api/references/contribution-points via context7) |
| M4 | Names of the main panel | tab "nUIget", h1 "Manage NuGet packages", command "Manage NuGet Packages", "Open Full Manager", hints "opens the full view", QuickPick "Open in the full view", IM "Open full view" |
| M5 | Section header case in one tab | "DIRECT PACKAGES (2)" upper (`primitives.css:480`) vs project headers normal case (`main.css:702-708`); captures `main-installed-single` vs `main-installed-all` (judge) |
| M6 | Labels with and without colons | "Installed:", "Version:" (`DetailsPane.tsx:167,181`), "Version:", "Authors:" (`TransitiveDetails.tsx:52,57`) vs facts "Version", "Author(s)" (`DetailsInfo.tsx:46,48`) |
| M7 | "Author(s)" vs "Authors" | `DetailsInfo.tsx:48` vs `TransitiveDetails.tsx:57` |
| M8 | Filter-empty sentences | "No installed package matches "x"." (`InstalledProjectSection.tsx:58`) vs "No installed packages match "x"." (`ProjectPackages.tsx:75`); "No update matches "x"." (`UpdatesTab.tsx:167`) vs "No update matches the filter." (`AllProjectsUpdates.tsx:90`) vs "No updates match "x"." (`UpdatesSection.tsx:30`) |
| M9 | Sources-unavailable sentences | "…could not be checked; the list may be incomplete." (`UpdatesTab.tsx:229`) / "…; the lists may be incomplete." (`AllProjectsUpdates.tsx:317`) / "Some package sources could not be checked." (`UpdatesSection.tsx:152,181`); Browse "…could not be searched; the results may be incomplete." (`BrowseList.tsx:102`) / "Some package sources could not be searched." (`BrowseResults.tsx:135`); empty "Updates could not be checked: no package source answered." (`UpdatesTab.tsx:166`) / "Updates could not be checked." (`AllProjectsUpdates.tsx:82,88`, `UpdatesSection.tsx:28`) |
| M10 | No-project sentences | "No .NET projects found in this workspace." (`InstalledTab.tsx:185`, `UpdatesTab.tsx:158`, `InstalledSection.tsx:115`) vs "No .NET project files found in the workspace." (`pickers.ts:12`) vs "No projects" (`MainShell.tsx:251`) vs "No projects to list." (`InstalledTab.tsx:185`, `AllProjectsUpdates.tsx:276`) vs "There is no project to install into." (`BrowseResults.tsx:88`) vs "Select a single project to install into." (`useInstallAction.ts:62`) |
| M11 | Error verbs | "could not be loaded" / "could not be listed" / "could not be checked" / "could not be read" / "could not be opened" / "failed" ("The search failed: …") for the same class of failure |
| M12 | Same list, different key hints | `UpdatesTab.tsx:23` vs `AllProjectsUpdates.tsx:15` (order reversed; "bulk update" vs "Update all"); main Installed hint names a key that does nothing (D-01); every hint says "Ctrl+Enter (Cmd+Enter)" on every platform |
| M13 | Toast prepositions and prefix | "Uninstalled X **from** P" (`feedback.ts:53`) vs "Uninstall of X **in** P failed" (`:72`); "nUIget: " prefix on feedback toasts (`feedback.ts:36`) but not on `SidebarHost.ts:120,153,293`, `pickers.ts:12,54`, or the `Copied "X" to clipboard` status message (`SidebarHost.ts:137`, `handlers.ts:414`); trailing periods inconsistent (`pickers.ts:54`, `SidebarHost.ts:153` have none) |
| M14 | Installed-version formats | select "<v> (installed)" (`DetailsPane.tsx:191`); multi-install "<v> installed" and "installed: <v>" in one list (`MultiInstallDialog.tsx:155`); QuickPick "(installed <v>)" (`pickers.ts:72`) and "v<v>" (`pickers.ts:87`); Browse badge title "Installed: <v>" |
| M15 | Downloads | row "9325.4M downloads" (no billions unit; `BrowseList.tsx:26-29`, capture `main-browse-results`) vs Details "9,325,394,018" (`DetailsInfo.tsx:55`) |
| M16 | CPM verbs | the install preview's confirm button still reads "Update central version" and its title "<id> is centrally managed" (`CentralUpdateDialog.tsx:103,110` for `kind: 'install'`, `:36-37`) |
| M17 | Refresh names | "Refresh" (`MainShell.tsx:256`), "nUIget: Refresh Sidebar", "nUIget: Refresh Packages" (hidden, `package.json:89,127`) |
| M18 | Disabled primary label | "Update" disabled when the installed version is chosen (D-06); reason only in a tooltip |

---

## 6. Findings (also returned in the structured object)

1. **X, high, decision-relevant** — Main panel has no actions menu (D-01): IA decision between a native `webview/context`
   menu (`data-vscode-context` per row; stable since 1.72) or dropping the promise and the hint. Evidence above.
2. **A, high, decision-relevant** — Main Updates rows: Enter updates, no keyboard path to details (D-02).
3. **X, medium, decision-relevant** — Sidebar rows bind a write to Enter, without confirmation: Installed Enter uninstalls
   (`ProjectPackages.tsx:91`, hint `:85`), Browse Enter installs (`BrowseResults.tsx:82-120,149`), Updates Enter updates
   (`ProjectUpdates.tsx:100`); the main Updates list does the same (D-02). Whether the workbench's own lists ever bind a
   write to Enter was **not verified** in this session (hypothesis: the Extensions view's Enter opens the item).
4. **X, medium, decision-relevant** — Delete scope (D-03).
5. **X, medium, decision-relevant** — Sidebar context visibility (D-04).
6. **X, medium, decision-relevant** — No keybindings, no command `category`, `ui/focusSearch` never sent to the main panel
   (M3; `MainShell.tsx:138`; grep shows `SidebarHost.ts:60` as the only sender). VS Code's Command Palette guidelines say
   "Add keyboard shortcuts where appropriate" and "Group commands together in the same category"
   (https://code.visualstudio.com/api/ux-guidelines/command-palette, via context7).
7. **X, medium, decision-relevant** — Cross-surface "View package details" always lands in Browse (D-18).
8. **X, low, decision-relevant** — No explicit Restore action outside the transitive banner (D-05).
9. **X, low** — Details primary button semantics (D-06, M18).
10. **A, low** — State announcements and busy semantics drift (D-07 badge semantics, D-08, D-09).
11. **X, low** — Microcopy inconsistencies (§5.3).
12. **X, low, decision-relevant** — Operation feedback is triple (live region + status bar + toast on every success) and
    toasts stack (capture `sidebar-sections` shows three); D17 is reopened. That the workbench shows no success toast for
    an extension install is a **hypothesis, not verified** here.
13. **X, low** — Captures cover only the happy path (§1.4); every non-ready state is unverified visually.

---

## 7. Not reached and gaps

Not opened / not reached: `ARCHITECTURE.md` 2.0 section; `docs/adr/*`; `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`
(D10, D14–D19 taken from the task text); `docs/plans/parity-audit-2026-10-16.md` beyond greps (`:276,585,966,1077,1145,1160,1513`);
the 1.18.9 JPEGs (README only); `.github/workflows/ci.yml` capture mechanics; `src/host/handlers.ts` beyond `:23-152` greps,
`:245-314`, `:398-448`; `src/core/**` (whether unresolved packages are excluded from update checks, host normalisation of All
Projects with ≤ 1 project beyond `extension.ts:413-418`); other agents' files under `scratchpad/research/` (not read).

Gaps:
- No live VS Code or browser was used: every "visible on hover", "hidden", "dimmed" claim about states not in a capture is
  derived from CSS and JSX, not observed.
- Behaviour of a `webview/context` menu inside a **webview view** (the sidebar) was not verified; the release note and the
  webview guide speak of webviews with `webviewId == viewType`.
- Workbench comparisons (Extensions view Enter, success toasts, keybindings) are hypotheses; another dimension owns them.
- Screen-reader output was not observed; the A findings rest on ARIA in code.
- The string extractor skips some attributes (§5). Host error texts reach the banners verbatim through `error.message`
  (for example `MainShell.tsx:281`, `UpdatesTab.tsx:232`); those defined in `src/host` are listed
  (`handlers.ts:23,36,152,285,314,353-384,420`), core-level messages (`src/core/**`) are not inventoried.
- The ExTester file order behind the `main-installed-single` README state is inferred from the shell glob, not verified.
- Sidebar All Projects, All Projects Updates and every dialog except the sidebar Update all are documented from code only.

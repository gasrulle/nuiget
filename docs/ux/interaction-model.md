# nUIget interaction model

This document defines how the two surfaces (main panel, Activity Bar sidebar) behave, what every
visible state means, and which `data-testid` hooks UI tests may rely on. Feature code follows this
document; when behaviour changes, change this document in the same pull request.

## 1. Surfaces and their jobs

| Surface | Purpose | Density |
|---|---|---|
| **Main panel** (`nUIget` editor tab) | Full package management: browse/search with details and README, installed list with transitive dependencies, updates with bulk actions, source settings. | Comfortable rows (icons, description, badges), split list/details layout. |
| **Sidebar** (Activity Bar view) | At-a-glance installed/updates for the active project with quick actions; browse via the search box. | Compact rows (no icons, no descriptions); QuickPicks for choices; Update all in the Updates header, confirmed in-panel. |

Both surfaces show the **same active context** — project, source, prerelease, restore toggle —
owned by the host (`SessionStore`). Changing it in one surface changes it in the other within one
broadcast. The active project name and source name are always visible: main panel header
selectors; sidebar view title (project) and title-bar icons (source/prerelease/restore state).
The main panel header shows the title "Manage NuGet packages", the Restore after operations and
Include prerelease checkboxes, the project and source selectors (a source the host could not reach
is marked "(unreachable)", and a warning button beside the gear retries it) and a refresh button
that is disabled while it runs.

## 2. Modes (driven by the search box)

`parseSearchQuery(text)` yields one of:

| Mode | Trigger | Main panel shows | Sidebar shows |
|---|---|---|---|
| `default` | empty box | Tabs **Installed** / **Updates** (with count badges; the Installed tab also shows how many packages have known vulnerabilities once the metadata is known) | Sections **Installed** / **Updates** (collapsible, draggable split) |
| `browse` | plain text + Enter (quick-search suggestions while typing, grouped per source, with a loading row; ArrowRight lists versions and Ctrl+Enter installs, §5) | Browse results list + details; tab bar hidden | Flat browse results (Enter or 300 ms debounce, min 2 chars); Enter on a row installs it, or, for a package that has a central entry in a CPM project, opens the actions menu (§5) |
| `installed` | `@installed <filter>` | Installed tab filtered client-side | Installed section filtered |
| `updates` | `@updates <filter>` | Updates tab filtered | Updates section filtered |
| `vulnerable` | `@vulnerable` | Installed tab, vulnerable packages only | *(not offered)* |

Typing `@` opens a prefix dropdown (ArrowUp/Down, Enter/Tab select, Escape dismiss). Escape in a
non-empty box clears it (returns to `default`); Escape in an empty box blurs. The box has a Clear
button and a Filters button that puts `@` in it (pointer helpers, not stops of the Tab order).

## 3. "All Projects"

Selecting **All Projects (N)** sets `selectedProject = ALL_PROJECTS`. It means *every supported
project discovered in the workspace* (all workspace folders), grouped by workspace folder when
there are several. Solution membership is not consulted in 2.0 (see ADR-000). Unsupported
projects appear with an Unsupported section (badge and banner) explaining why (`packages.config`, non-SDK-style); a
project whose SDK is below 10 lists its packages read-only.

In this mode:
- Installed and Updates group rows per project; row actions apply to that project.
- Install from browse opens a multi-select project picker (QuickPick in the sidebar, in-panel
  dialog in the main panel; in a single project of a workspace with several, the details pane also offers Install in
  projects…, the same picker, for a search result not installed there, and the picker lists every project itself
  when All Projects is not selected) showing where the package is already installed. A bulk install shows no preview, so it
  leaves out every Central Package Management project where the package already has a central entry (N76): the main
  panel's picker asks `cpm/preview` per CPM project when it opens and lists such a project as "centrally managed"
  (or "preview failed") without a checkbox to tick; the sidebar asks the same after the QuickPick and names the
  projects it left out. Installing there is a single install from that project, which shows the preview. A project not
  yet listed, or whose list could not be read, cannot be picked.
- Transitive dependencies aggregate into one section, loaded lazily on expand.
- With ≤ 1 project the mode is automatically downgraded to that project (host normalization).

## 4. State vocabulary (every list/detail area uses exactly these)

| State | Visual | Rule |
|---|---|---|
| **Loading (first)** | Skeleton rows (3) + `role="status"` text "Loading …" | Only when there is no previous data for the key. |
| **Revalidating** | Existing rows stay; subtle progress bar under the search box; rows `aria-busy` | When a displayed resource was invalidated and is being recomputed. Never blank the list. |
| **Provisional** | Small "provisional" badge on the section header (All Projects sections, the main panel's `Direct packages` header, sidebar Installed section); tooltip explains evaluation is pending | `fidelity: 'provisional'`. Actions remain enabled except for `unresolved` packages. |
| **Unresolved** | Version cell shows "unresolved" with tooltip; row actions disabled | `declaration: 'unresolved'`; excluded from update checks. |
| **Centrally managed** | "CPM" badge on the row; version cell shows central version | `declaration: 'central' \| 'central-override'`. An update of a `central` row shows an impact preview first (main panel: dialog; sidebar: the actions menu and a VS Code modal); a `central-override` row updates in its project alone without a preview (its badge says so) and joins Update all; an uninstall removes the project's reference only and keeps the central entry (ADR-004), without a dialog. |
| **Pending op** | Row gets a spinner replacing its action button; details action buttons disabled | From `ops/*` `queued`/`running` chunks until the terminal outcome. |
| **Partial / failed op** | Toast (VS Code notification) + row returns to its real state after invalidation | Never leave optimistic state on failure. |
| **Stale selection** | Details header shows the project the selection belongs to; actions disabled until re-validated | When the active project changes while a package is selected, the details panel keeps its content but becomes read-only until the new installed data confirms the package (then it re-enables) or clears it (package not in new project). |
| **Empty** | `EmptyState` primitive with one sentence and (optionally) one action | e.g. "No packages installed", "No updates available", "No results for …". |
| **Offline / sources unreachable** | Warning banner under the search box with "Retry" | `sourcesUnavailable: true` on updates/search; never render as "no updates". |
| **Unsupported project** | Row/banner "Unsupported project: <reason>" | From `InstalledResult.unsupported`. |
| **Error** | Inline error text with "Retry"; details also logged to the output channel | Any error response. Loading indicators always clear. A rendering error in a view shows the error state ("Something went wrong in this view.") with Reload and is reported to the host as `ui/reportError`. |

## 5. Actions and confirmations

| Action | Where | Confirmation |
|---|---|---|
| Install / Update to version | Details panel button, sidebar row hover/focus action, context menu | None (the status bar shows the running operation; a toast reports the outcome). |
| Uninstall (single) | Details button, row action, context menu | None; outcome toast. |
| Bulk update / bulk uninstall | Updates/Installed toolbar; the sidebar's Updates header (Update all) | In-panel **Dialog** listing the packages (and projects in All Projects) with Confirm/Cancel; then a progress notification (N of M) and a summary toast. |
| CPM central change | Any update of a `central` package, or an install of a package that already has a central entry in a CPM project (main panel: the pane asks `cpm/preview` first and opens the dialog only when an entry exists; sidebar: the actions menu and the host's modal) | Main panel: **Dialog** (`cpm-preview-dialog`) listing the projects the central version applies to; choice: *Update central version* / Cancel. Sidebar: the row's primary action opens the actions menu and the host confirms with a modal listing the same projects. *Override in this project only* is not offered: no `dotnet` command writes a `VersionOverride` (ADR-003); an existing override updates in place from the Updates lists and the details pane. An uninstall of a central row needs no confirmation (the central entry stays). |
| Remove source | Source settings | In-dialog confirm row (existing pattern). |
| Restore project(s) | Transitive banner, header | None. |

Terminology: UI says **Install / Update / Uninstall / Restore**. Protocol uses `remove`.

Keyboard: every pointer action is reachable by keyboard. A list is a `role="listbox"` whose rows
are `role="option"` with roving `tabIndex` (one tab stop per list; the active row has
`tabIndex=0`). ArrowUp/ArrowDown move, Home/End jump to the first and last row; moving changes the
active row, not the selection. Enter activates the row (main panel: selects it and shows its
details; sidebar: performs its primary action (on a centrally managed update row: opens the actions menu)), Ctrl+Enter (Cmd+Enter on macOS) performs the
secondary action, Delete (Cmd+Backspace on macOS) uninstalls where applicable, and Shift+F10 or the
ContextMenu key opens the actions menu for the active row; right-click anywhere on the row opens
the same menu. Row action buttons are pointer-only: they sit next to the option in a container
hidden from assistive technology (`aria-hidden="true"`, `tabIndex={-1}`), become visible on
`:hover` and `:focus-within` of the row, and clicking one keeps focus on the row. Each listbox
describes its keys in a visually hidden sentence (`aria-describedby`); outcomes are announced
through the one `role="status"` region (`status-live`). A row with a pending operation is
`aria-busy="true"`, its status text is part of its description and a spinner replaces its actions.
A disabled row (`aria-disabled="true"`, e.g. unresolved) keeps focus, selection and the context
menu but ignores Enter, Ctrl+Enter and Delete. When the active row disappears, focus moves to the
row now at its index (or the last one); when the list empties, the empty-state container takes
focus. A list that offers bulk actions is `aria-multiselectable`: Space toggles whether the active row is
selected for them (Ctrl+click, Cmd+click on macOS, or a click on the row's check mark does the same), the rows
selected for them are `aria-selected`, and the row whose details are shown is `aria-current`. Select all selects
every row the action applies to; the confirmation dialog lists exactly those rows.

Main panel secondary action (D16). In the Browse list Ctrl+Enter (Cmd+Enter on macOS) installs the row's version, the
newest the search found under the prerelease setting, into the selected project with the row's source, and makes the
row current; Enter only shows the details. In the search box, with a suggestion highlighted, Ctrl+Enter installs its
newest version, asked of the suggestion's source under the prerelease setting; ArrowRight lists its five newest
versions, ArrowUp and ArrowDown move through them, Enter shows the details at the highlighted version, Ctrl+Enter
installs it, ArrowLeft returns to the suggestions. Both take the Install button's route: an install into a Central
Package Management project asks `cpm/preview` first and opens the preview dialog when the package has a central entry
(N77); the package is busy from the key press. Ctrl+Enter installs nothing, and the live region says why, under All
Projects or without a project, while the selected project's packages are not listed yet, when the package is installed
already, or while an operation on it runs; under All Projects a Browse row's Ctrl+Enter makes it current so the pane
offers Install… with the project picker. The Installed and Updates lists of the main panel have no secondary action.

## 6. Cross-surface behaviour

- An operation started in either surface shows progress in both (`ops/progress`) and both
  re-query the affected resources after `resources/invalidated`.
- Manual refresh (header button / sidebar title-bar refresh) issues `refresh/all` once; both
  surfaces revalidate (no blanking).
- The sidebar "Open full view" / "View package details" open the main panel and navigate
  (`ui/navigateToPackage`): the search box is filled with the id, browse mode runs, the package is
  selected and the Details tab shows.
- Source settings open in the main panel (`ui/openSourceSettings`) even when triggered from the
  sidebar.

## 7. Details panel

Tabs (`role="tablist"`): **Details** (description, then Version, Author(s) with the Verified mark,
License, Downloads, Package size, Date published, Project URL and, for a nuget.org package, Report
abuse; vulnerabilities with severity **text + icon**; dependencies per target framework, collapsed
with their counts),
**README** (rendered Markdown, sanitized; images fetched host-side; code blocks with a copy button
that shows Copied for two seconds; "No README available" empty state; failure shows an inline retry). Version dropdown (`version-selector`) lists versions with
"(installed)" marker; the primary button reads **Install** / **Update** / **Downgrade** /
**Uninstall** depending on the selection vs installed version. Loading of versions/metadata/README is
per selection; a response for a different package/version is ignored.

The header (title, installed version with Uninstall, version selector with the primary button) stays in view; the
Details and README content scrolls under it. In a single project of a workspace with several, a search result not
installed there also offers **Install in projects…** (`multi-install-button`), the picker of §3.

The pane shows the selection of the active view: Installed (direct and transitive rows), Updates or Browse. Each tab
keeps its own selection and gets it back when it is shown again; Browse starts without one and shows the empty state
until a row is current, and a new search whose results lack that row clears it.

A transitive row (single project or the All Projects aggregate) opens a read-only view: the id with a Transitive badge,
Version, Authors with the Verified mark, and Required by, the top-level ids, one block per target framework when the
project has several and one block per project in All Projects; no version selector, no actions, no README.

## 8. Stable `data-testid` hooks

| Test id | Element |
|---|---|
| `nuiget-app` | Main panel root |
| `nuiget-sidebar` | Sidebar root |
| `search-input` / `sidebar-search-input`, `search-suggestions` | Search boxes and the list of their prefixes, suggestions or versions |
| `project-selector`, `source-selector` | Header selectors (main) |
| `refresh-button` | The header's Refresh button (main): a workspace rescan |
| `tab-bar`, `installed-tab`, `updates-tab` | Main tabs |
| `installed-list`, `updates-list`, `browse-list`, `sidebar-installed-list`, `sidebar-updates-list`, `sidebar-browse-list`, `transitive-list`, `transitive-list-<tfm>` | Listboxes |
| `package-row-<id>` | A row (id lower-cased): the wrapper around the option and its pointer actions; the option is the `role="option"` inside it (read `aria-selected` there; in a multi-selectable list `aria-current` marks the current row) |
| `row-action-<name>` | A pointer action button inside a row (`install`, `update`, `uninstall`); hidden from assistive technology, mirrored by the keys of §5 |
| `section-header-<name>` | The toggle button of a collapsible section (`installed`, `updates`, `transitive`, `direct`) |
| `section-header-transitive-<tfm>` | The toggle of one target framework's transitive packages (a project with several) |
| `package-details-panel`, `details-tab-details`, `details-tab-readme`, `readme-content`, `readme-empty`, `transitive-details` | Details panel |
| `version-selector`, `install-update-button`, `uninstall-button` | Details actions |
| `select-all-button`, `update-all-button`, `uninstall-selected-button` | Bulk toolbar |
| `transitive-section`, `transitive-restore-banner` | Transitive |
| `source-settings`, `source-settings-modal`, `add-source-panel`, `source-row-<name>`, `source-health-indicator` | Sources (`<name>` = source name lower-cased; the indicator shows while a source is unreachable) |
| `confirm-dialog`, `confirm-dialog-confirm`, `confirm-dialog-cancel` | Dialog primitive |
| `status-live` | `role="status"` live region |
| `sash` | Split sash |

State markers (§4) and layer roots:

| Test id | Element |
|---|---|
| `sidebar-installed-empty`, `sidebar-updates-empty` | Empty state of a sidebar list |
| `sidebar-installed-error` | Error state of the sidebar's installed list |
| `updates-unavailable-banner`, `sidebar-updates-unavailable`, `browse-unavailable-banner`, `sidebar-browse-unavailable` | A source could not be read (updates, search) |
| `sidebar-unsupported` | Banner of a project the 2.0 surfaces cannot change |
| `sidebar-installed-provisional` | The "provisional" badge of the sidebar's installed section |
| `cpm-preview-dialog`, `cpm-preview-confirm`, `multi-install-dialog`, `multi-install-button` | Dialog roots (central package management preview, install into several projects), the preview's *Update central version* button and the details pane's *Install in projects…* |

All Projects (§3; `<name>` = project name lower-cased):

| Test id | Element |
|---|---|
| `installed-list-<name>`, `updates-list-<name>` | A project's list in the main panel |
| `sidebar-installed-list-<name>`, `sidebar-updates-list-<name>` | A project's list in the sidebar |
| `sidebar-update-all-button` | Update all in the sidebar's Updates header |
| `section-header-project-<name>`, `section-header-updates-<name>` | The toggle of a project's section (Installed, Updates) |

Removing or renaming a hook requires updating this table and the ExTester tests in the same change.

A hook enters a table when a test outside its component reads it (ExTester, e2e, harness), or when it marks a
documented state (§4) or the root of a layer; adding one needs no consultation. Names listed in parentheses after a
pattern hook are the ones the product renders. `src/test/lint/interaction-model-testids.test.ts` fails for a hook in
these tables that no 2.0 webview file renders, and for a listed name that is not rendered with its pattern's prefix.

# nUIget interaction model

This document defines how the two surfaces (main panel, Activity Bar sidebar) behave, what every
visible state means, and which `data-testid` hooks UI tests may rely on. Feature code follows this
document; when behaviour changes, change this document in the same pull request.

**Version 2 (2026-10-23)**, the target of the UX overhaul, replaces version 1 (2.0.0) in place. Its rule is the
workbench's: the panel and the sidebar behave like built-in views (the Extensions view, the Settings editor, the
side-bar panes) that manage NuGet packages. The decisions behind it are ADR-010 (no layering), ADR-011 (the host's
look and VS Code's size tokens), ADR-012 (icons) and ADR-013 (keyboard and menus); the numbers live in the Design
System (docs/design/design-system.md), where each has the measurement that checks it. The owner's design rounds
decided the forks this file depends on: the Extensions row in the main panel (D-A) and 22 px compact rows in the
sidebar (D-B), one grouped list per view (D-C, composition A), sidebar Enter opening the main panel on the row (D-D)
and success shown in place (D-E, D50) in round 1; the Browse loading state (F3a) in round 2.
Until the item that implements a section lands, the tree behaves as version 1 of this file described; the UX
execution plan names the item for each difference.

## 1. Surfaces and their jobs

| Surface | Purpose | Density |
|---|---|---|
| **Main panel** (`nUIget` editor tab) | Full package management: browse/search with details and README, installed list with transitive dependencies, updates with bulk actions, source settings. | Comfortable rows, the Extensions row (round 1; the 78 px card of D15 is retired): 72 px high, a 36 px icon at the content inset and two lines, the name with its badges, then the version and the authors with the Verified mark; the row's actions sit inside its hover and selection band, and no line separates rows. What each list shows on the two lines (Browse's downloads and description included) is the row spec of the Design System. Every row of one scroll container starts its icon and its text at the same x (a row without a check mark keeps the column); hover, selection and focus cover the whole row, its actions included; at most three actions show, on hover and on focus; the name truncates last; below 250 px of list width the icon is 24 px and below 200 px it is hidden (the Extensions breakpoints); an update reads `old → new` with the new version marked; every row has the tooltip `id version`. A selected row takes the list's selection colours (the active ones while the list has focus, the inactive ones otherwise) and a focused row a 1 px outline; no accent bar. Split list/details layout. |
| **Sidebar** (Activity Bar view) | At-a-glance installed/updates for the active project with quick actions; browse via the search box. | Compact rows 22 px high, the workbench's tree row (round 1): no icons, no descriptions, name first; a long version shortens with an ellipsis before the name does; the tooltip `id version`; Installed and Updates rows sorted by id and indented to their section title. The sections are pane headers like the workbench's own: 22 px with an 11 px bold uppercase title in the classic look, 28 px with a 12 px semibold title in the host's casing and a hover tint under Modern UI; collapsible, with a draggable split; the count and the header's actions (Update all) keep the header's end inset. QuickPicks for choices (project, source, versions); the row actions menu is VS Code's own (§5). Update all in the Updates header, confirmed in-panel. |

Both surfaces follow the workbench's look (ADR-011): Modern UI, VS Code's default since 1.139, or the classic look
when the user turned it off. The host hands both webviews the look, the layout density and the header-casing setting;
the metrics that differ between the looks switch with it (section-header height and type, the header's hover tint, row
corners and inset, the tab strip's height, scrollbar thickness, the count badge, focus after a click), and nothing else
does. Rows, buttons, inputs, selects, check boxes and icons are the same in both looks.

Both surfaces show the **same active context** — project, source, prerelease, restore toggle —
owned by the host (`SessionStore`). Changing it in one surface changes it in the other within one
broadcast. The active project and source are always visible: in the main panel as the header's selectors; in the
sidebar the view title names the project and the title-bar actions show the source, prerelease and restore state (at
most four actions in the title bar, the rest in its `...` menu). Where the sidebar names the source in words is ruled
in the sidebar phase (X15): the single-view container hides the view description, so the choices are the title string
or a line in the webview's own header.

The main panel header shows the title "Manage NuGet packages", the Restore after operations and
Include prerelease check boxes, the project and source selectors (a source the host could not reach
is marked "(unreachable)", and a warning button beside the gear retries it) and a refresh button
that is disabled while it runs. Its controls have the workbench's sizes (buttons and selects 26 px with a 12 px label,
check boxes 18 px). When it does not fit, it wraps; below that the check boxes' labels give way to icon toggles with
tooltips, and the title hides last.

Layout rhythm, both surfaces: content starts at one inset (16 px in the main panel: the title, the search box, the
tab labels, the toolbars, the section chevrons and the row content); every header and toolbar has equal start and end
insets and equal top and bottom insets; gaps between sibling blocks come from the 4 px spacing ramp, 4 px inside a
group and 8 px between groups. No container of controls (tab strip, toolbar, header, details actions) scrolls
sideways: each has a minimum width and a stated way to give way below it (wrap, icon-only, hide by priority).

## 2. Modes (driven by the search box)

`parseSearchQuery(text)` yields one of:

| Mode | Trigger | Main panel shows | Sidebar shows |
|---|---|---|---|
| `default` | empty box | Tabs **Installed** / **Updates** (with count badges; the Installed tab also shows how many packages have known vulnerabilities once the metadata is known) | Sections **Installed** / **Updates** (collapsible, draggable split) |
| `browse` | plain text + Enter (quick-search suggestions while typing, grouped per source, with a loading row; ArrowRight lists versions and Ctrl+Enter installs, §5) | Browse results list + details; tab bar hidden | Flat browse results (Enter or 300 ms debounce, min 2 chars); Enter on a row opens it in the main panel, Ctrl+Enter installs it, or, for a package that has a central entry in a CPM project, opens the actions menu (§5) |
| `installed` | `@installed <filter>` | Installed tab filtered client-side | Installed section filtered |
| `updates` | `@updates <filter>` | Updates tab filtered | Updates section filtered |
| `vulnerable` | `@vulnerable` | Installed tab, vulnerable packages only | *(not offered)* |

Typing `@` opens a prefix dropdown (ArrowUp/Down, Enter/Tab select, Escape dismiss). Escape in a
non-empty box clears it (returns to `default`); Escape in an empty box blurs. Ctrl+DownArrow (Cmd+DownArrow on macOS)
moves focus from the box to the list it drives, and Ctrl+UpArrow (Cmd+UpArrow) in that list moves it back (§5); inside
an open dropdown the arrows keep moving through it. The box has a Clear button and a Filters button that puts `@` in
it (pointer helpers, not stops of the Tab order).

## 3. "All Projects"

Selecting **All Projects (N)** sets `selectedProject = ALL_PROJECTS`. It means *every supported
project discovered in the workspace* (all workspace folders), grouped by workspace folder when
there are several. Solution membership is not consulted in 2.0 (see ADR-000). Unsupported
projects appear with an Unsupported section (badge and banner) explaining why (`packages.config`, non-SDK-style); a
project whose SDK is below 10 lists its packages read-only.

In this mode:
- Each view is one grouped list (D-C, round 1, composition A; §5): in the main panel's Installed and Updates tabs
  every project is a group row of the tab's one list, with its packages under it, and the transitive aggregate is
  the last group row; in the sidebar each pane (Installed, Updates) stays a pane and its list is one grouped list with
  a group row per project. One tab stop and one scroller per view; ArrowUp and ArrowDown cross groups; ArrowLeft and
  ArrowRight collapse and expand a group row as the workbench's trees do. The per-project lists of 2.0 are retired.
  Row actions, keys and the actions menu of a package row apply to its group's project.
- A project's group row shows the project name, its count and, while the project's list is provisional, the
  provisional badge, on both surfaces and at the row's end inset (X36).
- Install from browse opens a multi-select project picker (QuickPick in the sidebar, in-panel
  dialog in the main panel; in a single project of a workspace with several, the details pane also offers Install in
  Projects..., the same picker, for a search result not installed there, and the picker lists every project itself
  when All Projects is not selected) showing where the package is already installed. A bulk install shows no preview, so it
  leaves out every Central Package Management project where the package already has a central entry (N76): the main
  panel's picker asks `cpm/preview` per CPM project when it opens and lists such a project as "centrally managed"
  (or "preview failed") without a checkbox to tick; the sidebar asks the same after the QuickPick and names the
  projects it left out. Installing there is a single install from that project, which shows the preview. A project not
  yet listed, or whose list could not be read, cannot be picked.
- Transitive dependencies aggregate into one group row, loaded lazily when it is first expanded.
- With ≤ 1 project the mode is automatically downgraded to that project (host normalization).

## 4. State vocabulary (every list/detail area uses exactly these)

Every screen defines each state below that can occur on it, with a marker (§8) and a named capture.

| State | Visual | Rule |
|---|---|---|
| **Loading (first)** | A 2 px indeterminate progress bar along the top edge of the region that waits (a list, a section, the details pane, the README); no skeleton; the live region announces the load once. Browse results show their rows as soon as the search answers, under the same bar, and each row's icon and authors fill in as the metadata arrives (round 2, F3a; MB3, X23, X34); every other region shows no rows until its data is there | Only when there is no previous data for the key. The bar shows where the work is, never in a shared place, and stays until the last part of the region has arrived. |
| **Revalidating** | Existing rows stay under the same 2 px bar; the list is `aria-busy` | When a displayed resource was invalidated and is being recomputed. Never blank the list; a provisional answer never replaces rows already shown (X7). |
| **Provisional** | A "Provisional" badge on the group row or pane header it applies to (each All Projects project row, the main panel's Direct packages row, the sidebar's Installed pane header), at the end inset, never over a border; its tooltip explains that the evaluation is pending | `fidelity: 'provisional'`. Actions remain enabled except for `unresolved` packages. |
| **Unresolved** | Version cell shows "unresolved" with tooltip; row actions disabled | `declaration: 'unresolved'`; excluded from update checks. |
| **Centrally managed** | "CPM" badge on the row; version cell shows central version | `declaration: 'central' \| 'central-override'`. An update of a `central` row shows the projects it affects first (main panel, the details button and Ctrl+Enter: dialog; the actions menu on either surface: VS Code's modal); a `central-override` row updates in its project alone without a preview (its badge says so) and joins Update all; an uninstall removes the project's reference only and keeps the central entry (ADR-004), without a CPM dialog. |
| **Pending op** | The row's actions give way to a spinner and the row is `aria-busy`; in the details pane the buttons are disabled and the running one reads "Installing", "Updating" or "Uninstalling" | From the moment the action is taken (the `ops/*` call, or `ops/progress` with `queued` or `running` for an operation the host started) until the terminal outcome. |
| **Succeeded op** | In place: the row and the pane show the new state (the version, the button label, the row leaving or joining a list); the live region announces it; the status bar item shows the operation while it runs | No toast for a single operation (D50, round 1). A bulk operation shows a progress notification (N of M) while it runs and a summary toast. |
| **Partial / failed op** | Warning toast (VS Code notification) with Show output, the output channel revealed on failure, + row returns to its real state after invalidation | Never leave optimistic state on failure. |
| **Stale selection** | Details header shows the project the selection belongs to; actions disabled until re-validated | When the active project changes while a package is selected, the details panel keeps its content but becomes read-only until the new installed data confirms the package (then it re-enables) or clears it (package not in new project). |
| **Empty** | Welcome-style, as the workbench's empty views: one sentence at the region's content inset, start-aligned, ending with a period, and at most one button under it; never centred | e.g. "No packages installed.", "No updates available.", "No results for "x"." |
| **Offline / sources unreachable** | Warning banner at the top of the affected list with "Retry" | `sourcesUnavailable: true` on updates/search; never render as "no updates". |
| **Unsupported project** | Banner "Unsupported project: <reason>." in place of the list; a project below SDK 10 keeps its read-only list under the banner | From `InstalledResult.unsupported`. |
| **Error** | Inline in the region: an error icon, one sentence and "Retry"; details also logged to the output channel | Any error response. Progress always clears. A rendering error in a view shows the error state ("Something went wrong in this view.") with Reload and is reported to the host as `ui/reportError`. |

Every disabled control and row action says why: its tooltip and its accessible description name the reason ("Select
packages to uninstall.", "An operation on this package is running.", "Unsupported project: requires .NET SDK 10 or
newer."). Motion is short (100 to 150 ms, ease-out) and stops entirely, progress bar and spinners included, when
VS Code's reduce-motion setting or the system's is on.

Copy: labels and menu items are Title Case ("Select All", "Uninstall Selected", "Copy Package ID"); messages are
sentences in sentence case that end with a period; a label–value pair has no colon; a command that opens more UI ends
in "..."; each surface writes counts one way.

## 5. Actions and confirmations

| Action | Where | Confirmation |
|---|---|---|
| Install / Update to version | Details panel button; the row's hover/focus action; Ctrl+Enter on a Browse or Updates row; the actions menu | None. Progress shows on the row and in the pane where it started; success shows in place (§4). |
| Uninstall (single) | Details button, row action, the Delete key on an Installed or Updates row, the actions menu | The Delete key asks first, as the Explorer's Delete does: "Uninstall <id> from <project>?" with Uninstall, Cancel and "Do not ask me again". The button, the row action and the menu item name the action and do not ask. |
| Bulk update / bulk uninstall | Updates/Installed toolbar; the sidebar's Updates header (Update all) | In-panel **Dialog** listing the packages (and projects in All Projects) with Confirm/Cancel; then a progress notification (N of M) and a summary toast. Whether the sidebar keeps the in-panel dialog or uses VS Code's modal, as its central updates do, is ruled in the sidebar phase (X9). |
| CPM central change | Any update of a `central` package, or an install of a package that already has a central entry in a CPM project | Main panel details button and Ctrl+Enter: the pane asks `cpm/preview` first and opens the **Dialog** (`cpm-preview-dialog`) only when an entry exists, listing the projects the central version applies to; choice: *Update Central Version* / Cancel. The actions menu, on either surface: VS Code's modal listing the same projects. *Override in this project only* is not offered: no `dotnet` command writes a `VersionOverride` (ADR-003); an existing override updates in place from the Updates lists and the details pane. An uninstall of a central row needs no CPM confirmation (the central entry stays). |
| Remove source | Source settings | In-dialog confirm row (existing pattern). |
| Restore project(s) | Transitive banner | None. Whether Restore becomes a command, a menu item or a header button is a feature-phase decision (X39). |

Terminology: UI says **Install / Update / Uninstall / Restore**. Protocol uses `remove`.

**The actions menu** is VS Code's own context menu for webviews, on both surfaces (ADR-013): right-click on a row,
Shift+F10 or the ContextMenu key opens it at the row. Its items follow the row: a Browse row offers Install Latest
Version and Install Version..., or, when the package is installed in the project, Uninstall and Change Version...; an
Installed row offers Change Version... and Uninstall; an Updates row offers Update to Latest Version (not for a
floating or range version), Update to Version... and Uninstall; every package row offers Copy Package ID; a sidebar row
also offers View Package Details. Items act on the row's project (under All Projects, the project of the row's
group). A command started from the menu marks its row busy on both surfaces from the moment it is queued.

Keyboard: every pointer action is reachable by keyboard, and each list names its keys in a visually hidden sentence
it is described by (`aria-describedby`). A flat list (Browse, the quick-search suggestions) is a `role="listbox"` whose rows are `role="option"`; a grouped list is a `role="tree"` whose rows, group rows and package rows alike, are `role="treeitem"` with `aria-level`, the group rows carrying `aria-expanded` (ADR-013 Decision 8); both have roving `tabIndex` (the active row has `tabIndex=0`). Each view is one grouped list (D-C, round 1): one tab stop and one
scroller per view (the main panel's visible tab or the Browse results; each sidebar pane), with group rows (the Direct
and Transitive groups, a target framework inside Transitive, a project under All Projects) and the package rows under
them. A group row names its group and its count, says whether it is expanded, and can be neither selected for a bulk
action nor written to. ArrowUp/ArrowDown move across group and package rows alike, Home/End jump to the first and last
row; moving changes the active row, not the selection.

| Key | Main panel | Sidebar |
|---|---|---|
| ArrowRight | On a collapsed group row: expands it; on an expanded one: moves to its first row; on a package row: nothing | The same |
| ArrowLeft | On an expanded group row: collapses it; on a package row or a collapsed group row: moves to its parent group row | The same |
| Enter | Package row: selects it and shows its details (Installed, Updates, Browse and transitive rows); group row: expands or collapses it | Package row: opens it in the main panel (round 1, §6), never a write; group row: expands or collapses it |
| Ctrl+Enter (Cmd+Enter on macOS) | Browse: installs the row's version (below); Updates: updates to the row's new version, or opens the preview dialog for a `central` row; Installed and transitive: nothing | Browse: installs the newest version; Updates: updates to the row's new version; on a `central` row it opens the actions menu instead; Installed: nothing |
| Delete (Cmd+Backspace on macOS) | Installed and Updates rows: uninstall, after the confirmation above | The same |
| Shift+F10, the ContextMenu key, right-click | The actions menu of the row | The same |
| Ctrl+DownArrow (Cmd+DownArrow) in the search box | Focus moves to the active row of the visible list (the tab's list, or the Browse results) | Focus moves to the active row of the first visible pane's list |
| Ctrl+UpArrow (Cmd+UpArrow) in a list | Focus returns to the search box | The same |
| Space, Ctrl+click, Cmd+click, a click on the check mark | In a list with bulk actions: the package row joins or leaves the bulk set | *(no bulk set)* |

A click on a group row toggles it, as Enter does.

ArrowLeft and ArrowRight belong to the group rows: in a list they never switch the details pane's tabs, so the 1.x
binding that moved between Details and README with them (MB18) is not restored. A tab strip keeps its own arrow keys
while focus is in it.

Row action buttons are pointer-only: they sit next to the option in a container
hidden from assistive technology (`aria-hidden="true"`, `tabIndex={-1}`), become visible on
`:hover` and `:focus-within` of the row, and clicking one keeps focus on the row. Outcomes are announced
through the one `role="status"` region (`status-live`). A row with a pending operation is
`aria-busy="true"`, its status text is part of its description and a spinner replaces its actions.
A disabled row (`aria-disabled="true"`, e.g. unresolved) keeps focus, selection, Enter and the context
menu but ignores Ctrl+Enter and Delete. When the active row disappears, focus moves to the
row now at its index (or the last one); when the list empties, the empty-state container takes
focus. A list that offers bulk actions is `aria-multiselectable`: the rows selected for them are `aria-selected`, and
the row whose details are shown is `aria-current`. Select All selects every row the action applies to; the
confirmation dialog lists exactly those rows. A dialog returns focus to the element that opened it; when that element
is gone or disabled (a bulk action that emptied its list), focus goes to the list's active row or to the toolbar's
first enabled control, never to the page (A6).

Main panel Ctrl+Enter (D16). In the Browse list Ctrl+Enter (Cmd+Enter on macOS) installs the row's version, the
newest the search found under the prerelease setting, into the selected project with the row's source, and makes the
row current; Enter only shows the details. In the search box, with a suggestion highlighted, Ctrl+Enter installs its
newest version, asked of the suggestion's source under the prerelease setting; ArrowRight lists its five newest
versions, ArrowUp and ArrowDown move through them, Enter shows the details at the highlighted version, Ctrl+Enter
installs it, ArrowLeft returns to the suggestions. Both take the Install button's route: an install into a Central
Package Management project asks `cpm/preview` first and opens the preview dialog when the package has a central entry
(N77); the package is busy from the key press. Ctrl+Enter installs nothing, and the live region says why, under All
Projects or without a project, while the selected project's packages are not listed yet, when the package is installed
already, or while an operation on it runs; under All Projects a Browse row's Ctrl+Enter makes it current so the pane
offers Install... with the project picker. In the Updates list Ctrl+Enter updates the row to its new version under the
same rules; the Installed list has no Ctrl+Enter action.

## 6. Cross-surface behaviour

- An operation started in either surface shows progress in both (`ops/progress`), from the moment it is
  queued, and both re-query the affected resources after `resources/invalidated`.
- Manual refresh (header button / sidebar title-bar refresh) issues `refresh/all` once; both
  surfaces revalidate (no blanking).
- View Package Details on a sidebar row opens the main panel at that row: an Installed row opens the Installed tab of
  the row's project with the row selected and its details shown, an Updates row the Updates tab, and a Browse row
  runs an exact Browse search for the id and selects it (`ui/navigateToPackage`: the search box is filled with the
  id, browse mode runs, the package is selected and the Details tab shows). The actions menu reaches the right tab
  through the row's context and `ui/selectProject`; a key on the row carries only the id (`ui/viewPackage`) and lands
  in Browse until the UX plan's contract item adds the project to that request. Open Full Manager only reveals the
  panel.
- Source settings open in the main panel (`ui/openSourceSettings`) even when triggered from the
  sidebar.

## 7. Details panel

The pane is laid out like an editor: its content starts at a 20 px inset, the package title is 18 px semibold, and
the header stays in view while the Details and README content scrolls under it. The header holds the title, the
installed version with Uninstall, and the version selector with the primary button; when it does not fit, it wraps,
labels with their values first and the buttons on their own line.

Tabs (`role="tablist"`) sit in a 36 px strip whose labels start at the title's x: **Details** (the description, then a
property list: Version, Authors with the Verified mark, License, Downloads, Package size, Date published, Project URL
and, for a nuget.org package, Report Abuse; labels in one column, values in a second, aligned column, no colons;
vulnerabilities with severity **text + icon**; dependencies per target framework, collapsed with their counts),
**README** (rendered Markdown, sanitized, in the Markdown preview's type scale; images fetched host-side; code blocks
with a copy button that shows Copied for two seconds; "No README available." empty state; failure shows an inline
Retry). Version dropdown (`version-selector`) lists versions with "(installed)" marker; the primary button reads
**Install** / **Update** / **Downgrade** / **Uninstall** depending on the selection vs installed version. Loading of
versions/metadata/README is per selection and shows the 2 px bar at the top of the pane or the README; a response for
a different package/version is ignored.

In a single project of a workspace with several, a search result not installed there also offers **Install in
Projects...** (`multi-install-button`), the picker of §3.

The pane shows the selection of the active view: Installed (direct and transitive rows), Updates or Browse. Each tab
keeps its own selection and gets it back when it is shown again; Browse starts without one and shows the empty state
("Select a package to see its details.") until a row is current, and a new search whose results lack that row clears
it.

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
| `installed-list`, `updates-list`, `browse-list`, `sidebar-installed-list`, `sidebar-updates-list`, `sidebar-browse-list` | Lists (a grouped list, such as the main panel's Installed list, is a tree) |
| `package-row-<id>` | A row (id lower-cased): the wrapper around the option and its pointer actions; the option is the `role="option"`, or in a tree the `role="treeitem"`, inside it (read `aria-selected` there; in a multi-selectable list `aria-current` marks the current row) |
| `row-action-<name>` | A pointer action button inside a row (`install`, `update`, `uninstall`); hidden from assistive technology, mirrored by the keys of §5 |
| `section-header-<name>` | The toggle button of a collapsible section (`installed`, `updates`, the sidebar's two and the Updates tab's projects until their lists become trees); in a group row, the title inside the treeitem, with no button, named by the group's id |
| `section-header-transitive-<tfm>` | The title inside one target framework's group row under Transitive (a project with several) |
| `package-details-panel`, `details-tab-details`, `details-tab-readme`, `readme-content`, `readme-empty`, `transitive-details` | Details panel |
| `version-selector`, `install-update-button`, `uninstall-button` | Details actions |
| `select-all-button`, `update-all-button`, `uninstall-selected-button` | Bulk toolbar |
| `transitive-restore-banner` | Transitive |
| `source-settings`, `source-settings-modal`, `add-source-panel`, `source-row-<name>`, `source-health-indicator` | Sources (`<name>` = source name lower-cased; the indicator shows while a source is unreachable) |
| `confirm-dialog`, `confirm-dialog-confirm`, `confirm-dialog-cancel` | Dialog primitive |
| `status-live` | `role="status"` live region |
| `sash` | Split sash |
| `main-header` | The main panel's header bar (title, check boxes, selectors, gear, refresh): its insets, height and wrapping are measured on it |
| `installed-toolbar`, `updates-toolbar` | The bulk toolbars of the Installed and Updates tabs: their start and end edges are measured against the list's (V2) |
| `section-box-<name>` | The box of a section header (chevron, title, count, badges, actions), one per `section-header-<name>` with the same `<name>`, and the heading of each Required by block of the details pane (`required-by-<framework or project>`, which has no toggle); it carries `data-variant`: `pane` (sidebar sections), `group` (a project or framework group in a list) or `level` (a nested level such as a target framework). Its top and bottom gaps (V4) and its badges' end inset (V3) are measured on it |

State markers (§4) and layer roots:

| Test id | Element |
|---|---|
| `sidebar-installed-empty`, `sidebar-updates-empty` | Empty state of a sidebar list |
| `sidebar-installed-error` | Error state of the sidebar's installed list |
| `updates-unavailable-banner`, `sidebar-updates-unavailable`, `browse-unavailable-banner`, `sidebar-browse-unavailable` | A source could not be read (updates, search) |
| `sidebar-unsupported` | Banner of a project the 2.0 surfaces cannot change |
| `sidebar-installed-provisional` | The "provisional" badge of the sidebar's installed section |
| `cpm-preview-dialog`, `cpm-preview-confirm`, `multi-install-dialog`, `multi-install-button` | Dialog roots (central package management preview, install into several projects), the preview's *Update Central Version* button and the details pane's *Install in Projects...* |

All Projects (§3; `<name>` = project name lower-cased):

| Test id | Element |
|---|---|
| `updates-list-<name>` | A project's list in the main panel's Updates tab, until UX-P3.1b makes it a group row |
| `group-row-<id>` | The wrapper of a group row in a grouped list, one of three hooks on one row: this wrapper, `section-box-<id>` (its header box, measured) and `section-header-<id>` (its title); the state and the keys are on the `role="treeitem"` inside the wrapper; the id is the group's: direct, project-<name>, folder-<folder>, transitive, transitive-<tfm> |
| `sidebar-installed-list-<name>`, `sidebar-updates-list-<name>` | A project's list in the sidebar, until UX-P3.7c and UX-P3.7d make them group rows |
| `sidebar-update-all-button` | Update all in the sidebar's Updates header |
| `section-header-project-<name>`, `section-header-updates-<name>` | The title of a project's group row (Installed); the toggle of a project's section (Updates) |

Attributes of the document element of both webviews, which the host writes in `renderWebviewHtml` (so no webview file renders them and they are no table row): `data-look` (`modern` or `classic`), `data-density` (`default` or `compact`) and `data-uppercase-headers` (present when the host capitalises view headers) (ADR-011). The harness reads the look of a capture here. Every icon carries `data-codicon` with the name of its drawing (`src/webview/shared/primitives/icons.tsx`, generated).

Removing or renaming a hook requires updating this table and the ExTester tests in the same change.

A hook enters a table when a test outside its component reads it (ExTester, e2e, harness), or when it marks a
documented state (§4) or the root of a layer; adding one needs no consultation. Names listed in parentheses after a
pattern hook are the ones the product renders. `src/test/lint/interaction-model-testids.test.ts` fails for a hook in
these tables that no 2.0 webview file renders, and for a listed name that is not rendered with its pattern's prefix.
The per-project list hooks above leave with the items that make their lists trees; the note under §8.1 says which.

### 8.1 Hooks added by the UX plan (not yet rendered)

<!--
Why this table has a different shape: interaction-model-testids.test.ts (hooksOf) reads every line of §8, up to the
next level-two heading, that starts with "| `" and fails for a hook that no 2.0 webview file renders. A level-three
heading does not end §8 for it. The rows below therefore start with the plan phase, not with a backticked hook, so the
lint skips them while nothing renders them. The item that renders a hook moves its row into the tables above, with
the hook in the first column, in the same change; from then on the lint holds it.
-->

These hooks are the ones the UX overhaul's harness and tests will read. Each row names the phase of the UX execution
plan whose item renders it; that item moves the row into the tables above, hook first, in the same change. `<name>`
is a project or section name lower-cased, as above.

| Added by | Test id or attribute | Element |
|---|---|---|
| Installed slice | `section-box-<name>` with `data-variant` `pane` under `data-look` `modern` | The Modern UI header: a pane-style section header at 28 px with a 12 px semibold title, the hover tint and rounded corners; the same box is 22 px with an 11 px bold uppercase title under `classic` |
| Installed slice | `data-vscode-context` on `package-row-<id>` | The context-menu anchor on both surfaces: the row wrapper's context object (`webviewSection` = `installedRow`, `updateRow`, `browseRow` or `transitiveRow`, the row's ids and versions, `preventDefaultContextMenuItems`), which the menu items' `when` clauses read (ADR-013) |
| Installed slice | `confirm-dialog-do-not-ask` | The "Do not ask me again" check box of the Delete key's confirmation |
| Installed slice | `installed-progress`, `installed-empty`, `installed-error`, `installed-unsupported`, `installed-provisional` | The Installed tab's 2 px progress bar (loading and revalidating), empty state, inline error, unsupported banner, and the provisional badge of the Direct packages header |
| Installed slice | `installed-progress-<name>`, `installed-empty-<name>`, `installed-error-<name>`, `installed-unsupported-<name>`, `installed-provisional-<name>` | The same markers for one project's section under All Projects |
| Installed slice | `transitive-progress`, `transitive-empty`, `transitive-error` | The transitive section's progress bar, empty state ("No transitive dependencies.") and inline error |
| Updates | `updates-progress`, `updates-empty`, `updates-error` | The Updates tab's progress bar, empty state and inline error |
| Browse and details | `browse-progress`, `browse-empty`, `browse-error` | The Browse results' progress bar, empty state ("No results for "x".") and inline error |
| Browse and details | `search-suggestions-loading`, `search-suggestions-empty`, `search-suggestions-error` | The quick-search popup's loading row, no-results row and error row |
| Browse and details | `details-header`, `details-tab-bar` | The details pane's header (its 20 px inset is measured on it) and its 36 px tab strip |
| Browse and details | `details-progress`, `details-empty`, `details-error`, `details-readonly`, `readme-progress`, `readme-error` | The details pane's progress bar, empty state ("Select a package to see its details."), inline error, the read-only note of a stale or unsupported selection, and the README's progress bar and inline error |
| Sources | `source-settings-progress`, `source-settings-empty`, `source-settings-error` | The source settings dialog's progress bar, empty state and inline error |
| Sidebar | `sidebar-installed-progress`, `sidebar-updates-progress`, `sidebar-browse-progress` | The 2 px progress bar of each sidebar list (loading and revalidating) |
| Sidebar | `sidebar-updates-error`, `sidebar-browse-empty`, `sidebar-browse-error` | The sidebar's missing state markers: the Updates error and the Browse empty and error states |

**Hooks that change with the grouped list** (D-C, round 1). A grouped list has one id, the view's, and every group in it is a row with the three hooks of the `group-row-<id>` row above. The Installed tab has been one since UX-P2.1d and UX-P2.1e: `installed-list-<name>`, `transitive-list` and `transitive-list-<tfm>` have left. UX-P2.1f reconciled the three hooks and moved the readers of a row to `.nuiget-row-option`, which holds in a listbox and in a tree. The per-project ids still in the table, `updates-list-<name>` and `sidebar-*-list-<name>`, name real listboxes until their lists move: `updates-list-<name>` becomes `group-row-project-<name>` at UX-P3.1b, `sidebar-installed-list-<name>` at UX-P3.7c and `sidebar-updates-list-<name>` at UX-P3.7d, each with its readers in that change.

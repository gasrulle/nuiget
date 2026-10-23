# ADR-013: Keyboard and menus: Enter never writes; one native actions menu on both surfaces

Status: accepted · Date: 2026-10-23 · Decision 7 (success feedback) supersedes the 2.0 plan's D17: the owner confirmed
it in design round 1 (D50). Decision 1's sidebar Enter is the owner's round-1 pick (D-D).

## Context

The research of 2026-10-23 (`docs/research/2026-10-23-ux-research.md`, §7, §9 and §14) found the keyboard and menu
model of 2.0 at odds with both the interaction model and the workbench:

- **Enter writes.** Enter uninstalls on a sidebar Installed row, installs on a sidebar Browse row and updates on a
  main-panel Updates row (single project and All Projects), each without confirmation (A1, A2, X13); the README
  documents the main-panel case. In the Extensions view, the named exemplar, Enter opens the item.
- **Delete is unconfirmed.** Delete (Cmd+Backspace on macOS) uninstalls at once on both surfaces, and only in the
  Installed lists, although the sidebar's menu offers Uninstall on an update row too (X14). The Explorer's Delete asks
  first and offers "Do not ask me again" (`explorer.confirmDelete`, present at 1.85).
- **No main-panel menu.** The main panel's Installed hint promises Shift+F10, but no main list has a menu (X1, X12,
  X18, A3). `Listbox` calls `preventDefault` on every `contextmenu` event, which also suppresses VS Code's native
  webview menu: the 1.85 webview bootstrap returns early on a prevented event (H14). The sidebar's menu is a host
  QuickPick reached through `ui/contextMenu`.
- **The native route exists at the floor.** `contributes.menus["webview/context"]` works for webview panels and webview
  views at 1.85, so at the 1.90 floor (ADR-011). Items are filtered by `when` clauses on `webviewId` and on the keys
  of the `data-vscode-context` attributes of the clicked element and its ancestors; the command receives that merged
  object plus a `webview` field naming the view type. No protocol change is needed (H14).
- **Queued host operations look idle.** An operation started on the host (a native menu, the palette) runs through the
  operations route and `settleOperation`, as the sidebar's menu does today; the queue reports progress for running
  workflows only, so the row is not busy while the operation waits (X25). `OperationStatus` already has `queued`.
- **Success is reported three times**, four for a bulk run: the status bar item, an information toast, the live
  region, and the progress notification for bulk (X40, X8). The workbench confirms an extension install in place
  with an accessible alert and keeps toasts for bulk results; the notification guideline asks for notifications only
  when necessary. The 2.0 plan's D17 chose a toast per success.
- **No bridge between the search box and the lists** (SB7). The Extensions view moves focus from its search box to
  its list with Ctrl+DownArrow (Cmd on macOS).

## Decision

1. **Enter never writes.** On every list Enter opens or selects the row. In the main panel it selects the row and
   shows its details (Installed, Updates, Browse and transitive rows; the Updates list changes from update to
   details). In the sidebar, which has no details pane, Enter opens the row in the main panel (the owner's round-1
   pick, D-D; the sidebar's Ctrl+Enter of 2.0). It is never a write, a central row included. A disabled row
   (unresolved) still takes Enter, since Enter writes nothing. On a group row of the grouped list (Decision 8) Enter
   expands or collapses the group.
2. **Writes have three routes.** *Ctrl+Enter* (Cmd+Enter on macOS) runs the row's write: a Browse row installs its
   version (the 2.0 path of D16, unchanged); an Updates row updates to the row's new version; Installed and transitive
   rows have none. On a central row the key never writes directly: in the main panel it opens the CPM preview dialog,
   in the sidebar it opens the actions menu (Decision 4). *Delete* (Cmd+Backspace on macOS) uninstalls an Installed or
   an Updates row. *The actions menu* offers every write of the row. The row's pointer action buttons stay, mirrored by
   these keys (the listbox contract of ADR-008). Every key is named in the hint of the list it works in.
3. **Delete confirms, like the Explorer.** The key opens a confirmation: "Uninstall <id> from <project>?" (under All
   Projects, the row's project), Uninstall and Cancel, opening on Cancel as every `ConfirmDialog` does, and a "Do not
   ask me again" check box. The Uninstall button, the row action and the menu item, which name the action, do not
   confirm (the Extensions view's Uninstall does not either). The preference is one value for both surfaces and
   survives reloads, so it is a contributed boolean setting (the Explorer's pattern, default on, reset in the Settings
   editor) that the webviews receive through `ExtensionConfig` and that the check box writes through a host request.
   Both are contract additions of the UX plan's contract item (sentinel procedure). If that item is cut, the
   confirmation ships without the check box.
4. **One actions menu, native, on both surfaces.**
   - `package.json` contributes `menus["webview/context"]` items for `webviewId == 'nugetManager'` (the main panel)
     and `webviewId == 'nuiget.sidebarView'` (the sidebar), each item shown by a `when` clause on the row's
     context keys: `webviewSection` (the row kind: Installed, Updates, Browse or transitive row) and the facts the
     sidebar's QuickPick decides on today (installed version, latest version, central, floating or range). The
     commands are hidden from the palette and carry Title Case titles.
   - The row wrapper (`role="presentation"`, test id `package-row-<id>`) carries `data-vscode-context`: those keys,
     the ids the command needs (package id, project path, versions; the fields `ContextMenuRequest` carries today) and
     `preventDefaultContextMenuItems: true`. A `data-*` attribute is what the wrapper may carry (the gotcha "Attributes
     on the row wrapper").
   - `Listbox` stops calling `preventDefault` on `contextmenu`, so a right-click reaches VS Code's handler. For
     Shift+F10 and the ContextMenu key it dispatches a synthetic `contextmenu` event on the active row's wrapper at the
     row's position, so the menu opens at the row; it handles the event in no other way.
   - The commands run on the host through the operations route and `settleOperation`, as the sidebar's menu does
     today. A central-row update, or an install into a project whose central file already has the package, confirms
     with the host's modal listing the projects the preview names, on both surfaces. The main panel's details button
     and its Ctrl+Enter keep `CentralUpdateDialog`; both list the same projects from the same preview. Making them one
     needs a host-confirmed request behind the sentinel (X9) and is not part of this decision.
   - The sidebar's QuickPick menu migrates to the contribution in the same item, because `Listbox` serves both
     surfaces. `ui/contextMenu` stays in the frozen protocol, unsent, until a contract item removes it.
   - The item that ships the menu proves the right-click and Shift+F10 paths in the E2E job at the floor (1.90.0).
5. **Queued operations are busy on every surface.** The host merges a progress emitter with the queue's progress and
   fires `ops/progress` with status `queued`, `projectPaths` and `packageIds` for every operation it submits itself.
   The webviews mark a row busy from it as they do for a running operation. No contract change.
6. **Search and list are one keyboard path.** Ctrl+DownArrow (Cmd+DownArrow on macOS) in a search box moves focus to
   the active row of the list the box drives (the visible tab's list or the Browse results; in the sidebar, the first
   visible pane's list). Ctrl+UpArrow (Cmd+UpArrow) in that list returns focus to the search box. Inside an open
   suggestion list the arrows keep their 2.0 meaning.
7. **Success shows in place** (D50, decided by the owner in round 1; it supersedes the 2.0 plan's D17). A single
   operation that succeeds raises no toast: its row and the details pane change where the user acted (the version,
   the button label, the row leaving or joining a list), the live region announces the outcome, and the status bar
   item shows the operation while it runs. Failures and partial results keep their warning toast with Show output, a
   bulk run keeps its progress notification and its summary toast.
8. **One grouped list per view, keyed like the workbench's trees** (D-C, the owner's round-1 pick, composition A).
   Sections and projects are group rows of one listbox: one tab stop and one scroller per view (the main panel's
   visible tab or the Browse results; each sidebar pane, which stays a pane and groups its rows per project under All
   Projects). ArrowUp and ArrowDown cross groups. ArrowRight expands a collapsed group row and moves from an expanded
   one to its first row; ArrowLeft collapses an expanded group row and moves from a package row or a collapsed group
   row to its parent group row. Ctrl+Enter, Delete and the bulk set apply to package rows only. Because ArrowLeft and
   ArrowRight belong to the group rows, the 1.x binding that switched the details pane between Details and README with
   them (MB18) is not restored; a tab strip keeps its own arrow keys while focus is in it. The per-section and
   per-project lists of 2.0 are retired.

## Consequences

- `package.json` `contributes` grows: commands, `menus["webview/context"]` and `commandPalette` entries that hide the
  commands. The UX plan schedules this in the menu item, since a `contributes` change is a stop-and-ask otherwise.
- Static menu titles cannot carry a version: the QuickPick's "Update to 3.1.0" becomes "Update to Latest Version".
- Tests that assert a write on Enter are rewritten in place by the items that change the bindings, and named in their
  STATUS; the README's keyboard section and the interaction model's §5 change with them. The change is recorded for
  users under `### Changed` as a breaking change.
- The native menu is VS Code's own and keyboard accessible; jsdom cannot open it. jsdom tests cover the webview's
  half (the `data-vscode-context` content, no `preventDefault`, the synthetic event on Shift+F10); ExTester and the
  E2E job at the floor cover the menu itself.
- Gotcha rows change with the items: "Central row without the preview" (the menu route and the host modal on both
  surfaces), "Context menu under All Projects" (the context object, not `ui/contextMenu`), "An operation that waits in
  the queue has no `ops/progress`" (Decision 5) and "Buttons inside `role="option"`" (the key list).
- The UX plan's contract item carries, besides ADR-011's look fields: the delete-confirmation setting in
  `ExtensionConfig` and the request that writes it (Decision 3), the project on `ui/viewPackage` for precise
  navigation from a sidebar row, and the removal of `ui/contextMenu`.
- Decision 7 removes the single-success toast from `src/host/feedback.ts` and the captures that show it; the item
  rewrites the tests that assert that toast in place and names them. Decisions 1 to 6 do not depend on it.
- Decision 8 rebuilds `Listbox` with group rows and moves its eight consumers onto one list per view (the research
  costs it at about seven planned days, the Updates merge included); the per-project list hooks of the interaction
  model's §8 become group-row hooks in the same item (P2.1f). The listbox contract of ADR-008 (always virtualized,
  one tab stop) then holds for the Installed tab again, which today mounts every row.
- The sidebar's Enter sends the row to the main panel through `ui/viewPackage`, which carries only the id: it lands
  in Browse until the contract item adds the project (above); the menu's View Package Details lands on the right tab
  without it.

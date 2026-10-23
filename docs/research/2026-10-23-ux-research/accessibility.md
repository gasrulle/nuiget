# Accessibility audit of the nUIget 2.0 webviews (research sweep, 2026-10-22)

Dimension: accessibility. Tree: `main` at `e4d6e97` (read-only). Ledger letters: **A** (defects, gaps) and **H**
(harness proposals). The manual screen-reader pass (plan P7.4) stays **out of scope**: the owner skipped it on
2026-10-16 and deferred it to 2.0.1 (`docs/plans/STATUS.md:106`, plan `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:519`).
This report proposes automated substitutes; it does not replace the pass. Every claim cites `path:line`, a fetched
source or a command; anything else is marked **hypothesis**.

Scratch artefacts (outside the repository, all under the session scratchpad):

- `a11y-probe/axe-log-setup.ts`, `a11y-probe/vitest.a11y.mts`: a Vitest config that runs the repository's frontend
  tests unchanged and logs every axe rule outcome; `a11y-probe/axe-log.jsonl` (60 runs) and `a11y-probe/axe-analysis.txt`.
- `a11y-probe/installed-focus.probe.test.tsx`, `a11y-probe/updates-focus.probe.test.tsx`, `a11y-probe/focus.probe.test.tsx`:
  focus-restoration probes on the real `InstalledTab`/`UpdatesTab` in jsdom.
- `a11y-probe/contrast.mjs`, `a11y-probe/syntax.mjs`: contrast computed from VS Code's default theme JSON and colour
  registry, fetched into `a11y-probe/vscode-src/`.

---

## 1. Answer first

| # | Letter | Severity | Finding | Decision-relevant |
|---|---|---|---|---|
| 1 | A | medium | **Focus falls to `<body>` after confirming a bulk action.** `restoreFocus` (`layers.ts:53-59`) returns focus to the opener only; the opener ("Uninstall selected (n)", "Update all (n)") is disabled by the same update, so focus is lost. Verified on the real `InstalledTab` and `UpdatesTab` in jsdom. | no (primitive fix) |
| 2 | A | medium | **Enter is destructive in two lists, against the workbench and §5.** Sidebar Installed: Enter uninstalls at once (`ProjectPackages.tsx:91`); 1.18.9 bound Enter to nothing there (`0457c75:src/webview/sidebar/SidebarApp.tsx:1509-1515`, Delete only). Main Updates: Enter updates (`UpdatesTab.tsx:185`, `AllProjectsUpdates.tsx:106`), while interaction model §5 says main-panel Enter "selects it and shows its details" (`docs/ux/interaction-model.md:94-95`). | **yes** (keyboard map) |
| 3 | A | medium | **The main panel has no actions menu, but its Installed hint says "Shift+F10 opens the actions menu."** (`InstalledProjectSection.tsx:40`). No main-panel list passes `onContextMenu` (grep), the host answers `ui/contextMenu` only in `SidebarHost.ts:27`, and the protocol marks it `// sidebar` (`src/protocol/messages.ts:173`). The Listbox also swallows a right-click on any row (`Listbox.tsx:218-224`, `preventDefault` before the optional callback). | **yes** (protocol/host or doc change) |
| 4 | A | medium | **VS Code's own reduce-motion setting is ignored.** VS Code puts `vscode-reduce-motion` on every webview `body` when `workbench.reduceMotion` is `on` (or `auto` with the OS preference), already in 1.85.0; nUIget reacts only to `@media (prefers-reduced-motion: reduce)` (`tokens.css:226-231`), and the tokens lint pins that as the only selector (`src/test/lint/webview-tokens.test.ts:53,82-85`). | yes (lint pin changes) |
| 5 | A | medium | **The bulk-selection check box is drawn in a border colour that never reaches 3:1.** `.nuiget-row-check` (`primitives.css:128-137`) uses `--nuiget-color-border` (widget.border ⟶ panel.border): 1.26–1.48:1 against the editor and 1.03–1.11:1 against the selection in all six non-HC default themes (computed). VS Code's own `checkbox.border` reaches 3.64–3.76:1 in the 2026 themes. | no |
| 6 | A | medium | **README syntax colours are icon and debug colours, not text colours.** `--nuiget-color-syntax-type` (symbolIcon.classForeground) measures 2.55–2.89:1 on the code block in Light Modern, Light 2026 and Light High Contrast; variable and number 3.75–4.33:1 (computed). The theme pass never measures the README (`theme.ui.test.ts:162-169` accepts "incomplete" inside the details pane). | no |
| 7 | A | low | **The new-version colour falls below 4.5:1 on a hovered row** in the light themes: 4.36 (Light Modern), 4.09 (Light 2026), 3.98 (Light+) (computed). `tokens.css:118-121` quotes the ratios on the editor background only; the theme pass never hovers. | no |
| 8 | A | medium | **The main panel announces no first load** (Installed, Updates, Browse, details, README): only an `aria-hidden` skeleton. §4 requires `role="status"` "Loading …" (`interaction-model.md:65`); the sidebar does it (`SidebarView.tsx:136-139`). Widens parity gap MB19 (Browse only). | no |
| 9 | A | low | **An outcome may be announced three times:** the main panel's live region and the sidebar's both announce every outcome "on whichever surface it started" (`MainShell.tsx:139-146`, `SidebarView.tsx:110-117`), and the host's toast (`feedback.ts:96-105`) is read by VS Code's `NotificationsAlerts` (`alert()`, VS Code 1.85.0 `notificationsAlerts.ts:48-75`). Code paths verified; what a screen reader then speaks is a hypothesis for P7.4. | yes (who announces) |
| 10 | A | low | **No keyboard bridge between the search box and the lists, on both surfaces** (SB7 is open and scoped to the sidebar; the shared `SearchBox` handles ArrowDown only while its popup is open, `SearchBox.tsx:176-192`). In the main panel the list is the 12th tab stop. | yes (keyboard map) |
| 11 | A | low | **Listbox lacks keys the workbench lists have:** PageUp/PageDown, type-ahead, Shift+Arrow, Ctrl/Cmd+A, Escape (`Listbox.tsx:135-173` vs VS Code 1.85.0 `listCommands.ts:106-148,196-229,482-485,602-605,634`). | yes (keyboard map) |
| 12 | A | low | **Focus that lands on an emptied list is invisible:** `.nuiget-listbox-empty { outline: none }` (`primitives.css:67-69`) is the element `Listbox` focuses when its last row goes (`Listbox.tsx:110-112,178`). | no |
| 13 | A | low | **Links take Chromium's focus ring, not the theme's:** no nUIget focus rule for `<a>` (README, Details facts, `DetailsInfo.tsx:51,64,67,161`); VS Code's webview default is `outline: 1px solid -webkit-focus-ring-color` (`webview/browser/pre/index.html` 1.85.0 l. 117-121). | no |
| 14 | A | low | **README headings keep their Markdown level** (an `h1` under the pane's `h2`, `DetailsPane.tsx:161`; `markdown.ts` has no heading renderer). The workbench shows an extension README in its own webview document. | no |
| 15 | A | low | **The search combobox does not describe its hidden keys** (ArrowRight lists versions, Ctrl+Enter installs, `SearchBox.tsx:193-215`); the listboxes have a `hint` (`Listbox.tsx:192,247`), the combobox none (`SearchBox.tsx:308-331`). | no |
| 16 | A | low | **In Dark High Contrast a selected compact (sidebar) row has no selection mark** besides the focus ring: `list.activeSelectionBackground` is `null` for hcDark (VS Code `listColors.ts:33-35`), and nUIget draws selection only as that background (`primitives.css:105-110`); comfortable rows keep the 3 px accent. Hypothesis about the rendered result; the capture is ambiguous (hover). | no |
| 17 | A | low | **Multi Install: why a project cannot be picked is not tied to its check box** (`MultiInstallDialog.tsx:157-161`, note is a sibling span, no `aria-describedby`); a disabled check box is no tab stop, so a keyboard user never meets the reason. | no |
| 18 | H | — | **The jsdom axe suite runs 86 rules but decides only 41**, and the real webview runs exactly two (color-contrast, target-size). 45 rules are inapplicable in every jsdom run, including page-level and layout rules (document-title, html-has-lang, landmark-one-main, page-has-heading-one, scrollable-region-focusable); experimental rules (label-content-name-mismatch, focus-order-semantics) never run. | yes (what to measure) |
| 19 | H | — | Proposals H1–H8 (§8): ARIA-tree snapshots per named state via the axe-core already injected, full-rule axe per named state and per open layer, keyboard-path tests from §5 including focus-after-close, a reduced-motion test through `workbench.reduceMotion`, contrast in hover/open-layer/README states, an offline theme-contrast lint, and a rule-coverage ledger for the jsdom suite. | yes |

What is already good (do not regress): one tab stop per list with roving `tabIndex` (`Row.tsx:124`); row actions in an
`aria-hidden` sibling with a key for every one of them (§3.4, all six mirrored); a live region per surface that
re-announces identical messages (`LiveStatus.tsx:16-32`); dialogs with trap, Escape, restore, `alertdialog` for
confirmations and initial focus on Cancel (`Dialog.tsx:47-95`, `ConfirmDialog.tsx:26-41`); a theme pass in six
themes with zero contrast and target-size violations (`theme.ui.test.ts:234-253`); the HC focus colour on
`contrastActiveBorder` (`tokens.css:154-159`); severity in words, not colour (`Banner.tsx:16-30`, `Badge.tsx:14-25`).

---

## 2. Existing automated coverage

### 2.1 jsdom: jest-axe on components

Setup: `jest-axe@11.0.0` with `axe-core@4.12.1` (`npm ls axe-core jest-axe`). jest-axe disables the three
`cat.color` rules (color-contrast, color-contrast-enhanced, link-in-text-block) because jsdom cannot measure colour
(`node_modules/jest-axe/index.js:6,54-58`); every other rule enabled by default runs. `toHaveNoViolations` accepts
"inapplicable" and "incomplete" (`testSupport.ts:1-8`), which is why the repository pins chosen rules with
`axeRuleOutcome(…) === 'passes'` (`testSupport.ts:72-80`). `installFakeLayout` gives jsdom row boxes and an
`elementFromPoint` so `aria-hidden-focus` can decide (`testSupport.ts:25-67`).

Runs (read-only):

| Command | Result |
|---|---|
| `npx vitest run --project frontend src/webview/shared/primitives` | 20 files, 140 tests passed (2.27 s) |
| `npx vitest run --project frontend` | 59 files, 565 tests passed (7.59 s) |
| same files under the scratch logger config (`a11y-probe/vitest.a11y.mts`) | 59 files, 565 passed; **60 axe runs logged**, 0 incomplete in any run |

Explicit rule pins (`axeRuleOutcome(…) === 'passes'`), by file (grep `axeRuleOutcome` under `src/webview`):

| File | Rules pinned to "passes" | Line |
|---|---|---|
| `primitives/Listbox.test.tsx` | nested-interactive, aria-required-children, aria-hidden-focus; aria-allowed-attr, nested-interactive, aria-required-children; plus three negative controls that must be violations (nested-interactive, aria-required-children, aria-hidden-focus) | 291, 443, 312 |
| `primitives/Row.test.tsx` | aria-hidden-focus, nested-interactive (three renders) | 141-142, 192, 232-233 |
| `primitives/SectionHeader.test.tsx` | nested-interactive | 82 |
| `primitives/Dialog.test.tsx` | aria-dialog-name | 199 |
| `primitives/ConfirmDialog.test.tsx` | aria-dialog-name | 97 |
| `primitives/Popover.test.tsx` | aria-dialog-name | 254 |
| `primitives/composed.test.tsx` | nested-interactive, aria-required-children, aria-hidden-focus, heading-order; aria-dialog-name, heading-order, nested-interactive | 117, 136 |
| `search/SearchBox.test.tsx` | aria-required-children | 166 |
| `sidebar/SidebarView.test.tsx` | nested-interactive, aria-required-children, aria-hidden-focus | 452 |
| `sidebar/UpdatesSection.test.tsx` | aria-required-children; aria-dialog-name | 81, 180 |
| `main/features/details/DetailsPane.test.tsx` | aria-dialog-name (×2), label | 330, 467, 509 |
| `main/features/installed/InstalledTab.test.tsx` | aria-dialog-name, nested-interactive, aria-allowed-attr | 255 |
| `main/features/updates/UpdatesTab.test.tsx` | aria-required-children; aria-dialog-name (×3) | 76, 109, 141, 305 |
| `main/features/sources/SourcesControl.test.tsx` | aria-dialog-name | 189 |
| `main/features/updates/CentralUpdateDialog.test.tsx` | aria-dialog-name | 66 |

Primitives tested with `toHaveNoViolations` only (no rule pinned): IconButton (`IconButton.test.tsx:41`), Banner (56),
Sash (207), Spinner (26), Badge (29), ProgressBar (50), ErrorBoundary (40), Skeleton (25), icons (89, 92; 97-99 is a
live negative control for `image-alt`), LiveStatus (39), EmptyState (28), Toolbar (110), Tabs (99, 109). Every
component primitive has at least one axe run; `Popover` has tests but **no product consumer** (grep `Popover` under
`src/webview` finds only the primitive, its test, `index.ts:17` and `testSupport.ts:82`).

What the 60 runs actually decided (from `a11y-probe/axe-analysis.txt`): 86 rules seen, **41 passed in at least one
run**; the per-file "passes" set is tiny for the leaf primitives (Badge 1 rule, Skeleton 1, ErrorBoundary 2,
EmptyState 2, IconButton 8, LiveStatus 9). Rules that passed most often: nested-interactive (29 files), aria-roles
family (26), aria-hidden-focus (24), button-name (24), region (17), aria-required-children (15), heading-order (14),
label (14), aria-dialog-name (10).

**Never decided in jsdom (inapplicable in all 60 runs), relevant to these webviews:** document-title, html-has-lang,
html-lang-valid, landmark-one-main, page-has-heading-one, scrollable-region-focusable, presentation-role-conflict,
role-img-alt, aria-tooltip-name, aria-text, skip-link, frame-title. Disabled by default in axe 4.12.1 and never
enabled: target-size (enabled only in the real browser), color-contrast-enhanced, identical-links-same-purpose
(node probe over `axe._audit.rules`). Experimental, never run: label-content-name-mismatch (WCAG 2.5.3),
focus-order-semantics, hidden-content, p-as-heading, css-orientation-lock.

### 2.2 Real webview: the theme pass

`src/test/ui/v2/theme.ui.test.ts` injects `node_modules/axe-core/axe.min.js` into each webview (l. 40, 147-149) and
runs `runOnly: ['color-contrast', 'target-size']` with target-size enabled (l. 52-55), under six themes (l. 21-28),
in the main panel and the sidebar, with one row selected (l. 121-125, 186-191), after content and transitions settle
(l. 103-140). It asserts zero violations of both rules, at least 10 contrast passes per surface (l. 172-173), and
accepts "incomplete" only for color-contrast inside `package-details-panel` (l. 162-169). In HC themes it also checks
that buttons, tabs, the project select and check boxes draw `contrastBorder` (l. 216-232). The tracker records 50
(main) and 14 (sidebar) contrast passes per theme (`docs/plans/STATUS.md:83`).

What the theme pass never sees: a hovered row; an open dialog, popover or search popup; the README tab; the Browse
list; All Projects; the sidebar in browse mode; any rule other than the two. Target size is measured on the same two
default views only.

### 2.3 Lints that guard accessibility properties

| Lint | What it holds | Evidence |
|---|---|---|
| `webview-stylesheets.test.ts` | pointer targets ≥ `--nuiget-target-min` high (height only); sash hit area 24 px; every duration a token; no reduced-motion rule outside tokens.css | l. 60-67, 82, 94-95, 109-115 |
| `webview-tokens.test.ts` | one reduced-motion rule that zeroes both durations; tokens.css selectors limited to `:root`, the HC body pair, forced-colors and reduced-motion media | l. 53, 82-85 |
| `webview-colours.test.ts` | no colour literal outside tokens.css | gotcha table |
| `webview-css-baseline.test.ts` | no CSS newer than Chromium 114 | gotcha table |
| `interaction-model-testids.test.ts` | §8 hooks rendered | gotcha table |

No test checks keyboard order across a screen, focus after a layer closes (except the primitive tests: 20 focus
assertions in `Dialog.test.tsx`, 15 in `Popover.test.tsx`, 17 in `Listbox.test.tsx`; feature tests have 1 in
`CentralUpdateDialog.test.tsx:55`), the accessible tree of a real webview, or motion at runtime.

### 2.4 Coverage matrix (rule × where it is decided)

| Concern | jsdom component tests | Real webview (ExTester) | Nowhere |
|---|---|---|---|
| Roles, required children/parents, nested interactive, aria-hidden-focus, names of buttons/inputs/dialogs | yes (pinned in places) | no | — |
| Text contrast | no (disabled) | yes, default views, 6 themes | hover, open layers, README, Browse, All Projects |
| Non-text contrast (WCAG 1.4.11: focus ring, check box, borders) | no | no (axe has no rule) | **yes** |
| Target size | height lint only | yes, default views | open layers; the 12 px row check |
| Page-level (title, lang, main, h1), scrollable-region-focusable | inapplicable | no | **yes** |
| Label in name (2.5.3), focus order semantics | experimental, off | no | **yes** |
| Keyboard order and reachability per screen | per primitive | 5 keyboard steps (`main-shell.ui.test.ts:56-60`, `main-installed.ui.test.ts:149-194`, `sidebar-parity.ui.test.ts:79-102`, `main-updates.ui.test.ts:96,105`, `main-search.ui.test.ts`) | full tab order, dead ends |
| Focus after a layer closes | primitives | no | features (finding 1) |
| Live announcements | RTL text of `status-live` | no | what a screen reader speaks |
| Reduced motion | token lint | no | runtime, `vscode-reduce-motion` |
| Forced colours | token lint | not emulated (`theme.ui.test.ts:13`) | **yes** |

---

## 3. Keyboard reachability

### 3.1 Key maps of the primitives

| Primitive | Tab stops | Keys | Evidence |
|---|---|---|---|
| `Listbox` | 1 (active option, roving) | ArrowUp/Down, Home/End move; Enter → `onActivate`; Ctrl/Cmd+Enter → `onSecondaryActivate`; Delete or Cmd+Backspace → `onDelete`; Space toggles bulk selection (multi-select only); Shift+F10 / ContextMenu → `onContextMenu`; disabled rows ignore Enter, Ctrl+Enter, Delete, Space | `Listbox.tsx:135-173`, `Row.tsx:124` |
| `Row` | 0 of its own; actions `tabIndex=-1` in `aria-hidden` | a mouse-down on an action keeps focus on the option | `Row.tsx:104-108,159-163` |
| `Tabs` | 1 (selected tab) | ArrowLeft/Right wrap, Home/End; automatic activation | `Tabs.tsx:37-48,64` |
| `Toolbar` | 1 (last focused enabled control) | ArrowLeft/Right wrap, Home/End; in a text field only at the text edge | `Toolbar.tsx:35-83,96-109` |
| `Dialog` | trapped | Tab/Shift+Tab cycle; Escape closes (top layer only); focus-in outside is pulled back; restore on close | `Dialog.tsx:47-95`, `layers.ts:24-59` |
| `ConfirmDialog` | trapped | initial focus Cancel; `alertdialog` | `ConfirmDialog.tsx:26-41` |
| `Popover` (no consumer) | non-modal | Escape closes; Tab past either end closes and returns to anchor; outside press closes | `Popover.tsx:99-152` |
| `SearchBox` | 1 (input; Clear/Filters `tabIndex=-1`) | combobox with `aria-activedescendant`; ArrowUp/Down only while open; ArrowRight versions, ArrowLeft back; Enter picks or submits; Ctrl/Cmd+Enter quick install; Tab picks the active option; Escape closes, then clears, then blurs | `SearchBox.tsx:174-245,308-336` |
| `Sash` | 1 (`role="separator"`, `tabIndex=0`) | arrows ±step (Shift ×10), Home/End min/max, Enter default | `Sash.tsx:43-60,90-110` |
| `SectionHeader` | 1 (toggle button) + its actions | native button | `SectionHeader.tsx:38-55` |

### 3.2 Compared with the workbench lists (exemplar)

VS Code 1.85.0 `src/vs/workbench/browser/actions/listCommands.ts` (fetched): focusDown/Up (Arrow, mac Ctrl+N/P,
l. 72-95), **focusPageDown/Up (PageDown/PageUp, l. 106-122)**, focusFirst/Last (Home/End, l. 132-148),
**expandSelectionDown/Up (Shift+Arrow, l. 196-229)**, select (Enter, l. 459-465), **selectAll (Ctrl/Cmd+A,
l. 482-485)**, toggleSelection (Ctrl/Cmd+Shift+Enter, l. 550-553), **clear (Escape, l. 602-605)**, type navigation
(l. 634), find (Ctrl/Cmd+F, l. 658-662). nUIget's Listbox has none of the bold ones (`Listbox.tsx:135-173`). With 78 px
comfortable rows, a long Installed list moves one row per key; there is no way to jump by page or by name. The
interaction model defines the narrower set (`interaction-model.md:91-110`), so adding keys is a keyboard-map change.

### 3.3 Tab order per screen (from the render order; not walked in a browser)

**Main panel, Installed, single project** (`MainShell.tsx:232-305`, `InstalledTab.tsx:213-226`,
`InstalledProjectSection.tsx:168-193`, `DetailsPane.tsx:158-231`):

1. Restore after operations (check box) · 2. Include prerelease (check box) · 3. Project (select) · 4. Package source
(select) · 5. NuGet sources (gear) · 6. *(when a source failed)* unreachable-source retry · 7. Refresh · 8. **Search
box** · 9. Tab bar (selected tab) · 10. Bulk toolbar (Select all ⇄ Uninstall selected by arrows) · 11. "Direct
packages" toggle · 12. **Installed listbox** · 13. "Transitive packages" toggle · 14. *(expanded)* per-framework
toggles, transitive lists, restore banner button · 15. Sash · 16. Details: Uninstall · Version · Install/Update ·
*(Install in projects…)* · Details/README tabs (one stop) · links, dependency group toggles (level-4 SectionHeaders,
`DetailsInfo.tsx:88`), README copy buttons and links.

The search box is the 8th stop and the list the 12th. The workbench's Extensions view puts its search box first and
its list next (exemplar; not re-verified in a running VS Code). The main panel does not focus the search box on open:
"Focus search on panel open" was mapped to no 2.0 behaviour and accepted (`docs/plans/STATUS.md:754`); the host can
already send `ui/focusSearch` (`MainShell.tsx:138`).

**Main panel, Updates:** as above with the Updates toolbar (Select all ⇄ Update all, `UpdatesTab.tsx:221-226`) and the
updates list; no transitive section.

**Main panel, Browse:** stops 1–8, then the Browse list (tab bar hidden, `MainShell.tsx:283-288`), Sash, details.

**Sidebar** (`SidebarView.tsx:146-205`, `InstalledSection.tsx`, `UpdatesSection.tsx:219-258`): Search box ·
Installed toggle · *(per project in All Projects)* project toggles · Installed list(s) · Sash *(both open)* · Updates
toggle · Update all (icon button, `UpdatesSection.tsx:230-234`) · Updates list(s). Browse mode: search box · Browse list.

### 3.4 Pointer-only row actions and their keys (all six mirrored)

| `row-action-<name>` | Where | Key that does the same | Evidence |
|---|---|---|---|
| install | sidebar Browse | Enter (`onActivate={install}`) | `BrowseResults.tsx:149,183` |
| uninstall | sidebar Installed | Enter and Delete | `ProjectPackages.tsx:91-92,114` |
| update | sidebar Updates | Enter | `ProjectUpdates.tsx:100,120` |
| uninstall | main Installed (single and All Projects) | Delete (an SDK/props row has no button; Delete announces why, `InstalledTab.tsx:147`) | `InstalledProjectSection.tsx:114,150` |
| update | main Updates | Enter | `UpdatesTab.tsx:185,209` |
| update | main All Projects Updates | Enter | `AllProjectsUpdates.tsx:106,128` |

Shift+F10 / ContextMenu: wired in the three sidebar lists (`BrowseResults.tsx:151`, `ProjectPackages.tsx:94`,
`ProjectUpdates.tsx:102`) and in **no** main-panel list (grep `onContextMenu` under `src/webview/main` finds only the
Installed hint string). See finding 3.

### 3.5 Dead ends, traps and lost focus

| Case | What happens | Evidence | Status |
|---|---|---|---|
| Confirm a bulk uninstall or Update all | Focus goes to `<body>` | probe output: `after Confirm by keyboard, focus on BODY … opener disabled = true` (Installed) and `after Update all confirm, focus on BODY … button disabled = true` (Updates); Cancel returns focus to the opener | **verified (jsdom, real components)** |
| Search box → list | ArrowDown does nothing while the popup is closed; Tab walks 1–4 stops to reach a list | `SearchBox.tsx:176-192` | verified (code), SB7 open |
| ArrowUp on the first row → search box | no-op | `Listbox.tsx:143-148` | verified (code) |
| Escape in an empty, closed search box | `blur()` → focus on `<body>` | `SearchBox.tsx:229-241` | verified (code); the workbench's Escape in a search input does not blur (hypothesis) |
| Last row removed | focus moves to `.nuiget-listbox-empty`, which has `outline: none` and no role | `Listbox.tsx:110-112,175-181`, `primitives.css:67-69` | verified (code) |
| Focused control becomes disabled (Refresh while refreshing, Install/Update while busy, Uninstall while busy) | **hypothesis:** Chromium's focus fixup moves focus to `<body>` | `MainShell.tsx:256`, `DetailsPane.tsx:173,197` | needs a browser check (H3) |
| Right-click on a main-panel row | no menu; the event is consumed | `Listbox.tsx:218-224` | verified (code) |
| Keys forwarded to the workbench | every keydown inside a webview is posted to the host as `did-keydown`, `preventDefault` or not (VS Code 1.85.0 `pre/index.html:587-617`); a key nUIget handles can also trigger a workbench keybinding | fetched source | risk only; no conflict found |

### 3.6 Focus restoration after layers (`layers.ts`)

`restoreFocus(root, opener)` gives focus back to the opener when focus was inside the layer or on `<body>`, and only if
the opener `isConnected` (`layers.ts:53-59`). It has no fallback when the opener is disabled or not focusable. In
React's commit order the toolbar (earlier sibling) is updated before the dialog's layout-effect cleanup runs, so the
opener is already `disabled` when `opener.focus()` is called; jsdom (and browsers) ignore `focus()` on a disabled
button. Fix shapes: (a) fall back to the nearest focusable ancestor's first tabbable or to the list's active option;
(b) keep the toolbar button focusable with `aria-disabled` instead of `disabled`. Both are primitive-level (ADR-008:
"Accessibility is a property of primitives", `docs/adr/008-webview-architecture.md:44`).

### 3.7 What Enter does (keyboard map)

| List | Enter | Ctrl/Cmd+Enter | Delete | §5 says |
|---|---|---|---|---|
| sidebar Installed | **uninstall** | open full view | uninstall | "sidebar: performs its primary action" (`interaction-model.md:95`) |
| sidebar Updates | update (central row: menu) | open full view | — | same |
| sidebar Browse | install (central entry: menu) | open full view | — | same |
| main Installed | details | — | uninstall | "main panel: selects it and shows its details" |
| main Updates / All Projects Updates | **update** | — | — | contradicts §5 |
| main Browse | details | install | — | §5 l. 112-122 |
| transitive lists | details | — | — | — |

1.18.9 bound nothing to Enter on the sidebar's Installed list (`0457c75:src/webview/sidebar/SidebarApp.tsx:1509-1515`,
`onDelete` only). The workbench exemplar opens the item on Enter (Explorer, Source Control, Extensions; list.select,
`listCommands.ts:459-465`). An exploring keyboard or screen-reader user who presses Enter to "open" a sidebar package
uninstalls it, with no confirmation (§5 l. 83) and no undo.

---

## 4. Screen-reader semantics

### 4.1 Landmarks and headings

| Surface | Landmarks | Headings | Evidence |
|---|---|---|---|
| Main panel | `main` (root), `search` (`role="search"`), `region` "Package details" | h1 "Manage NuGet packages"; h2 section headers ("Direct packages", "Transitive packages", project names), h2 details title, h3 Vulnerabilities/Dependencies/Required by, h4 dependency groups; dialog titles h2 | `MainShell.tsx:232-234,258,300`, `DetailsPane.tsx:161`, `DetailsInfo.tsx:88,155,168`, `TransitiveDetails.tsx:44,66,69`, `Dialog.tsx:111` |
| Sidebar | `main`, `search` | h2 Installed/Updates, h3 projects, h2 folder captions; no h1 (the view title lives in the workbench) | `SidebarView.tsx:146-147`, `InstalledSection.tsx:63`, `UpdatesSection.tsx:97`, `folderGroups.tsx:32` |

The `<header>` inside `<main>` is no banner landmark (scoped). README content is injected raw (`ReadmeView.tsx:38`) and
its `#` becomes an `h1` inside the details region (finding 14). The page shell has `lang="en"` and a `<title>`
(`src/host/services.ts:119-126`), but no automated rule checks them in the real page (§2.1).

### 4.2 Roles, names, descriptions

- Row: option named by name + version (`aria-labelledby`), described by badges, meta, authors (with the Verified
  icon's title), description and status (`Row.tsx:90-93,119-133`); the tooltip sits on the text column so it does not
  become the description (`Row.tsx:137`). An update reads "3.0.0 → 3.1.0" as text (`Row.tsx:144-148`).
- Badges speak their `title` in place of the short label (`Badge.tsx:15-25`); tab counts are part of the tab's name
  ("Updates 2", `Tabs.tsx:69-71`); section counts part of the toggle's name (`SectionHeader.tsx:50-51`).
- Icons: decorative unless titled (`icons.tsx:10-12,26-31`); IconButton names by `aria-label` and `title`
  (`IconButton.tsx:22-37`); README copy buttons "Copy C# code" with the visible label "C#" inside the name
  (`markdown.ts:139-150`).
- Bulk selection: `aria-multiselectable`, `aria-selected` for the bulk set, `aria-current` for the details row
  (`Listbox.tsx:194`, `Row.tsx:125-126`); the check mark is decoration (`Row.tsx:134-135`).
- "Select all" is a toggle (`aria-pressed`, `InstalledTab.tsx:215`, `UpdatesTab.tsx:221`).
- Search: `type="search" role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`; options `aria-selected` on the active one; non-choices `aria-disabled` (`SearchBox.tsx:253-260,308-331,344`).
  The "›" expand affordance and the versions header are `aria-hidden` (`SearchBox.tsx:262-273,340-342`); their keys
  are not described to assistive technology (finding 15).

### 4.3 Live regions and announcements

- One `role="status"` polite atomic region per surface, emptied and refilled on the next frame so an identical message
  is spoken again (`LiveStatus.tsx:11-32`; `MainShell.tsx:305`, `SidebarView.tsx:205`).
- Banners are `role="alert"` (error) or `role="status"` (others) and are mounted with their text
  (`Banner.tsx:24-33`). **Hypothesis for P7.4:** a `status` region inserted with its content is often not announced;
  an `alert` usually is.
- Announcement inventory: 48 lines with `announce(` outside tests (`grep -rn "announce(" src/webview | grep -v .test. | wc -l`), all outcomes and refusals; first load: sidebar "Loading
  installed packages" only (`SidebarView.tsx:136-139`); Browse results count (`BrowseList.tsx:84`,
  `BrowseResults.tsx:53`); Refresh / Refresh failed (`MainShell.tsx:218,221`). Nothing for the main panel's first
  load of Installed/Updates/Browse/details/README (finding 8; Skeleton is `aria-hidden`, `Skeleton.tsx:14-19`).
- Triple announcement path (finding 9): webview live region × 2 surfaces + VS Code `NotificationsAlerts.alert()` for
  each toast (VS Code 1.85.0, fetched `notificationsAlerts.ts:28-75`; nUIget toasts `src/host/feedback.ts:96-105`).
- `aria-busy` on the whole listbox while it revalidates (`Listbox.tsx:193`) and on a busy option (`Row.tsx:129`).
  **Hypothesis for P7.4:** some screen readers withhold or skip busy content; revalidation is frequent.

### 4.4 What is hidden from assistive technology

| Hidden | Why | Reachable another way |
|---|---|---|
| Row actions container | nested-interactive | yes, keys (§3.4) |
| Row check mark, icon column | decoration | state is `aria-selected`; Space / Ctrl+click |
| Skeleton | decoration | sidebar: "Loading …" message; main: nothing (finding 8) |
| Search "›" expand, versions header | pointer helpers | ArrowRight / ArrowLeft, undescribed |
| Badge short label when it has a title | the title is read instead | yes |

---

## 5. Focus ring

- One rule draws the ring for options, icon buttons, sash, section toggles, buttons, tabs, dialogs and popovers:
  `outline: 1px solid var(--nuiget-color-focus); outline-offset: -1px` (`primitives.css:352-363`), the workbench's
  own shape. Others: header check boxes and dialog check boxes (`main.css:88-92`), selects and the main search box
  (`main.css:137-141`), the sidebar search (`sidebar.css:46-49`), README copy (`main.css:534-535`), inputs
  (`main.css:677-679`); the sash also fills with the focus colour (`primitives.css:689-691`).
- Token: `--nuiget-color-focus: var(--vscode-focusBorder)`; HC: `contrastActiveBorder` (`tokens.css:82,154-159`);
  forced colours: `Highlight` (`tokens.css:174`).
- Without a nUIget rule: links (VS Code default `-webkit-focus-ring-color`, finding 13); `.nuiget-listbox-empty`
  (`outline: none`, finding 12).
- The 1 px ring on a selected row measures 2.65 (Dark Modern), 2.56 (Dark 2026), 2.85 (Dark+), 1.82 (Light+) against
  `list.activeSelectionBackground` (computed, §7). VS Code draws the same pair (`list.focusOutline` = focusBorder,
  `listColors.ts:25-27`), so this is workbench parity, not a nUIget defect; WCAG 2.4.7 needs a visible ring, 2.4.13
  (AAA) would need 3:1.
- The search popup's active option is marked by background only (`search.css:84-88`) without
  `forced-color-adjust: none`, unlike selected rows (`primitives.css:108-110`). **Hypothesis:** in Windows forced
  colours the active suggestion may lose its mark; not emulated anywhere (`theme.ui.test.ts:13`).

---

## 6. Reduced motion

| Moves | Rule | Under `prefers-reduced-motion: reduce` |
|---|---|---|
| Spinner (rotate) | `primitives.css:439-447`, duration `normal × 5` | 0 ms: static icon |
| Skeleton (opacity breathe) | `primitives.css:562-581`, `normal × 6` | 0 ms: static |
| Indeterminate progress (stripe crosses) | `primitives.css:603-616`, `normal × 8` | 0 ms: a static 30 % stripe at the start (`primitives.css:602` comment), which reads like a determinate 30 % |
| Determinate progress width | `primitives.css:597` | instant |
| Icon-button and tab colour | `primitives.css:379,812` | instant |
| Section chevron rotate | `primitives.css:492` | instant |
| Keyboard scrolling | `scrollIntoView({ block: 'nearest' })`, no smooth behaviour (`Listbox.tsx:132`); no `scroll-behavior` anywhere (grep) | n/a |

All motion is token-timed (lint `webview-stylesheets.test.ts:94-95`), so the media block in `tokens.css:226-231`
covers everything. **Gap (finding 4):** VS Code also signals reduced motion with the body class
`vscode-reduce-motion`, set from `accessibilityService.isMotionReduced()` = `workbench.reduceMotion === 'on' ||
('auto' && OS)` (VS Code 1.85.0: `webviewElement.ts:664-667`, `accessibilityService.ts:88-90`,
`webview/browser/pre/index.html:485-497`; also on `main` today, l. 501-513). A user who turns reduce motion on in VS Code
only keeps every nUIget animation; one who forces it `off` with the OS preference on gets nUIget stopped while the
workbench moves. The fix adds `body.vscode-reduce-motion` to the duration block and changes the selector pin of
`webview-tokens.test.ts:53`. Nothing checks motion at runtime (H5).

---

## 7. Contrast of the token roles

Method: `a11y-probe/contrast.mjs` merges each default theme JSON with its `include` chain (fetched from
`microsoft/vscode` `extensions/theme-defaults/themes/`), falls back to the registry defaults read from the fetched
`src/vs/platform/theme/common/colors/*.ts`, `src/vs/workbench/common/theme.ts` and `extensions/git/package.json`,
composites alpha over the surface, and applies the WCAG formula. **Computed, not measured in a browser**; the 2026
themes are from VS Code `main` (2026-10-22).

| pair (WCAG target) | Dark Modern | Light Modern | Dark HC | Light HC | Dark 2026 | Light 2026 | Dark+ | Light+ |
|---|---|---|---|---|---|---|---|---|
| muted text / editor (4.5) | 6.08 | 11.20 | 9.96 | 5.47 | 5.53 | 6.29 | 5.76 | 4.88 |
| muted / sideBar (4.5) | 6.55 | 10.55 | 9.96 | 5.47 | 5.18 | 6.04 | 5.44 | **4.40** |
| muted / row hover, main (4.5) | 5.12 | 10.01 | 9.00 | 5.04 | 4.54 | 5.27 | 5.06 | **3.98** |
| muted / row hover, sidebar (4.5) | 5.12 | 10.01 | 9.00 | 5.04 | **4.16** | 5.07 | 5.06 | **3.98** |
| muted / widget (dialogs, popup) (4.5) | 6.01 | 10.55 | 9.35 | 5.47 | 4.80 | 6.04 | 5.44 | **4.40** |
| version-new / editor (4.5) | 7.19 | 4.88 | 14.11 | 9.31 | 9.29 | 4.88 | 7.27 | 4.88 |
| version-new / row hover (4.5) | 6.05 | **4.36** | 11.69 | 7.86 | 7.62 | **4.09** | 6.05 | **3.98** |
| version-new / sideBar (4.5) | 7.75 | 4.60 | 14.11 | 9.31 | 8.71 | 4.68 | 6.68 | **4.40** |
| link / editor (4.5) | 6.65 | 6.31 | 7.96 | 8.98 | 6.31 | 5.39 | 5.43 | 5.68 |
| badge fg / bg (4.5) | 5.83 | 6.98 | 21.00 | 8.98 | 4.55 | 5.39 | 8.45 | 7.24 |
| focus ring / editor (3) | 3.64 | 6.31 | 8.18 | 5.47 | 3.27 | 5.39 | 3.96 | 3.35 |
| focus ring / selection (3) | **2.65** | 5.15 | 8.18 | 4.62 | **2.56** | 3.86 | **2.85** | **1.82** |
| `--nuiget-color-border` / editor (3, row check) | **1.27** | **1.26** | 10.55 | 8.98 | **1.31** | **1.29** | **1.26** | **1.48** |
| `--nuiget-color-border` / selection (3) | **1.09** | **1.03** | 10.55 | 7.58 | **1.11** | **1.08** | **1.10** | 4.13 |
| placeholder / input (4.5) | 4.51 | 4.54 | 9.96 | 5.47 | **2.34** | **2.85** | 4.53 | 4.54 |

README code (`a11y-probe/syntax.mjs`), against `textCodeBlock.background` over the editor:

| role → VS Code key | Dark Modern | Light Modern | Dark HC | Light HC | Dark 2026 | Light 2026 |
|---|---|---|---|---|---|---|
| syntax-type → symbolIcon.classForeground | 6.40 | **2.89** | 9.49 | **2.74** | 6.94 | **2.55** |
| syntax-function → symbolIcon.functionForeground | 4.68 | 8.48 | 6.94 | 8.05 | 5.07 | 7.49 |
| syntax-variable → symbolIcon.variableForeground | 7.12 | **4.25** | 10.57 | **4.03** | 7.73 | **3.75** |
| syntax-string → debugTokenExpression.string | 5.36 | 7.39 | 8.55 | 7.01 | 5.81 | 6.52 |
| syntax-number → debugTokenExpression.number | 8.33 | **4.33** | 11.52 | **4.11** | 9.04 | **3.83** |

Roles whose VS Code key carries no text-contrast guarantee for the surface nUIget puts them on:

| `--nuiget-color-*` | Key | Drawn on | Risk |
|---|---|---|---|
| `fg-muted` | descriptionForeground | row hover, widget, sideBar | below 4.5 on hover in Dark 2026 (sidebar) and Light+ (computed); the selected-row case is already handled by `color: inherit` (`primitives.css:172-185`) |
| `version-new` | gitDecoration.addedResourceForeground, else charts.green | row hover | below 4.5 in three light themes; the token comment quotes the editor background only (`tokens.css:118-121`); without the git extension `charts.green` is 4.33 on white by that comment |
| `syntax-*` | symbolIcon.* and debugTokenExpression.* (`tokens.css:97-111`) | README code block | icon colours, below 4.5 in every light theme incl. Light HC |
| `border` (used for the row check) | widget.border ⟶ panel.border (`tokens.css:81`) | editor, selection | a separator colour used as a control boundary; never 3:1 outside HC |
| `focus` | focusBorder | selection | workbench parity (§5) |
| `input-placeholder` | input.placeholderForeground | input | workbench parity; low in the 2026 themes |
| `info`/`warning`/`error` | editorInfo/editorWarning/errorForeground | badge borders, banner bars and icons | borders only (`primitives.css:416-426`); the text keeps badge foreground, words carry the meaning |

HC note (finding 16): hcDark leaves `list.activeSelectionBackground`, `list.activeSelectionForeground` and
`list.inactiveSelectionBackground` unset (VS Code `main`, fetched `src/vs/platform/theme/common/colors/listColors.ts:33-47`); nUIget's tokens alias them without a fallback
(`tokens.css:115-117`), so a selected sidebar row in Dark HC has no fill; VS Code's own lists mark selection in HC
with outlines (hypothesis, not re-read in the workbench CSS). The HC capture shows a grey fill on the sidebar's first
row, likely the pointer's hover (`main-installed-single-hc.png`, judge-only).

---

## 8. Harness proposals (automated substitutes for the deferred screen-reader pass)

All run in the existing ExTester `UI` job (ubuntu, xvfb, `.github/workflows/ci.yml`), reuse the named-state flow
(`sidebarWebview.ts:24-51`) and the injected axe source (`theme.ui.test.ts:40,147-149`). Keys must be sent to the
focused element (`(await driver.switchTo().activeElement()).sendKeys(…)`): "the driver's action queue does not reach
it" (`main-shell.ui.test.ts:52-60`).

| Id | Proposal | How | Compare | Cost | Reliability |
|---|---|---|---|---|---|
| H1 | **ARIA-tree snapshot per named state** (15 states plus open dialogs) | After `screenshot(state)`, in the webview: `axe.setup(document)`, walk elements, keep those whose `axe.commons.aria.getRole(el)` is not generic/presentation/none and that are not under `aria-hidden`; write `{role, name: axe.commons.text.accessibleText(el), description, level, states: selected/current/expanded/pressed/busy/disabled/checked, testid}` as JSON beside the PNG. Verified offline that `getRole` and `accessibleText` return `listbox "Installed"`, `option "Serilog 3.1.1" selected=true`, `button "Update all (2)"` (node + jsdom probe). | A committed, normalized snapshot (versions, counts and generated ids masked) diffed in CI; the diff is the review artefact for D18-style approval | 1 day | high (deterministic DOM; masking needed for live feed data) |
| H1b | Same tree from Chromium (`Accessibility.getFullAXTree`) | `driver.sendAndGetDevToolsCommand` exists in `selenium-webdriver@4.51.0` (`chromium.js:725-745`) | as H1 | 1–2 days spike | **hypothesis:** webviews are cross-origin iframes, likely out-of-process; the page-level CDP session may not reach them |
| H2 | **Full-rule axe per named state and per open layer** (dialogs, search popup, README tab, Browse, All Projects, sidebar browse) | the theme pass's `RUN_AXE` without `runOnly`, plus `rules: { 'label-content-name-mismatch': { enabled: true }, 'target-size': { enabled: true } }`, on the default theme | zero violations; pin "passes" for page-level rules (document-title, html-has-lang, landmark-one-main, scrollable-region-focusable) | 0.5 day | high; decides the 45 rules jsdom cannot |
| H3 | **Keyboard paths from §5** | Per screen: Tab from the search box, record `document.activeElement` (role, name, testid) each step until the sash, compare with the §3.3 order; row keys (Arrow/Home/End/Enter/Ctrl+Enter/Delete/Space/Shift+F10) with their effects; dialogs: open by Enter, Tab cycles inside, Escape closes, **focus returns to the opener or a defined fallback, never `<body>`**; search: `@` + ArrowDown + Enter, ArrowRight/Left, Escape ×3; disabled-on-focus buttons (Refresh, Install) | expected sequences in the test | 1–1.5 days | medium-high: keyboard steps already work in five suites; Tab out of the last stop leaves the iframe (stop before it) |
| H4 | **Focus-after-close assertion in jsdom** | in each feature test that opens a `ConfirmDialog`/`Dialog`, assert `document.activeElement !== document.body` after Confirm and after Cancel | — | 0.25 day | high; the probes in `a11y-probe/` are the template |
| H5 | **Reduced motion at runtime** | (a) set `workbench.reduceMotion: "on"` in `src/test/ui/settings.json` for one suite, assert `body.vscode-reduce-motion` and that `document.getAnimations().filter(a => a.playState === 'running').length === 0` with a spinner and a skeleton on screen; (b) the OS path through CDP `Emulation.setEmulatedMedia({ features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })` | — | (a) 0.5 day after finding 4 is fixed; (b) spike | (a) high (class verified in VS Code source); (b) hypothesis, same iframe caveat as H1b |
| H6 | **Target size in open layers and for the row check** | H2 covers layers; the 12 px `.nuiget-row-check` is `aria-hidden` so axe skips it: a geometry check in the UI test (bounding box ≥ 24 or the row's Ctrl+click equivalent documented) | — | 0.25 day | high |
| H7 | **Contrast beyond the default view** | extend the theme pass with: a hovered row (`driver.actions().move({ origin: row })`), an open ConfirmDialog, the search popup, the README tab scrolled into view in steps; and an **offline lint** that vendors the six default theme JSON + registry defaults and checks the token pairs of §7 (what `contrast.mjs` does) | 4.5 text / 3 non-text | 1 day (UI) + 0.5 day (lint) | UI: medium (hover and scroll are timing-sensitive); lint: high but needs a refresh when VS Code changes a default theme |
| H8 | **Rule-coverage ledger for the jsdom suite** | the scratch logger (`a11y-probe/axe-log-setup.ts`) as a Vitest setup file behind an env flag; a lint compares the set of rules that pass at least once with a committed list, so a pinned property cannot silently become "inapplicable" | committed list | 0.25 day | high |

Not substitutable by automation (stays in P7.4): what NVDA/VoiceOver actually speak for options with
`aria-labelledby` + `aria-describedby`, whether the listbox `hint` is read on entry, whether `aria-busy` lists are
skipped, whether `status` banners inserted with content are announced, and the triple announcement (finding 9).

---

## 9. Not reachable, gaps

Not reachable:

- A running VS Code (none installed, global CLAUDE.md "Environment"); no browser tool used (reserved pane). All
  rendering claims rest on the PNG captures of CI run 39025149785 or on code.
- Chromium 114 (VS Code 1.85): no job renders it (N64, `docs/plans/findings-ledger.md:168`); behaviour of
  disabled-while-focused buttons and of 0 ms infinite animations not observed.
- Screen readers (P7.4, out of scope).
- Windows forced colours (not emulated).
- CDP access to webview iframes through ExTester (H1b, H5b are hypotheses).

Gaps (not covered by this report):

- Zoom and reflow (WCAG 1.4.4, 1.4.10) beyond the one `sidebar-narrow-200px.png` capture; text spacing (1.4.12).
- The source settings dialog's form flow (labels pass axe, `DetailsPane.test.tsx:509` pins `label` elsewhere; the add-source error handling was not traced).
- The All Projects views' keyboard order (only read from code for the single project).
- The Popover primitive (no consumer).
- VS Code's own HC list CSS (outline for selection) was not fetched; finding 16 stays a hypothesis.

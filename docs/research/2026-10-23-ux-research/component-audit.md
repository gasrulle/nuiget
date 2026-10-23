# Component audit of `src/webview/**` (UX-overhaul research, dimension: component-audit)

Date 2026-10-22 · repository `/Users/mattias/github/nuiget`, branch `main` at `e4d6e97` (read-only) · author: research agent

All paths are repository-relative unless absolute. `path:line` refers to the tree at `e4d6e97`. Commands were run
read-only from the repository root; the two scripts used live in the scratchpad
(`/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/scripts/coupling.mjs`,
`.../scripts/exports.mjs`, `.../scripts/costs.mjs`). Claims marked **hypothesis** were not verified; claims marked
**judge-only** rest on looking at a capture PNG.

---

## 1. Answer first

| Question | Answer |
|---|---|
| How many components need a rebuild? | **1** unconditionally, of 46 audited units: the Updates tab (`UpdatesTab` + `AllProjectsUpdates` merged into one sections-based tab, the shape the Installed tab already has). **`Listbox` is a refactor by default and a rebuild only if the plan decides on one grouped list per view** (that decision also turns 8 list consumers into rebuilds). 32 are refactors (rules or props replaced, DOM and test hooks kept), 13 are keep. |
| Why so few rebuilds? | The DOM of the row and list is pinned three ways: ARCHITECTURE's listbox contract and gotcha rows (nested-interactive, wrapper carries nothing, `title` on the body, arrow as text; `ARCHITECTURE.md:279-396`), §8 prose for `package-row-<id>` ("the wrapper around the option and its pointer actions", `docs/ux/interaction-model.md:171`) and ExTester reads of `[role="option"]` and `.nuiget-row-{name,check,icon,version,authors}` (`src/test/ui/v2/mainWebview.ts:104-107`, `main-installed.ui.test.ts:74-83`). A primitive whose DOM must survive is a refactor, not a rebuild. |
| Where is the real debt? | Not inside the primitives; around them: (1) a primitive contract broken by feature CSS (`Listbox` "always virtualized" vs `main.css:206-222`); (2) 21 feature-stylesheet rules that reach into primitive DOM; (3) duplicated list logic in 8 `renderRow` sites and 5 copies of `busyStatus`; (4) six missing form/content primitives (20 raw `nuiget-button` uses, 4 raw `<select>`, 6 raw check boxes); (5) two implementations of the Updates tab. |
| Cost (planned days, P9 rate ~1.1 h per planned day) | Recommended verdicts: **13.5 d + 2.0 d new primitives and row adapter = 15.5 d ≈ 17 h**. If the grouped-list decision is taken (one list per view), `Listbox` (+2.0 d) and 8 list consumers (+5.0 d) turn into rebuilds: **+7.0 d → 22.5 d ≈ 25 h**. Everything as refactor: 15.0 d ≈ 16.5 h. Everything rebuilt: 45.25 d ≈ 50 h. |
| Tests | 59 webview test files, 562 `it`/`test` calls, **0 snapshots**, 443 `*ByRole` and 440 `*ByTestId` queries vs 94 class-name selectors (52 in primitive tests, 31 of them in `Row.test.tsx`; 42 in feature tests). ExTester: 26 class-name reads in 9 files, mostly `.nuiget-row-*`. A rebuild that keeps roles, every §8 id and the six `.nuiget-row-*` class names breaks few tests. The brittlest tests are 18 computed-style reads (`Row.test.tsx`, `MainParity.test.tsx`, `SidebarParity.test.tsx`) that pin CSS rule text such as `calc(var(--nuiget-space-2) + …)`; they break under a **refactor** too. |

---

## 2. Method and commands

| Step | Command (repo root) | Result used below |
|---|---|---|
| Inventory | `find src/webview -type f \| sort \| xargs wc -l` | 60 non-test `.tsx`, 53 `.test.tsx`, 6 `.test.ts`, 17 non-test `.ts`; 22 372 lines total |
| Test coupling per file | `node …/scripts/coupling.mjs . src/webview` | §10.1 table |
| Class selectors in tests | `grep -rnoE "['\"\`][^'\"\`]*\.nuiget-[a-z0-9-]+" src/webview --include='*.test.tsx' --include='*.test.ts'` | §10.2 |
| ExTester coupling | `grep -noE "\.nuiget-[a-z0-9-]+" src/test/ui/v2/*.ts \| sort \| uniq -c` | §10.3 (26 reads) |
| e2e coupling | `grep -rnoE "data-testid\|\.nuiget-[a-z0-9-]+\|role=" src/test/e2e/v2-*.e2e.test.ts` | Only `workbench.view.extension.nuiget-sidebar` (a command id), so e2e has **no DOM coupling** |
| Exports with no production importer | `node …/scripts/exports.mjs .` | §8.7 |
| Unused icons | `grep -rln "\b<Name>\b" src` per icon | 13 of 26 icons only in `icons.tsx` |
| Primitive classes reached by feature CSS | `grep -nE "\.(<70 primitive classes>)([^a-z0-9-]\|$)" main/main.css sidebar/sidebar.css shared/search/search.css` | 14 rules in `main.css`, 7 in `sidebar.css`, 0 in `search.css` |
| Classes rendered without a rule | `comm` of classes in TSX vs classes in the four stylesheets, then `grep` per class | 9 classes (§8.7) |
| Primitive use per module | `grep -oE "<(Listbox\|Row\|…)\b"` per non-test `.tsx` | §7 |
| Calibration of the day rate | `git log --all --date=format:'%m-%d %H:%M' --format='%ad %h %s' \| grep -E "P9\.(fix-)?[0-9]+"` | §6 |
| Captures viewed | `main-installed-single.png`, `main-installed-all.png`, `main-updates.png`, `main-transitive-expanded.png`, `sidebar-sections.png` | judge-only findings |

---

## 3. Constraints any refactor or rebuild must keep

These are rules in the repository today, with their sources; a Design System spec may change them only by a ruling.

| Constraint | Source |
|---|---|
| A row is three elements: presentational wrapper (classes, `data-*`, measuring ref only), `role="option"` holding text only, and an `aria-hidden` sibling with pointer-only `IconButton`s (`tabIndex=-1`) | `ARCHITECTURE.md:290-323`; gotchas "Buttons inside `role="option"`", "Attributes on the row wrapper" (`.github/copilot-instructions.md`) |
| Tooltip `id version` on `.nuiget-row-body`, never on the option; update arrow `→` is text inside `.nuiget-row-version` | gotchas "A `title` on a row", "A symbol-only element and axe" |
| Every row action has a key: Enter, Ctrl/Cmd+Enter, Delete/Cmd+Backspace, Shift+F10/ContextMenu/right-click, Space (multi-select only) | `ARCHITECTURE.md:325-332`; `docs/ux/interaction-model.md:90-110` |
| Roving tab stop, active row stays mounted while virtualized, `aria-posinset`/`aria-setsize`, focus moves to the row now at the index, empty state container takes focus | `ARCHITECTURE.md:342-346`; `Listbox.tsx:66-120` |
| Two selections in a multi-selectable list: `aria-selected` = bulk set, `aria-current` = details row; check mark is an `aria-hidden` span | `ARCHITECTURE.md:334-340`; gotcha "Two selections in one listbox" |
| No `style` attribute except `cssVars()` custom properties (CSP) | `ARCHITECTURE.md:350-356`; gotcha "Inline style in 2.0 webviews"; `cssVars.ts:6-14` |
| Every padding/margin/gap from `--nuiget-space-*`/`--nuiget-inset`; no colour literal; no CSS newer than Chromium 114 | `src/test/lint/webview-stylesheets.test.ts` (`pxSpacing`), `webview-colours.test.ts`, `webview-css-baseline.test.ts` |
| Layers (`Dialog`, `ConfirmDialog`, `Popover`) on one stack; only the top layer answers Escape/focus/outside press | `layers.ts`; `ARCHITECTURE.md:370-381` |
| Every hook of interaction model §8 is rendered by a product file; `package-row-<id>` is defined there as the wrapper | `src/test/lint/interaction-model-testids.test.ts`; `docs/ux/interaction-model.md:160-215` |
| Icons are `/* @__PURE__ */ React.memo(…)`; count checked against the source | `src/test/lint/webview-icons-pure.test.ts:30` |
| Bundle ceilings | `esbuild.mjs` (not re-read here; cited from the gotcha table) |

---

## 4. Inventory (non-test modules of `src/webview`)

Lines from `wc -l`; props counted from the props interface (a `RowPlacement` spread counts its own fields).

| Module | Lines | Props | Notes |
|---|---:|---:|---|
| `shared/primitives/Listbox.tsx` | 250 | 19 | Two of them (`estimateSize`, `overscan`) are passed by no feature |
| `shared/primitives/Row.tsx` | 166 | 26 (17 + 9 placement) | ReactNode slots `icon`, `badges`, `actions` |
| `shared/primitives/Popover.tsx` | 172 | 8 | No production importer |
| `shared/primitives/Dialog.tsx` | 122 | 10 | |
| `shared/primitives/Sash.tsx` | 112 | 10 | |
| `shared/primitives/Toolbar.tsx` | 109 | 3 | Child-class contract `nuiget-toolbar-end` |
| `shared/primitives/Tabs.tsx` | 81 | 6 (+5 per `TabItem`) | |
| `shared/primitives/SectionHeader.tsx` | 58 | 11 | `actions` slot also used for badges |
| `shared/primitives/ErrorBoundary.tsx` | 44 | 2 | |
| `shared/primitives/ConfirmDialog.tsx` | 43 | 8 | |
| `shared/primitives/IconButton.tsx` | 39 | 9 | `className` pass-through |
| `shared/primitives/Banner.tsx` | 34 | 4 | |
| `shared/primitives/LiveStatus.tsx` | 33 | 2 | |
| `shared/primitives/ProgressBar.tsx` | 27 | 2 | |
| `shared/primitives/Badge.tsx` | 26 | 3 | `title` is replacement text, not a tooltip |
| `shared/primitives/EmptyState.tsx` | 23 | 3 | |
| `shared/primitives/Skeleton.tsx` | 20 | 2 | |
| `shared/primitives/Spinner.tsx` | 18 | 2 | |
| `shared/primitives/icons.tsx` | 244 | 3 | 26 icons, 13 unused |
| `shared/primitives/primitives.css` | 844 | – | Row section is lines 71-349 (279 lines, a third of the file) |
| `shared/search/SearchBox.tsx` | 351 | 18 | `className` required, applied to the input |
| `shared/allProjects/folderGroups.tsx` | 38 | 2 | Renders main-panel-only classes |
| `main/MainShell.tsx` | 308 | 5 | Over ADR-008's "< 300" |
| `main/features/updates/AllProjectsUpdates.tsx` | 346 | 3 (+13 inner) | Second implementation of the Updates tab |
| `main/features/details/DetailsPane.tsx` | 256 | 1 | |
| `main/features/updates/UpdatesTab.tsx` | 252 | 3 | |
| `main/features/sources/SourceSettingsDialog.tsx` | 235 | 3 | 6 raw buttons, 7 inputs, 8 labels, 1 select |
| `main/features/installed/InstalledTab.tsx` | 230 | 3 | |
| `main/features/installed/InstalledProjectSection.tsx` | 206 | 17 | |
| `main/features/search/useSearchTyping.ts` | 196 | 5 in | |
| `main/features/details/DetailsInfo.tsx` | 175 | 0 | |
| `main/features/details/MultiInstallDialog.tsx` | 168 | 5 | |
| `main/features/installed/TransitiveSection.tsx` | 163 | 1 | |
| `main/features/installed/AllProjectsTransitiveSection.tsx` | 161 | 1 | |
| `main/features/search/BrowseList.tsx` | 149 | 2 | |
| `main/features/details/useInstallAction.ts` | 124 | 1 in | Instantiated 3 times |
| `main/features/updates/CentralUpdateDialog.tsx` | 116 | 3 | Mounted 6 times |
| `main/features/details/TransitiveDetails.tsx` | 82 | 1 | |
| `main/features/details/ReadmeView.tsx` + `markdown.ts` | 71 + 226 | 1 | |
| `main/features/sources/SourcesControl.tsx` | 69 | 1 | |
| `main/features/installed/BulkUninstallDialog.tsx` | 42 | 4 | |
| `main/features/updates/UpdateAllDialog.tsx` | 39 | 5 | |
| `main/index.tsx` | 43 | – | |
| `main/main.css` | 735 | – | 14 rules reach into primitive DOM |
| `sidebar/UpdatesSection.tsx` | 260 | 5 | Inline Update-all confirmation |
| `sidebar/SidebarView.tsx` | 208 | 1 | |
| `sidebar/BrowseResults.tsx` | 191 | 1 | |
| `sidebar/InstalledSection.tsx` | 142 | 5 | |
| `sidebar/ProjectUpdates.tsx` | 127 | 11 | |
| `sidebar/ProjectPackages.tsx` | 121 | 9 | |
| `sidebar/index.tsx`, `rowRequests.ts`, `outcomes.ts` | 40, 29, 1 | – | `outcomes.ts` is a one-line re-export |
| `sidebar/sidebar.css` | 136 | – | 7 rules reach into primitive DOM |
| `shared/search/search.css` | 108 | – | Clean (no primitive reach-in) |
| `shared/store/*` (11 slices), `shared/bus/*` | 1 973 + 182 | – | Not audited line by line (outside this dimension); verdict keep by default |

---

## 5. Verdict table

Verdict definitions (task): **keep** = no change beyond token values; **refactor** = rules (CSS, internal logic, props)
replaced, structure kept (DOM shape, roles, test ids, the six `.nuiget-row-*` class names that ExTester reads);
**rebuild** = rewritten against a new Design System spec together with its tests. Costs in planned days (quarter-day
steps), basis in §6. "Tests touched" names the test files that would change; counts are `it`/`test` calls and
class-selector uses from §10.

### 5.1 Primitives (`src/webview/shared/primitives`)

| Component | Verdict | Evidence (debt) | Refactor | Rebuild | Tests touched |
|---|---|---|---:|---:|---|
| **Listbox** | **refactor** by default; **rebuild only if the plan decides on one grouped list per view** (then: group header rows, one scroll element, real virtualization, keys across groups) | Decision criterion: everything (a)-(d) is fixable without a DOM change (refactor); only (e) needs a different list shape, and that is a product decision, not a defect. (a) Contract "always virtualized" (`Listbox.tsx:51-56`, `ARCHITECTURE.md:342`) is broken by feature CSS: `main.css:206-222` makes the list "not its own scroll element … so the virtualizer renders all of its rows" in the Installed tab (both modes) and All Projects Updates; `ARCHITECTURE.md:604` restates it. (b) `ROW_HEIGHT` duplicates the tokens (`Listbox.tsx:7-8` vs `tokens.css:30,33`). (c) DOM coupling to `Row`: `[data-index="${index}"] > [role="option"]` (`:104`), `aria-disabled` read back from the DOM (`:141`, `:211`), click on `.nuiget-row-check` (`:210`). (d) `estimateSize`, `overscan` passed by no feature (grep). (e) One list per section: All Projects renders one `Listbox` per project (`InstalledTab.tsx:187-209`, `AllProjectsUpdates.tsx:279-302`), so arrow keys stop at each project and every project adds a tab stop. (f) The bench measures a scrolling compact list only (`Listbox.bench.ts:20-35`), not the all-rows-mounted sections layout. | 1.0 (token-driven heights, a context or callback in place of the DOM selectors, virtualize against the outer scroller, drop dead props) | 3.0 (group header rows in one list, one scroll element, keys across groups; keeps the whole key table) | `Listbox.test.tsx` (24 tests, 6 class), `Listbox.bench.ts`; consumers' tests that count lists: `InstalledTab.test.tsx` (17), `AllProjectsView.test.tsx` (9), `UpdatesTab.test.tsx` (20), `SidebarView.test.tsx` (25), `UpdatesSection.test.tsx` (12); ExTester list ids in 9 files; §8 per-project ids `installed-list-<name>`, `updates-list-<name>`, `sidebar-*-list-<name>` would change under a grouped list |
| **Row** | **refactor** | DOM pinned (§3). Debt: (a) selection and hover band painted on the option only (`primitives.css:102-126`) while the actions are a sibling (`Row.tsx:159-163`): the band stops short of the action column (judge-only: `sidebar-sections.png` selected row ends at x≈323, trash at x≈336). `:has()` is already used and passes the Chromium-114 lint (`sidebar.css:87`), so the band can move to the wrapper by rules alone. (b) ReactNode slots force every consumer to build the same parts: 8 `renderRow` sites (InstalledProjectSection, transitiveRow, UpdatesTab, AllProjectsUpdates, BrowseList, ProjectPackages, ProjectUpdates, BrowseResults), `<img src alt="">` ×5, `CPM` badge ×5, `Vulnerable` ×2 (grep). The fix is an adapter layer (typed package rows per data kind, costed in §5.5), not a Row rewrite. (c) The check column exists only in multi-selectable lists (`Row.tsx:135`), so the transitive rows start 26 px left of the direct rows in the same scroller (judge-only: `main-transitive-expanded.png`, icons at x≈364 vs x≈390). (d) 279 lines of CSS (`primitives.css:71-349`). | 0.5 (rules only) | 2.5 | Refactor: `SidebarParity.test.tsx` (2 `calc()` strings), `Row.test.tsx:240-285` (7 computed-style reads). Rebuild adds: `Row.test.tsx` (21 tests, 31 class), feature tests with 32 `.nuiget-row-*`/skeleton/spinner selectors (InstalledTab 10, UpdatesTab 8, AllProjectsView 5, SidebarView 4, UpdatesSection 3, BrowseList 1, BrowseResults 1), ExTester 10 `.nuiget-row*` reads + `main-shell.ui.test.ts:84` (`[role=option].firstElementChild`) |
| **SectionHeader** | refactor | `actions` slot documented for `IconButton`s (`SectionHeader.tsx:23`) carries badges in 6 places (`InstalledProjectSection.tsx:180,192`, `TransitiveSection.tsx:110,137`, `AllProjectsUpdates.tsx:150`, `sidebar/InstalledSection.tsx:135`); neither `.nuiget-section-header` nor `.nuiget-section-actions` has end padding (`primitives.css:451-455,499-503`) → V3. Its variants live in feature CSS as descendant overrides: `main.css:168,358,702,707`, `sidebar.css:102,108,113,123,128`. | 0.5 (variants as props: pane header, tree-level group, details group; a `badges` slot; end padding) | 1.25 | `SectionHeader.test.tsx` (7, 4 class), `MainParity.test.tsx` and `SidebarParity.test.tsx` (computed style), `InstalledTab.test.tsx:92,333,373` and `AllProjectsView.test.tsx:183` (`closest('.nuiget-section-header')`), ExTester `main-transitive.ui.test.ts:90`, `main-installed.ui.test.ts:131`, `main-shell.ui.test.ts:77` |
| **Toolbar** | refactor | Child-class contract `nuiget-toolbar-end` (`Toolbar.tsx:21-22`, used at `InstalledTab.tsx:218`, `UpdatesTab.tsx:224`, `AllProjectsUpdates.tsx:312`); its padding is set by a feature rule `.nuiget-installed > .nuiget-toolbar` (`main.css:190-195`) → V1, V2 | 0.25 (`end` slot, own padding variant) | 0.75 | `Toolbar.test.tsx` (6), `composed.test.tsx`; ExTester P9.fix-4 edge test |
| **Tabs** | refactor | API fine. The tab list's start padding is computed in feature CSS from the tab's internals: `calc(var(--nuiget-inset) - var(--nuiget-space-4) - var(--nuiget-space-hairline))` (`main.css:164-166`) against `.nuiget-tab` padding and border (`primitives.css:799-812`) → V1. `.nuiget-tab-label` has no CSS rule and exists for the ExTester inset test (`main-shell.ui.test.ts:75`). | 0.25 | 0.75 | `Tabs.test.tsx` (6), `MainShell.test.tsx`; ExTester `main-shell.ui.test.ts:75`, `theme.ui.test.ts:226` (`.nuiget-tab`) |
| **Badge** | refactor | `title` is visually hidden replacement text (`Badge.tsx:9,18-22`), not a tooltip; no `data-testid`. The sidebar wraps a span to get both (`sidebar/InstalledSection.tsx:136`); the main panel's identical `provisional` badge has no tooltip (`InstalledProjectSection.tsx:163`). | 0.25 | 0.5 | `Badge.test.tsx` (3; 2 class, 3 `toHaveClass`), `SectionHeader.test.tsx` (2 class) |
| **IconButton** | refactor | `className` pass-through (`IconButton.tsx:17,26`); `nuiget-main-refresh` (`MainShell.tsx:256`) has no CSS rule anywhere (grep), `nuiget-source-health` (`SourcesControl.tsx:58`) is a colour (`main.css:102-104`) that should be a tone prop | 0.25 | 0.5 | `IconButton.test.tsx` (3; 2 `firstElementChild`) |
| **ConfirmDialog** | refactor | Three bodies build the same grouped package list by hand (`BulkUninstallDialog.tsx:32-39`, `UpdateAllDialog.tsx:25-36`, `sidebar/UpdatesSection.tsx:245-256`) with one rule under two names (`main.css:236-242` = `sidebar.css:90-98`) | 0.25 (a structured `items`/groups prop) | 0.5 | `ConfirmDialog.test.tsx` (7); dialog assertions in `InstalledTab.test.tsx`, `UpdatesTab.test.tsx`, `UpdatesSection.test.tsx`; ExTester `confirm-dialog*` ids unchanged |
| Dialog | keep | Sound focus model. Stale doc comment: "it is not dimmed, because no theme colour exists for a scrim" (`Dialog.tsx:31-33`) vs the scrim of P9.11 (`ARCHITECTURE.md:378-380`). Check-box styling for dialog content lives in `main.css:54-93` (`.nuiget-dialog input[type="checkbox"]`), which belongs to a Checkbox primitive. | 0 (comment) | 1.5 | `Dialog.test.tsx` (11) |
| Popover | keep (dormant) | No production importer (`grep -rn "Popover\b" src/webview` outside the primitive and tests: only `index.ts:17`); doc comment names Multi Install (`Popover.tsx:56`), which uses `Dialog` (`MultiInstallDialog.tsx:126`). Candidate home of the missing main-panel context menu (§8.8), else delete. | 0 (delete: 0.25) | 1.0 | `Popover.test.tsx` (15), `composed.test.tsx` |
| Banner | keep | 34 lines; severity spoken in words, `role` by severity | 0 | 0.5 | `Banner.test.tsx` (4) |
| EmptyState | keep | | 0 | 0.25 | `EmptyState.test.tsx` (2) |
| ErrorBoundary | keep | | 0 | 0.25 | `ErrorBoundary.test.tsx` (2) |
| LiveStatus | keep | | 0 | 0.25 | `LiveStatus.test.tsx` (4) |
| ProgressBar | keep | | 0 | 0.25 | `ProgressBar.test.tsx` (3; 4 `toHaveClass`) |
| Skeleton | keep | | 0 | 0.25 | `Skeleton.test.tsx` (2; 4 class) |
| Spinner | keep | | 0 | 0.25 | `Spinner.test.tsx` (3) |
| Sash | keep | | 0 | 0.75 | `Sash.test.tsx` (6) |
| icons | keep | 13 of 26 icons have no importer: ChevronDown, ArrowRight, ArrowLeft, CloudDownload, Ruler, ClearAll, ExternalLink, SingleProject, AllProjects, Shield, CheckAll, CollapseAll, ExpandAll (`grep -rln` finds only `icons.tsx`). No bundle cost: every icon is `/* @__PURE__ */` and tree-shaken (`webview-icons-pure.test.ts:30`). | 0 (delete: 0.25) | 1.0 | `icons.test.tsx` (8, iterates the module namespace), `webview-icons-pure.test.ts` |
| cssVars, layers, testSupport | keep | `cssVars` is the only `style` source and every `style=` in production goes through it (7 sites, grep) | 0 | – | – |

### 5.2 Shared non-primitives

| Component | Verdict | Evidence | Refactor | Rebuild | Tests touched |
|---|---|---|---:|---:|---|
| SearchBox | refactor | Required `className` applied to the input (`SearchBox.tsx:48,310`), so the input's look is written twice outside the component: `main.css:121-141` (`.nuiget-main-search-input`, focus on `:focus`) and `sidebar.css:30-49` (`.nuiget-sidebar-search`, focus on `:focus-visible`), divergent focus rule. 18 props. Combobox model sound and documented (`ARCHITECTURE.md:665-672`). | 0.5 | 2.0 | `SearchBox.test.tsx` (12), `useSearchTyping.test.tsx` (13); ExTester `main-shell.ui.test.ts:74` (`.nuiget-main-search-input`), `main-search.ui.test.ts:111` (`.nuiget-search-option--version`) |
| FolderGroups / groupByFolder | refactor | A shared module renders main-panel classes (`folderGroups.tsx:31-32`; `.nuiget-installed-folder` has no rule, `.nuiget-installed-folder-title` only in `main.css:690`); the sidebar re-implements the caption (`sidebar/InstalledSection.tsx:103-109`, `sidebar/UpdatesSection.tsx:156-163`, `sidebar.css:78-84`) with different margins | 0.25 (one GroupCaption primitive) | 0.5 | `MainParity.test.tsx:36`, `AllProjectsView.test.tsx` |
| parseSearchQuery, packageIcon, installed/rules, viewState, bus, store | keep | Not UI; store not audited line by line | 0 | – | – |

### 5.3 Main panel (`src/webview/main`)

| Component | Verdict | Evidence | Refactor | Rebuild | Tests touched |
|---|---|---|---:|---:|---|
| MainShell | refactor | 308 lines vs "< 300" (`docs/adr/008-webview-architecture.md:37`, `ARCHITECTURE.md:570`); tab counts computed in the shell (`MainShell.tsx:173-196`, 24 lines of store arithmetic); raw header controls (`:235-254`: two check boxes, one select); chrome duplicated with `SidebarView` (perf marks `:102-136` vs `SidebarView.tsx:74-89`, announce/outcomes `:100,139-147` vs `SidebarView.tsx:105-117`, `ui/focusSearch` `:138` vs `SidebarView.tsx:108`) | 0.75 | 2.0 | `MainShell.test.tsx` (25; 5 `parentElement` traversals, e.g. `:240-270`), `MainParity.test.tsx` (2), `main/index.test.tsx` (4); ExTester `main-shell.ui.test.ts:29-30,73-77`, `theme.ui.test.ts:226` (`.nuiget-main-toggle`, `.nuiget-main-select`) |
| InstalledTab | refactor (rebuild if the grouped list is chosen) | Bulk-selection state machine (`InstalledTab.tsx:52-173`) is the third copy of the one in `UpdatesTab.tsx:44-152` and `AllProjectsUpdates.tsx:169-271` | 0.5 | 1.25 | `InstalledTab.test.tsx` (17; 11 class, 2 `toHaveClass`), `AllProjectsView.test.tsx` (9; 6 class); ExTester `main-installed`, `main-all-projects` |
| InstalledProjectSection | refactor (rebuild if grouped) | 17 props; badges in the header's `actions` (`:160-192`) → V3; `busyStatus` copy (`:78-86`); `isVulnerable` copy (`:42` = `MainShell.tsx:74`); no sort (`visibleRows` `:46-59` filters only) while the sidebar sorts (`ProjectPackages.tsx:42`) | 0.5 | 1.25 | as InstalledTab |
| TransitiveSection | refactor (rebuild if grouped) | Rows without check column next to direct rows with one (§5.1 Row (c)); nested `FrameworkSection` header; classes `nuiget-transitive-content`, `nuiget-transitive-framework` without rules | 0.25 | 1.0 | `InstalledTab.test.tsx`; ExTester `main-transitive.ui.test.ts` |
| AllProjectsTransitiveSection | refactor (rebuild if grouped) | Domain functions `aggregateTransitive`, `rootsByProject`, `describeOrigins` (`:31-67`) live in a view module and are imported across features by `details/TransitiveDetails.tsx:6` | 0.25 | 0.75 | `AllProjectsView.test.tsx` |
| BulkUninstallDialog | refactor | Hand-built list body; class `nuiget-bulk-project` has no rule | 0.25 | 0.25 | `InstalledTab.test.tsx`; ExTester `confirm-dialog*` |
| **UpdatesTab + AllProjectsUpdates** | **rebuild** (merge into one sections-based tab) | Decision criterion: the rebuild is justified because the Installed tab already proves the one-`Section`-model shape for both modes (`InstalledTab.tsx:74-103`), not because the refactor is expensive (it is only 0.5 d cheaper). Two implementations of one tab: row render (`UpdatesTab.tsx:187-213` vs `AllProjectsUpdates.tsx:108-131`), `busyStatus` (`:95-103` vs `:70-78`), toggle, `updateOne`, toolbar (`:220-227` vs `:308-315`), banners (`:228-233` vs `:316-321`), `CentralUpdateDialog` wiring (`:236-249` vs `:330-343`). The Installed tab already does both modes through one `Section` model (`InstalledTab.tsx:74-103`). Single-project Updates renders no section header while single-project Installed does (judge-only: `main-updates.png` vs `main-installed-single.png`; code: `UpdatesTab.tsx:170-215` vs `InstalledProjectSection.tsx:183-193`) → part of V5. Both reuse the Installed feature's classes (`nuiget-installed`, `nuiget-installed-project*`). | 1.0 (extract hooks, keep two components) | 1.5 | `UpdatesTab.test.tsx` (20; 9 class incl. `closest('.nuiget-installed')` `:247`); ExTester `main-updates.ui.test.ts:67-69`, `main-all-projects.ui.test.ts` |
| UpdateAllDialog | refactor | Same as BulkUninstallDialog | 0.25 | 0.25 | `UpdatesTab.test.tsx` |
| CentralUpdateDialog | refactor | Mounted 6 times (`MainShell.tsx:304`, `DetailsPane.tsx:232,243`, `BrowseList.tsx:146`, `UpdatesTab.tsx:236`, `AllProjectsUpdates.tsx:330`); confirm handlers copied 3 times | 0.5 (one mount driven by a store action) | 1.0 | `CentralUpdateDialog.test.tsx` (6), `DetailsPane.test.tsx`, `BrowseList.test.tsx`, `useSearchTyping.test.tsx` |
| useInstallAction | refactor | Instantiated 3 times (`DetailsPane.tsx:65`, `BrowseList.tsx:47`, `useSearchTyping.ts:62`), each with its own `asking` (`useInstallAction.ts:43,74`); see X finding §8.8 | 0.5 | 1.0 | same as above |
| DetailsPane | refactor | Raw `<select>` with the shell's class `nuiget-main-select` and a hard-coded id `nuiget-details-version` (`:181-192`), three raw buttons (`:169-214`), two `CentralUpdateDialog`s | 0.5 | 1.5 | `DetailsPane.test.tsx` (26; `:87-88` asserts `parentElement` has class `nuiget-details-actions`); ExTester `main-details.ui.test.ts` |
| DetailsInfo | refactor | Facts as `dl` (`:69-78`); the same facts in `TransitiveDetails` use `.nuiget-details-row` spans (`TransitiveDetails.tsx:51-63`), and "Author(s)" vs "Authors:" → one PropertyList primitive | 0.25 | 0.75 | `DetailsPane.test.tsx:251` (`dt` → `parentElement`) |
| TransitiveDetails | refactor | See DetailsInfo; cross-feature import of `aggregateTransitive` (`:6`) | 0.25 | 0.5 | `InstalledTab.test.tsx`, `AllProjectsView.test.tsx`; ExTester `main-transitive` |
| ReadmeView + markdown.ts | keep | Sanitised render, copy buttons, image rewrite; class contract internal to `main.css:317-590` | 0 | 1.5 | `markdown.test.ts` (26; 7 own classes), `markdown.bench.ts` |
| MultiInstallDialog | refactor | Raw check-box list styled by `main.css:54-93`; own stream with the slice reducer (`:35-64`) is deliberate (N76/P9.8) | 0.25 | 1.0 | `MultiInstallDialog.test.tsx` (4) |
| BrowseList | refactor | 8th `renderRow` site; own `ProgressBar` and `CentralUpdateDialog` | 0.25 | 1.0 | `BrowseList.test.tsx` (17; 1 class) |
| useSearchTyping | keep | Timers and quick-search model, no markup | 0 | 1.0 | `useSearchTyping.test.tsx` (13) |
| SourcesControl | refactor | Raw `<select className="nuiget-main-select">` (`:37-52`) | 0.25 | 0.5 | `SourcesControl.test.tsx` (10) |
| SourceSettingsDialog | refactor | Form built from raw controls (6 buttons, 7 inputs, 8 labels, 1 select; `nuiget-field`, `nuiget-input`); Remove is an inline `role="group"` (`:48-53`) although `ARCHITECTURE.md:367,373` say ConfirmDialog covers "remove source" over Source Settings | 0.5 | 1.5 | `SourcesControl.test.tsx`; ExTester `main-sources.ui.test.ts`; lint `interaction-model-testids` (reads `sourceRowId`) |
| main/index.tsx | keep | | 0 | – | `main/index.test.tsx` |

### 5.4 Sidebar (`src/webview/sidebar`)

| Component | Verdict | Evidence | Refactor | Rebuild | Tests touched |
|---|---|---|---:|---:|---|
| SidebarView | refactor | Chrome duplicated with MainShell (see MainShell); `share` passed as a CSS flex value string (`:179,200` → `InstalledSection.tsx:22,125`, `UpdatesSection.tsx:23,221`) | 0.5 | 1.0 | `SidebarView.test.tsx` (25; 4 class), `SidebarLayout.test.tsx` (4), `SidebarParity.test.tsx` (3), `sidebar/index.test.tsx` (4); ExTester `sidebar.ui.test.ts:108-109`, `sidebar-parity.ui.test.ts` |
| InstalledSection | refactor (rebuild if grouped) | Folder caption re-implemented (`:103-109`); provisional badge wrapped in a span for tooltip and test id (`:136`); re-export of `shownVersion`, `whyNotRemovable` (`:11`) used only by `SidebarView.test.tsx:11`; collapsed content unmounted (`:139`) while the main panel keeps it with `hidden` (`InstalledProjectSection.tsx:195`) | 0.25 | 1.0 | `SidebarView.test.tsx`, `SidebarParity.test.tsx` |
| ProjectPackages | refactor (rebuild if grouped) | `busyStatus` copy (`:48-56`), sort copy (`:42`); badges show CPM only while the main panel shows SDK, props, floating/range, Vulnerable (`InstalledProjectSection.tsx:140-148`) | 0.25 | 0.75 | `SidebarView.test.tsx` |
| UpdatesSection | refactor (rebuild if grouped) | Inline Update-all confirm (`:238-257`) duplicates `UpdateAllDialog`; candidate rule `updateCandidates` (`:38-50`) is a third rule next to `UpdatesTab.tsx:90` and `AllProjectsUpdates.tsx:197-199`, and differs: only the sidebar's excludes unresolved rows through `whyNotUpdatable` | 0.5 | 1.0 | `UpdatesSection.test.tsx` (12; 3 class) |
| ProjectUpdates | refactor (rebuild if grouped) | `busyStatus` copy (`:52-60`), sort copy (`:45`), central-id set copy (`:46-48` = `UpdatesTab.tsx:66-68`) | 0.25 | 0.75 | `UpdatesSection.test.tsx` |
| BrowseResults | refactor | 8th row site's sibling; own CPM preview path by design (N77) | 0.25 | 0.75 | `BrowseResults.test.tsx` (9; 1 class) |
| index.tsx, rowRequests.ts, outcomes.ts | keep | `outcomes.ts` is `export { describeOutcome } from '../shared/store/outcomes'` (one line) | 0 | – | `outcomes.test.ts` (5) |

### 5.5 Missing primitives (build, not refactor)

| Primitive | Raw uses today | Cost |
|---|---|---:|
| Button (primary, secondary; danger per MI10) | 20 raw `<button className="nuiget-button …">` in 7 feature files (`grep -rc nuiget-button`): DetailsPane 3, CentralUpdateDialog 3, SourceSettingsDialog 6, InstalledTab 2, UpdatesTab 2, AllProjectsUpdates 2, MultiInstallDialog 2 | 0.25 |
| Select | 4 raw `<select className="nuiget-main-select">`: `MainShell.tsx:243`, `SourcesControl.tsx:37`, `DetailsPane.tsx:182`, `SourceSettingsDialog.tsx:130` | 0.25 |
| Checkbox | 6 raw check boxes (`MainShell.tsx:236,240`, `MultiInstallDialog.tsx:159`, `SourceSettingsDialog.tsx:42,143,166`); their look lives in `main.css:54-93` scoped to `.nuiget-main` and `.nuiget-dialog` | 0.25 |
| TextField | 4 `nuiget-input` uses in `SourceSettingsDialog.tsx:137-162`; the two search inputs (§5.2) | 0.25 |
| PropertyList | `DetailsInfo` `dl`, `TransitiveDetails` rows, `DetailsPane` actions grid (`main.css:287-310`) | 0.25 |
| GroupCaption (workspace folder) | `folderGroups.tsx:31-32`, `sidebar/InstalledSection.tsx:105-106`, `sidebar/UpdatesSection.tsx:158-159` | 0.25 |
| Typed package-row adapter over `Row` (one per data kind: installed, update, browse, transitive; icon, badges, busy status, version cell) | 8 `renderRow` sites (§5.1 Row (b), §8.4) | 0.5 |
| **Total** | | **2.0** |

---

## 6. Cost summary and calibration

Computed with `…/scripts/costs.mjs` from the tables above.

| Scenario | Planned days | Session hours at 1.1 h/day |
|---|---:|---:|
| Recommended verdicts (1 rebuild, 32 refactors, 13 keep) + new primitives and row adapter (§5.5) | 13.5 + 2.0 = **15.5** | **≈ 17** |
| … plus the grouped-list decision: `Listbox` 1.0 → 3.0 (+2.0) and InstalledTab, InstalledProjectSection, TransitiveSection, AllProjectsTransitiveSection, sidebar InstalledSection, ProjectPackages, UpdatesSection, ProjectUpdates become rebuilds (+5.0) | 15.5 + 7.0 = **22.5** | **≈ 25** |
| Every unit refactored (the Updates tab included) + §5.5 | 13.0 + 2.0 = 15.0 | ≈ 16.5 |
| Every unit rebuilt + §5.5 | 43.25 + 2.0 = 45.25 | ≈ 50 |

Per group (recommended / all-refactor / all-rebuild, days): primitives 3.25 / 3.25 / 16.0; shared 0.75 / 0.75 / 2.5;
main 7.5 / 7.0 / 19.5; sidebar 2.0 / 2.0 / 5.25; §5.5 new 2.0 in every scenario.

**Calibration (measured, not the plan's own figure).** The ~1.1 h per planned day rate was given by the research
brief and is not stated in the plan (the P9 table at `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:345-360` has
no estimate column). The git log of P9 gives the wall-clock basis: P9.0 at 10-16 20:57 to P9.12's last commit at 10-17
06:03 is 9.1 h for 13 items including CI waits and visual checks (≈ 0.7 h per item); single items: P9.2 (Row) 21:13 →
22:26 (1.2 h), P9.5 23:10 → 00:24 (≈ 1.2 h), P9.8 01:53 → 02:40 (0.8 h); the five CSS fixes P9.fix-2..6 landed
11:52 → 12:30 (≈ 8 min each after a ruling). The estimates above are judgement in quarter-day steps; they assume the
same protocol (gates, docs duties, CI, visual view of captures).

---

## 7. Which primitives each screen uses (rebuild order by screen)

From `grep -oE "<(Listbox|Row|SectionHeader|…)\b"` per module (raw controls counted with `grep -oE "<(select|input|button|label|ul|dl|form|img)\b"`).

| Screen | Modules | Primitives | Raw controls |
|---|---|---|---|
| Header / shell (main) | MainShell, SourcesControl | Tabs, SearchBox, IconButton, ProgressBar, Sash, Banner, EmptyState, LiveStatus | 2 check boxes, 2 selects |
| Installed (single + All Projects) | InstalledTab, InstalledProjectSection, TransitiveSection, AllProjectsTransitiveSection, FolderGroups, BulkUninstallDialog | **Listbox, Row**, SectionHeader, Toolbar, Badge, Banner, IconButton, Skeleton, EmptyState, ConfirmDialog | 2 buttons, 2 `<img>` |
| Updates (single + All Projects) | UpdatesTab, AllProjectsUpdates, UpdateAllDialog, CentralUpdateDialog | **Listbox, Row**, SectionHeader (All only), Toolbar, Badge, Banner, IconButton, Skeleton, EmptyState, ConfirmDialog, Dialog | 4 buttons, 2 `<img>`, 3 dialog buttons |
| Browse (main) | BrowseList, SearchBox (suggestions) | **Listbox, Row**, Badge, Banner, ProgressBar, Skeleton, EmptyState, Dialog (central) | 1 `<img>` |
| Details | DetailsPane, DetailsInfo, ReadmeView, TransitiveDetails, MultiInstallDialog | Tabs, SectionHeader (level 4), Banner, EmptyState, Skeleton, Badge, Dialog ×3 | 1 select, 5 buttons, 1 `dl`, 1 check-box list |
| Sources | SourcesControl, SourceSettingsDialog | Dialog, IconButton, Banner, EmptyState | 1 form: 6 buttons, 7 inputs, 1 select |
| Sidebar | SidebarView, InstalledSection, ProjectPackages, UpdatesSection, ProjectUpdates, BrowseResults | SearchBox, **Listbox, Row**, SectionHeader, Sash, IconButton, Badge, Banner, ProgressBar, Skeleton, EmptyState, ConfirmDialog, LiveStatus | – |
| Not used by any screen | – | **Popover** | – |

Proposed order (each step unblocks the screens to its right; after step 2 only step 4 is a rebuild):

1. Decide the list model (grouped single list or per-section lists). It decides 7.0 d and the §8 per-project ids;
   measure first (the bench does not cover the all-rows-mounted sections layout, §8.1).
2. `Listbox` (refactor, or rebuild under a grouped list) + the typed row adapter on `Row` (§5.5) → Installed,
   Updates, Browse, sidebar all at once (§5.1).
3. `SectionHeader`, `Toolbar`, `Tabs`, `Badge` variants → Installed and Updates chrome (V1–V5).
4. Merge the Updates tab (rebuild) on top of 2-3.
5. Button, Select, Checkbox, TextField, PropertyList, GroupCaption → header, Details, Sources, dialogs.
6. ConfirmDialog list API, one CentralUpdateDialog mount, one `useInstallAction`.
7. Shell chrome hook shared by MainShell and SidebarView.

---

## 8. Structural findings in detail

### 8.1 A primitive contract broken by feature CSS (Listbox virtualization)

- Contract: `Listbox` "A virtualized … list … Only the rows in view are in the document" (`Listbox.tsx:51-56`);
  "`Listbox` is always virtualized" (`ARCHITECTURE.md:342`).
- Feature CSS: `.nuiget-installed--sections .nuiget-listbox { flex: none; overflow: visible; }` (`main.css:218-222`)
  with the comment "The list is not its own scroll element then, so the virtualizer renders all of its rows"
  (`main.css:206-210`); `ARCHITECTURE.md:603-605` repeats "every list is as high as its rows". Also `.nuiget-transitive
  .nuiget-listbox` (`main.css:230-233`).
- Scope: the Installed tab in both modes (`InstalledTab.tsx:213`) and All Projects Updates (`AllProjectsUpdates.tsx:307`).
- Consequence: the virtualizer, the active-row-stays-mounted rule and `aria-setsize` still run, but every row is
  mounted; with a large solution the main panel mounts every installed package of every project. Not measured: the
  bench (`Listbox.bench.ts`) mounts a scrolling compact list only. **Hypothesis** (not verified against the
  `@tanstack/react-virtual` docs here): the virtualizer's `scrollMargin` with the outer scroller as scroll element
  would restore virtualization without changing the DOM (that is the refactor column's 1.0 d).

### 8.2 Listbox ↔ Row DOM coupling

`Listbox` finds options by structure (`[data-index="${index}"] > [role="option"]`, `Listbox.tsx:104`), reads
`aria-disabled` back from the DOM (`:141`, `:211`) and recognises a check-mark click by class (`.nuiget-row-check`,
`:210`); `testSupport.ts:21-22,48-52` lays out by `[data-index]`. A Listbox can therefore only host `Row`. Any Row
change is a Listbox change; any grouped-list design must give header rows a different marker.

### 8.3 Layout that leaks through props and class contracts

| Leak | Where | Why it is a leak |
|---|---|---|
| `share?: string` (a flex-grow number as text) | `sidebar/InstalledSection.tsx:21-22,125`, `sidebar/UpdatesSection.tsx:22-23,221`, from `SidebarView.tsx:179,200` | A CSS value as a prop of a feature component |
| `className` on `IconButton` | `IconButton.tsx:17,26`; callers `MainShell.tsx:256` (class has no rule), `SourcesControl.tsx:58` | Appearance chosen by the caller |
| `className` (required) on `SearchBox` | `SearchBox.tsx:48,310`; rules `main.css:121-141`, `sidebar.css:30-49` | The component's own input is styled twice outside it |
| `nuiget-toolbar-end` child class | `Toolbar.tsx:21-22`; `InstalledTab.tsx:218`, `UpdatesTab.tsx:224`, `AllProjectsUpdates.tsx:312` | A class name is the API |
| `nuiget-button`, `nuiget-main-select`, `nuiget-input`, `nuiget-field` | §5.5 | Primitive CSS used without a component |
| Badges in `SectionHeader.actions` | §5.1 SectionHeader | Slot misuse; no end padding → V3 |
| 21 feature rules that style primitive internals | `main.css:56,72,83,89` (dialog check box), `:115` (`.nuiget-progress`), `:164` (`.nuiget-tablist`), `:168,358,702,707` (section header), `:190` (`.nuiget-toolbar`), `:218,230` (`.nuiget-listbox`), `:264` (`.nuiget-tabpanel`); `sidebar.css:102,108,113,123,128` (section header), `:118,133` (`.nuiget-row-option`) | Variants of a primitive defined by its parents; the source of V1, V3, V4 |
| Shared module with one surface's classes | `shared/allProjects/folderGroups.tsx:31-32` → `main.css:690` only | A shared component that is unstyled in the sidebar |
| Cross-feature class reuse | `UpdatesTab.tsx:219` and `AllProjectsUpdates.tsx:139,152,307` use `nuiget-installed*` | The Updates tab depends on the Installed tab's layout rules |

`cssVars` itself is respected: all 7 production `style=` props go through it (`grep -rn "style=" src/webview --include='*.tsx'`).

### 8.4 Duplicated logic between the main panel and the sidebar (and within the main panel)

| Logic | Copies | Locations |
|---|---:|---|
| `busyStatus` (operation kind → "Updating" …) | 5 | `InstalledProjectSection.tsx:78-86`, `UpdatesTab.tsx:95-103`, `AllProjectsUpdates.tsx:70-78`, `ProjectPackages.tsx:48-56`, `ProjectUpdates.tsx:52-60` |
| Filter + sort by id | 5 sorts (main Installed does not sort) | `ProjectPackages.tsx:42`, `ProjectUpdates.tsx:45`, `UpdatesSection.tsx:49`, `UpdatesTab.tsx:88`, `AllProjectsUpdates.tsx:196` |
| Update-all candidate rule | 3, not identical | `UpdatesTab.tsx:90`, `AllProjectsUpdates.tsx:197-199`, `UpdatesSection.tsx:38-50` (only this one applies `whyNotUpdatable`) |
| Bulk-selection state (set by project, select all, confirm) | 3 | `InstalledTab.tsx:52-173`, `UpdatesTab.tsx:44-152`, `AllProjectsUpdates.tsx:169-271` |
| Central id set / CPM badge title | 3 / 3 | `UpdatesTab.tsx:66-68,206`, `AllProjectsUpdates.tsx:31-35,126`, `ProjectUpdates.tsx:46-48,118` |
| Row icon `<img src alt="">` | 5 | `InstalledProjectSection.tsx:134`, `TransitiveSection.tsx:155`, `UpdatesTab.tsx:201`, `AllProjectsUpdates.tsx:122`, `BrowseList.tsx:139` |
| `isVulnerable` | 2 | `MainShell.tsx:74`, `InstalledProjectSection.tsx:42` |
| Perf marks, announce, outcome announcement, `ui/focusSearch` | 2 | `MainShell.tsx:100-147`, `SidebarView.tsx:74-117` |
| Bulk list in a confirmation | 3 bodies, 2 identical rules | `BulkUninstallDialog.tsx:32-39`, `UpdateAllDialog.tsx:25-36`, `UpdatesSection.tsx:245-256`; `main.css:236-242` = `sidebar.css:90-98` |
| Workspace-folder caption | 2 implementations | `folderGroups.tsx:23-37` vs `InstalledSection.tsx:103-109` + `UpdatesSection.tsx:156-163` |
| Search input rule | 2 | `main.css:121-141`, `sidebar.css:30-49` |
| All Projects project header in normal case | 2 | `main.css:702-710`, `sidebar.css:123-131` |
| `CentralUpdateDialog` mounts | 6 | §5.3 |
| `useInstallAction` instances | 3 | §5.3 |

ADR-008 expected the opposite: "Sidebar and main panel share list rows, selection, filtering and optimistic
reconciliation" (`docs/adr/008-webview-architecture.md:43`). They share `Row` and `Listbox`; filtering, sorting,
busy text, selection and candidate rules are per feature.

### 8.5 Two implementations of the Updates tab

See §5.3. Measured: `UpdatesTab.tsx` 252 + `AllProjectsUpdates.tsx` 346 = 598 lines for one tab, against
`InstalledTab.tsx` 230 + `InstalledProjectSection.tsx` 206 = 436 lines for the Installed tab, which handles both modes
with one `Section` model.

### 8.6 Missing primitives

See §5.5. The interaction model and ARCHITECTURE describe a Button only as "the action of an empty state or a
banner" (`primitives.css:505`), yet 20 feature buttons use its class.

### 8.7 Dead or orphaned code

| Item | Evidence | Note |
|---|---|---|
| `Popover` (172 lines, 15 tests) | No production importer (grep); doc names Multi Install (`Popover.tsx:56`), which uses `Dialog` | Adopt for the context menu (§8.8) or delete |
| 13 icons | §5.1 icons | No bundle cost (`/* @__PURE__ */`) |
| `Listbox` props `estimateSize`, `overscan` | No feature passes them (grep) | Only the default is exercised (`Listbox.test.tsx:253`) |
| Re-export `shownVersion`, `whyNotRemovable` from `sidebar/InstalledSection.tsx:11` | Imported only by `SidebarView.test.tsx:11` | Comment in `rules.ts:3-7` explains the history |
| `sidebar/outcomes.ts` | One line re-exporting `describeOutcome`; `MainShell.tsx:12` imports the shared module directly | Indirection |
| Classes rendered without any CSS rule (9) | `nuiget-bulk-project`, `nuiget-main-refresh`, `nuiget-installed-folder`, `nuiget-sidebar-folder`, `nuiget-source-name`, `nuiget-tab-label`, `nuiget-transitive-content`, `nuiget-transitive-framework`, `nuiget-updates` (per-class grep of the four stylesheets) | `nuiget-tab-label` is read by ExTester (`main-shell.ui.test.ts:75`): a test hook expressed as a class, outside §8 |
| Exported types/functions used only by tests | 57 rows from `exports.mjs` (props interfaces, reducers exported for unit tests) | Normal; not debt |

### 8.8 Interaction debt that comes from component structure

1. **The main panel has no row context menu, and its Installed list promises one.** `InstalledProjectSection.tsx:40`
   hint: "Shift+F10 opens the actions menu."; no main-panel list passes the handler —
   `grep -n "onContextMenu" src/webview/main/features/installed/*.tsx src/webview/main/features/updates/*.tsx
   src/webview/main/features/search/BrowseList.tsx src/webview/main/MainShell.tsx` returns no line (exit 1). So
   `Listbox` calls `onContextMenu?.()` on nothing (`Listbox.tsx:168-172`) and, on right-click over a row, calls
   `event.preventDefault()` (`:221`) before the optional call (`:222`), which also suppresses the webview's native menu. The
   interaction model says Shift+F10, the ContextMenu key and right-click open "the actions menu for the active row"
   (`docs/ux/interaction-model.md:95-97`), and lists the context menu as an entry point of Install/Uninstall (`:82-83`).
   The parity audit left this unexamined (`docs/plans/parity-audit-2026-10-16.md:1513`, item (e)). The sidebar has it
   through the host's QuickPick (`sidebar/rowRequests.ts:22-24`). `Popover` exists and is unused.
2. **Install preview state is per instance.** Three `useInstallAction` instances each keep `asking`
   (`useInstallAction.ts:43`) and `check` refuses only on its own (`:74`). **Hypothesis** (not reproduced): Ctrl+Enter
   on a Browse row while the pane's Install is waiting for `cpm/preview` sends a second `cpm/preview`; `isPackageBusy`
   protects only after `run()` (`:83,95`).
3. **Different order of the same project's packages on the two surfaces.** The host emits installed packages in
   declaration order, props file first (`src/core/project/inspector.ts:124-137`, provisional path); the sidebar sorts by
   id (`ProjectPackages.tsx:42`), the main Installed list does not (`InstalledProjectSection.tsx:46-59`). The order of
   the authoritative (msbuild) path was not traced.
4. **One tab stop per project list.** All Projects renders a `SectionHeader` button plus one `Listbox` per project
   (`InstalledTab.tsx:187-209`), so Tab visits 2×N stops and the arrow keys stop at each project; VS Code's multi-root
   views present one tree. **Hypothesis** for the workbench comparison (not verified against VS Code source).
5. **Different badge sets on the two surfaces.** Main Installed rows show SDK, props, CPM, floating/range, Vulnerable
   (`InstalledProjectSection.tsx:140-148`); sidebar rows show CPM only (`ProjectPackages.tsx:112`). Possibly deliberate
   for compact rows; not documented in `docs/ux/interaction-model.md` §4 as such (not verified exhaustively).

### 8.9 Documentation drift found on the way

| Doc says | Code does |
|---|---|
| ConfirmDialog covers "remove source" and "Remove source over Source Settings" (`ARCHITECTURE.md:367,373`) | Inline `role="group"` confirmation inside the row (`SourceSettingsDialog.tsx:48-53`); `ARCHITECTURE.md:754` ("an in-dialog confirmation") matches the code |
| The page behind a dialog "is not dimmed, because no theme colour exists for a scrim" (`Dialog.tsx:31-33`) | Scrim `--nuiget-color-scrim` since P9.11 (`ARCHITECTURE.md:378-380`) |
| The shell is "< 300 lines" (`docs/adr/008-webview-architecture.md:37`, `ARCHITECTURE.md:570`) | 308 lines |
| `Popover` is "for example the project picker of Multi Install" (`Popover.tsx:56`) | Multi Install is a `Dialog`; nothing uses `Popover` |
| Feature folders `all-projects`, `transitive` (`docs/adr/008-webview-architecture.md:36-37`) | Folded into `installed/` and `updates/` |

---

## 9. The owner's V1–V5 traced to components

The captures were viewed; the code causes are measurable, the visual verdicts are judge-only.

| Finding | Component cause (code) | Capture check (judge-only) |
|---|---|---|
| V1 tab bar and bulk toolbar squeezed | `.nuiget-tab` `min-height: var(--nuiget-target-min)` (24 px) with `padding: 0 var(--nuiget-space-4)` (`primitives.css:799-812`); toolbar padding `var(--nuiget-space-2)` (4 px) set from feature CSS (`main.css:190-195`); buttons at the 24 px target (`primitives.css:507-511`) | `main-installed-single.png`, `main-updates.png`: tabs ≈ 24 px, toolbar row ≈ 30 px |
| V2 Select all and Uninstall selected misaligned | Toolbar start uses `--nuiget-inset` and end `--nuiget-space-3` (`main.css:192-194`) while rows start with the option's `padding: 0 var(--nuiget-space-4)` (`primitives.css:97`) plus the check column; primary pushed by `nuiget-toolbar-end` | `main-installed-single.png` |
| V3 provisional badge overlaps the list's right border | Badges passed as `SectionHeader.actions` (`InstalledProjectSection.tsx:160-180`); no end padding on `.nuiget-section-header`/`.nuiget-section-actions` (`primitives.css:451-455,499-503`) | `main-installed-all.png` (provisional at the edge); the same for the TFM badge in `main-transitive-expanded.png` (`TransitiveSection.tsx:110`) |
| V4 small top, large bottom margin of section headers | Header at `min-height: var(--nuiget-row-height-compact)` with no vertical margin (`primitives.css:451-455`), followed by a 78 px card whose content is centred (`tokens.css:33`, Row CSS) — the gap below is the card's internal padding, not a header margin | `main-installed-single.png`, `main-transitive-expanded.png` |
| V5 spacing follows no single scale | The values come from four owners for one column: tab list calc (`main.css:164`), toolbar (`main.css:190-195`), section toggle (`main.css:168`, `primitives.css:474`), row option (`primitives.css:97`), plus feature overrides (§8.3); single-project Updates has no section header while Installed has one (`UpdatesTab.tsx:170-215`) | `main-installed-single.png`, `main-updates.png` |

---

## 10. Test coupling

### 10.1 jsdom tests (`src/webview/**`)

`node …/scripts/coupling.mjs . src/webview` (regex counts; "tests" = `it(`/`test(` calls; classSel = string selectors
containing `.nuiget-…`; firstChild = `firstChild|firstElementChild|lastChild|children[|childNodes|parentElement|…Sibling`).

| file | tests | classSel | toHaveClass | traversal | snapshot | byRole | byTestId | byText etc. | axe |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main/MainParity.test.tsx | 2 | 0 | 0 | 0 | 0 | 0 | 3 | 1 | 0 |
| main/MainShell.test.tsx | 25 | 0 | 0 | 5 | 0 | 32 | 37 | 0 | 1 |
| main/features/details/DetailsPane.test.tsx | 26 | 0 | 1 | 4 | 0 | 24 | 55 | 3 | 3 |
| main/features/details/MultiInstallDialog.test.tsx | 4 | 0 | 0 | 0 | 0 | 20 | 8 | 0 | 0 |
| main/features/details/markdown.test.ts | 26 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| main/features/installed/AllProjectsView.test.tsx | 9 | 6 | 0 | 0 | 0 | 15 | 21 | 3 | 1 |
| main/features/installed/InstalledTab.test.tsx | 17 | 11 | 2 | 0 | 0 | 25 | 45 | 8 | 2 |
| main/features/search/BrowseList.test.tsx | 17 | 1 | 0 | 0 | 0 | 8 | 15 | 4 | 1 |
| main/features/search/useSearchTyping.test.tsx | 13 | 0 | 0 | 0 | 0 | 20 | 4 | 0 | 0 |
| main/features/sources/SourcesControl.test.tsx | 10 | 0 | 0 | 0 | 0 | 26 | 13 | 12 | 2 |
| main/features/updates/CentralUpdateDialog.test.tsx | 6 | 0 | 0 | 0 | 0 | 5 | 3 | 0 | 1 |
| main/features/updates/UpdatesTab.test.tsx | 20 | 9 | 1 | 0 | 0 | 9 | 52 | 9 | 4 |
| main/index.test.tsx | 4 | 0 | 0 | 0 | 0 | 1 | 4 | 0 | 0 |
| shared/primitives/Badge.test.tsx | 3 | 2 | 3 | 0 | 0 | 0 | 0 | 2 | 1 |
| shared/primitives/Banner.test.tsx | 4 | 1 | 2 | 0 | 0 | 4 | 5 | 0 | 1 |
| shared/primitives/ConfirmDialog.test.tsx | 7 | 0 | 0 | 0 | 0 | 4 | 10 | 0 | 1 |
| shared/primitives/Dialog.test.tsx | 11 | 1 | 0 | 1 | 0 | 31 | 3 | 0 | 1 |
| shared/primitives/EmptyState.test.tsx | 2 | 0 | 0 | 0 | 0 | 2 | 1 | 0 | 1 |
| shared/primitives/ErrorBoundary.test.tsx | 2 | 0 | 0 | 0 | 0 | 3 | 0 | 3 | 1 |
| shared/primitives/IconButton.test.tsx | 3 | 0 | 0 | 2 | 0 | 3 | 1 | 0 | 1 |
| shared/primitives/Listbox.test.tsx | 24 | 6 | 0 | 0 | 0 | 9 | 4 | 0 | 4 |
| shared/primitives/LiveStatus.test.tsx | 4 | 0 | 1 | 0 | 0 | 7 | 1 | 0 | 1 |
| shared/primitives/Popover.test.tsx | 15 | 2 | 0 | 1 | 0 | 36 | 0 | 2 | 1 |
| shared/primitives/ProgressBar.test.tsx | 3 | 0 | 4 | 0 | 0 | 6 | 0 | 0 | 1 |
| shared/primitives/Row.test.tsx | 21 | 31 | 3 | 1 | 0 | 19 | 12 | 1 | 3 |
| shared/primitives/Sash.test.tsx | 6 | 0 | 2 | 0 | 0 | 10 | 4 | 0 | 1 |
| shared/primitives/SectionHeader.test.tsx | 7 | 4 | 0 | 0 | 0 | 12 | 2 | 0 | 1 |
| shared/primitives/Skeleton.test.tsx | 2 | 4 | 0 | 0 | 0 | 0 | 1 | 0 | 1 |
| shared/primitives/Spinner.test.tsx | 3 | 1 | 0 | 0 | 0 | 2 | 0 | 0 | 1 |
| shared/primitives/Tabs.test.tsx | 6 | 0 | 0 | 0 | 0 | 13 | 2 | 0 | 2 |
| shared/primitives/Toolbar.test.tsx | 6 | 0 | 0 | 0 | 0 | 7 | 13 | 0 | 1 |
| shared/primitives/composed.test.tsx | 3 | 0 | 0 | 0 | 0 | 9 | 1 | 0 | 3 |
| shared/primitives/icons.test.tsx | 8 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 3 |
| shared/search/SearchBox.test.tsx | 12 | 0 | 0 | 0 | 0 | 28 | 1 | 0 | 3 |
| sidebar/BrowseResults.test.tsx | 9 | 1 | 0 | 0 | 0 | 16 | 17 | 1 | 1 |
| sidebar/SidebarLayout.test.tsx | 4 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 0 |
| sidebar/SidebarParity.test.tsx | 3 | 0 | 0 | 0 | 0 | 2 | 6 | 0 | 0 |
| sidebar/SidebarView.test.tsx | 25 | 4 | 0 | 0 | 0 | 12 | 45 | 4 | 4 |
| sidebar/UpdatesSection.test.tsx | 12 | 3 | 0 | 0 | 0 | 7 | 26 | 1 | 3 |
| sidebar/index.test.tsx | 4 | 0 | 0 | 0 | 0 | 1 | 4 | 0 | 0 |
| (store, bus, search parser, rules, packageIcon, outcomes: 19 files) | 195 | 0 | 0 | 0 | 0 | 13 | 16 | 1 | 0 |
| **TOTAL (59 files)** | **562** | **94** | **20** | **14** | **0** | **443** | **440** | **55** | **56** |

### 10.2 Where the class selectors point

- Primitive tests: 52 (Row 31: `.nuiget-row-version` 5, `-authors` 4, `-check` 4, `-body` 3, `-icon` 3, `-actions`,
  `-description`, `-line`, `-meta`, `-name` 2 each, `-version-new` 1, `.nuiget-spinner` 1; Listbox 6; SectionHeader 4;
  Skeleton 4; Badge 2; Popover 2; Banner, Dialog, Spinner 1 each).
- Feature tests reaching **primitive** classes: 32 (InstalledTab 10: `.nuiget-row-check` 4, `.nuiget-section-header` 3,
  `.nuiget-row-icon` 2, `.nuiget-row-name` 1; UpdatesTab 8; AllProjectsView 5; SidebarView 4; UpdatesSection 3;
  BrowseList 1; BrowseResults 1).
- Feature tests reaching **feature** classes: 10 (markdown copy button 7, `.nuiget-installed-lists` 2, `.nuiget-installed` 1).
- Computed-style reads that pin rule text: 18 in 3 files — `Row.test.tsx:240-285` (7), `MainParity.test.tsx:46-66` (7),
  `SidebarParity.test.tsx:18-19,72-91` (4: exact `calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + …)` strings).
  These break under a refactor of the rules as much as under a rebuild.
- Structure reads: `MainShell.test.tsx:240-270` (sash `parentElement` is the split), `DetailsPane.test.tsx:87-88,251`
  (`parentElement` has `nuiget-details-actions`; `dt` → `parentElement`), `Dialog.test.tsx:46`, `Popover.test.tsx:77`,
  `Row.test.tsx:77` (actions' parent is the wrapper), `IconButton.test.tsx:20-21`.

### 10.3 ExTester (`src/test/ui/v2`, 13 files, 1 964 lines)

| Class read | Count | Where |
|---|---:|---|
| `.nuiget-row`, `.nuiget-row-name`, `.nuiget-row-check`, `.nuiget-row-icon`, `.nuiget-row-authors`, `.nuiget-row-version` | 13 | `mainWebview.ts:104-107`, `main-installed.ui.test.ts:74,81-83,133`, `main-updates.ui.test.ts:67-69`, `sidebar.ui.test.ts:108-109` |
| `.nuiget-section-header`, `.nuiget-section-chevron` | 3 | `main-installed.ui.test.ts:131`, `main-transitive.ui.test.ts:90`, `main-shell.ui.test.ts:77` |
| `.nuiget-main-split`, `.nuiget-main-list`, `.nuiget-main-title`, `.nuiget-main-search-input`, `.nuiget-tab-label` | 5 | `main-shell.ui.test.ts:29-30,73-75` |
| `.nuiget-tab`, `.nuiget-main-toggle`, `.nuiget-main-select`, `.nuiget-button` | 4 | `theme.ui.test.ts:226` (HC border probe) |
| `.nuiget-search-option--version` | 1 | `main-search.ui.test.ts:111` |
| **Total** | **26** | 9 of 13 files |

Plus one structure read: `[data-testid="installed-list"] [role="option"]` → `firstElementChild` (`main-shell.ui.test.ts:84`,
the P9.fix-6 inset test), which assumes the first child of the option is the check mark or the icon. Test ids read by
ExTester: at least 45 distinct (regex count; most often `package-row-serilog` 18, `package-row-newtonsoft.json` 17, `installed-list` 9,
`sidebar-installed-list` 9). e2e (`src/test/e2e/v2-*.e2e.test.ts`) reads no DOM; the harness (`src/test/harness`)
drives `FakeWebview`, not the React tree (`docs/plans/STATUS.md:1064`), so neither is touched by any verdict here.

### 10.4 What §8 pins

- 29 table rows in three tables, several ids per row (`docs/ux/interaction-model.md:160-208`), every hook rendered by a product file today (map in
  this audit: `grep -rlE "(\"|'|\`)<id>" src/webview` per id). The lint fails for a hook nobody renders.
- The row hook is defined structurally: "`package-row-<id>` | A row (id lower-cased): the wrapper around the option and its
  pointer actions; the option is the `role="option"` inside it" (`:171`). Any row design keeps this triad or changes §8,
  the lint and ExTester in the same change ("Removing or renaming a hook requires updating this table and the ExTester
  tests in the same change", `:204`).
- Per-project list ids (`installed-list-<name>`, `updates-list-<name>`, `sidebar-installed-list-<name>`,
  `sidebar-updates-list-<name>`, `:199-200`) assume one listbox per project: the grouped-list option changes them.
- `source-row-<name>` is produced by `sourceRowId` (`SourceSettingsDialog.tsx:18`), which the lint imports.

### 10.5 Survival rule for a rebuild

A rebuild breaks few tests when it keeps: (1) every role and accessible name the tests query (443 `*ByRole`);
(2) every §8 test id (440 `*ByTestId` plus at least 45 ids in ExTester); (3) the six `.nuiget-row-*` class names ExTester reads;
(4) the option's first child as the leading column (P9.fix-6 test). It still pays for the 18 computed-style reads
and the 31 class selectors in `Row.test.tsx`, which test internals by design.

---

## 11. Lint gates any change here will hit

`src/test/lint/interaction-model-testids.test.ts` (hooks), `webview-stylesheets.test.ts` (`pxSpacing`, `!important`,
px font sizes, literal durations, foreign class prefixes, pointer targets), `webview-colours.test.ts`,
`webview-tokens.test.ts` (token names the primitives rely on; HC block pinned), `webview-css-baseline.test.ts`
(Chromium 114; `:has()` passes today), `webview-icons-pure.test.ts` (icon count = exports), `docs-drift.test.ts`
(ARCHITECTURE and §8 name only things that exist), `import-boundaries.test.ts`. Not re-read in detail for this audit:
`regression-matrix.test.ts`, `vsix-contents.test.ts`.

---

## 12. Not reachable and gaps

**Not reachable / not opened:** none of the listed sources failed to open. Not used: web sources (none were needed for
this dimension); VS Code source code (so every "VS Code views use one tree" comparison is labelled hypothesis);
`@tanstack/react-virtual` documentation (the `scrollMargin` refactor path is a hypothesis).

**Gaps (known, not covered):**

- Store slices (`src/webview/shared/store/*`, 1 973 lines) were not read line by line; verdict keep by default.
- `tokens.css` was not audited (another dimension); only the spacing and row tokens were read.
- `main.css` README typography rules (`:317-590`) were not read in detail.
- Captures viewed: 5 of 15 (`main-installed-single`, `main-installed-all`, `main-updates`, `main-transitive-expanded`,
  `sidebar-sections`); light/HC captures and the 1.18.9 reference JPGs were not viewed.
- No runtime measurement: the number of mounted rows in the sections layout, render cost with large solutions, and the
  `cpm/preview` race (§8.8 item 2) are unmeasured.
- The authoritative (msbuild) order of installed packages was not traced (§8.8 item 3).
- The "tests" counts are regex counts of `it(`/`test(` calls, not Vitest's own count.
- Costs are judgement in quarter-day steps on the P9 calibration (§6), not measured per component.

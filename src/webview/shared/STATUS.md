# STATUS — src/webview/shared   commit 6df4567 (P9.1; parent of the P9.2 commit)   2026-10-16T20:00:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`,
`ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `src/test/lint/webview-tokens.test.ts`,
`src/webview/shared/tokens.css`, `src/webview/shared/primitives/{Row.tsx,Row.test.tsx,Listbox.tsx,primitives.css,testSupport.ts}`,
`src/webview/shared/STATUS.md`

Item: **P9.2** ⚑ — the Row primitive as the 1.x card (D14, D15; parity audit MI3, MU11, MB1, DP7, MH5), by the ruling
below. This note replaces the P7.5b note (history at `71cf359`).

## Verified by running

```text
baseline (6df4567)          → npx tsc --noEmit 0 · npx eslint src 0 · npx vitest run exit 0
npx tsc --noEmit            → exit 0
npm run check-types         → exit 0
npx eslint src              → exit 0
npm run lint                → exit 0
npx vitest run --project backend src/test/lint → Tests 131 passed (131) (before the two REQUIRED tokens were added)
npx vitest run --project frontend src/webview/shared/primitives/Row.test.tsx → Tests 17 passed (17): the thirteen
                              existing titles and the four of "Row layout (P9.2, D15)"
npx vitest run --project frontend src/webview → Test Files 55 passed (55) · Tests 483 passed (483)
git diff --name-only HEAD -- 'src/webview/**/*.test.tsx' 'src/webview/**/*.bench.ts' → src/webview/shared/primitives/Row.test.tsx only
npm test                    → exit 0 · Test Files 130 passed (130) · Tests 1918 passed | 9 skipped (1927)
npm run bench               → exit 0
npm run docs:check          → exit 0
rm -rf dist out/esbuild && node esbuild.mjs --production --analyze → exit 0 · dist/extension.js 293359 / 322502 ·
                              dist/webview.js 526452 / 577766 (+1211) · dist/sidebar.js 320531 / 351245 (+1218)
npm run package:vsix        → SKIPPED locally: no host or packaging change
CI run 38958055306 (83afc1b) → 9 jobs green, UI red: the six theme tests, "color-contrast nodes that passed in the
                              sidebar under <theme>: expected 5 to be at least 10" (P9.1's run: 13). Cause: the
                              compact `.nuiget-row-line` is `display: contents` (a 0 by 0 box) and kept the base rule's
                              `overflow: hidden`; axe takes text under a clipping ancestor with an empty box for hidden
                              and measured neither name nor version of the four sidebar rows (8 nodes). Fix (attempt 1):
                              `overflow: visible` on the compact line
rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui → exit 0 · 37 passing (1m) ·
                              "[theme] sidebar under <each of six themes>: passes {"color-contrast":13,"target-size":7};
                              incomplete 0"
CI run 38958869599 (57b8273) → 10 jobs green. Visual gate red (RUN.md §4): `main-updates.png` and
                              `main-installed-single.png` show comfortable rows about 90 px high, a two-line update
                              row included. Cause: the option inherits the 66 px minimum (`min-height: inherit`) and the
                              12 px padding was added outside it (`content-box`). Fix (attempt 2): `box-sizing:
                              border-box` on the comfortable option, as 1.x had; test `a comfortable row keeps its
                              padding inside the 66 px minimum` (fails without the fix: negative control run)
npx vitest run --project frontend src/webview/shared/primitives/Row.test.tsx → Tests 18 passed (18)
rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui → exit 0 · 37 passing (1m);
                              local `main-installed-single.png`: the three-line Installed rows (description still on
                              line 3 until P9.3) about 78 px
```

## Done (tested)

- `tokens.css`: `--nuiget-row-height-comfortable: 66px`; `--nuiget-icon-size-xl: 32px`; `--nuiget-color-version-new:
  var(--vscode-gitDecoration-addedResourceForeground, var(--vscode-charts-green))` with the measured ratios in its
  comment; `CanvasText` under forced colours. `--nuiget-row-height-compact` stays 24.
- `Listbox.tsx`: `ROW_HEIGHT.comfortable` 66; it still measures rows.
- `Row.tsx`: `version` narrowed to `string`; new `nextVersion`, `authors`, `verified`. Option = check, icon column
  (comfortable, always there), `.nuiget-row-body[title]` with two `.nuiget-row-line`s (name + badges; version with
  the text arrow and the new version, authors with the Verified mark, status) and the description. Name =
  name + version ids; description = badges, authors, description, status ids. The Verified icon and the authors are
  separated by a text space, not a margin: without it the description read "…by its ownerSerilog Contributors".
- `primitives.css`: the card (12 px padding, 32 px icon column, `gap` 12 px, bottom border on the wrapper, inset 3 px
  accent on the selected and the current row), the compact one-liner (`display: contents` on the lines; name
  `flex-shrink: 0`, `max-width: 70%`; version `flex-shrink: 1`, `min-width: 0`, ellipsis; badges pushed right;
  authors, description and status visually hidden). `.nuiget-row-title` and `.nuiget-row-desc` removed.
- `testSupport.ts`: `installStylesheet()` puts `tokens.css` and `primitives.css` into the jsdom document.
- `src/test/lint/webview-tokens.test.ts`: `--nuiget-icon-size-xl` and `--nuiget-color-version-new` added to
  `REQUIRED` (additive, approved by the ruling).
- Tests (`Row.test.tsx`, "Row layout (P9.2, D15)"): `comfortable row stacks name over version and authors`, `long
  version never hides the name in compact density`, `an update row reads old → new as text and marks the new
  version`, `the tooltip is on the body, not on the option`. The thirteen existing titles and bodies are unchanged.
- Docs: ARCHITECTURE row block; CHANGELOG `[Unreleased]` `### Changed`; gotchas "A `title` on a row" and
  "`display: contents` and axe" (the fix-forward).
- P9.3 (ruling in `src/webview/main/STATUS.md`): `Row` `selectable` (`false` draws `.nuiget-row-check--off`, a dashed
  muted empty mark) with the test `a row that cannot join a bulk action shows a muted check mark`;
  `installed/rules.ts` `versionCell` (additive) with `installed/rules.test.ts`.
- P9.4 (ruling in `src/webview/main/STATUS.md`): `store/ops.tsx` `merge` keeps the union of an operation's projects
  and packages across its reports (MU3), test `a per-step report keeps every package of the operation busy`.
- P9.4 fix-forward: the update arrow is a text node of `.nuiget-row-version`; `.nuiget-row-version-arrow` removed
  (axe left the symbol-only span incomplete in the theme pass of CI run 38965520035).
- P9.5 (ruling in `src/webview/main/STATUS.md`): `store/transitive.tsx` prefetches 500 ms after the installed list;
  `store/details.tsx` origin `'transitive'` asks no feed request; `store/allProjects.tsx` asks `transitive/metadata`
  once per answer of the aggregate stream (`transitive.metadata`). Tests: the prefetch, the transitive selection and
  the aggregate metadata ask.
- P9.6 (a) (ruling in `src/webview/main/STATUS.md`): `Row.meta` (Browse downloads after the version, in the
  description); `store/details.tsx` one selection per view (`installed`, `updates`, `browse`) with a stable
  `showView`.
- P9.6 (b): `store/search.tsx` `suggest()` keeps the groups it shows while it asks (`suggesting`); `search/SearchBox.tsx`
  groups suggestions per source (`role="group"` with a header from two sources on), a disabled `Searching…` row, the
  versions level (ArrowRight, ArrowLeft, `‹ <id>` header, five versions, loading and error rows) and Ctrl/Cmd+Enter
  (`onQuickInstall`); the popup wrapper and its rules in `search.css`.

- P9.7 (a) (2026-10-17, ruling in `src/webview/main/STATUS.md`): `SearchBox` has Clear (with text) and Filters
  buttons inside the box, `tabIndex={-1}`, focus kept in the input; the native search cancel button is hidden
  (`search.css`); `IconButton` passes `onMouseDown` through. Test: `Clear empties the box and keeps focus; Filters
  opens the prefix list`. Closes SB6 for the sidebar too (shared component).
- P9.7 (b): `viewState.ts` (`ViewStateStore`, re-exported by `SidebarView.tsx`); `Tabs` `badge` (test `a tab with a
  count and a badge names both`); `SearchBox` pads for the buttons it shows (`nuiget-search-box--clearable`).
- P9.8 (b) (2026-10-17, ruling in `src/webview/main/STATUS.md`): `SectionHeader` `level` 4 (test `renders the heading
  level asked`); `store/details.tsx` `DetailsSelection.known` (`verified`, `totalDownloads`); `store/allProjects.tsx`
  exports `EMPTY_ALL_PROJECTS` and `AllProjectsStored` for the project picker's own stream (no logic change).
- P9.8 (c): `tokens.css` README table and block-quote colours (`--nuiget-color-table-header-bg`,
  `--nuiget-color-table-row-alt-bg`, `--nuiget-color-blockquote-bg`, `--nuiget-color-blockquote-border`), `Canvas`/`CanvasText`
  under forced colours, not in the high-contrast block.

## Done (untested)

- None in jsdom. The rendering is checked in the UI job's screenshots after the push.

## Not started

- Consumers pass `authors`, `verified`, `nextVersion` and the icon in P9.3 (Installed), P9.4 (Updates), P9.5
  (transitive), P9.6 (Browse), P9.10 (sidebar).

## Visual check of P9.2 (CI run 38959927494 on a9b30ef, 10 jobs green, 12 PNGs)

- viewed: main-updates.png: two-line cards, 67 px apart (name bold + Verified; `13.0.2 → 13.0.4` muted, no
  `nextVersion` yet), empty 32 px icon column, a line under each row. Details pane still NUnit (stale, P9.6).
- viewed: main-installed-single.png: three-line cards (name, version, description until P9.3 drops it), 78 px;
  the current row has the selection colour and the 3 px accent on the left.
- viewed: main-browse-results.png (run 38958869599, unchanged since): cards with the 24 px data-URI icons in the
  32 px column, "by … · downloads · description" on line 3 (BrowseList's own text until P9.6).
- viewed: sidebar-sections.png (run 38958869599): compact rows 24 px, name first.
- viewed: sidebar-narrow-200px.png: at 200 px the Updates row reads "Newtonsoft.Json 13.0.2…": the name stays whole,
  the version gives way (before P9.2: "Newton… 13.0.2 → 13.0.4").

## Visual check of P9.1 (RUN.md §4; P9.1 changed `src/webview/shared` without rendering anything)

- viewed: main-browse-results.png (CI run 38953375673, P9.1): same as at P9.0; Browse rows with and without icons as
  before. No rendered state affected: `packageIcon.ts` is imported by no entry yet.

## Deviations from contract/ADR (file:line each)

- None. The ruling's VERIFY expects two `title=` hits in `Row.tsx`; there are three: the body, the version, and the
  `VerifiedIcon`'s `title` prop that its DO 4 asks for (an SVG `<title>`, not an attribute of the option).

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P9.2 ⚑, "Confirm or correct the 1.x measurements and their 2.0 token mapping …, and rule the Row
structure (props, DOM order, accessible name and description, where `title` goes given the wrapper rule), what
happens to the existing Row.test.tsx titles, and whether consumer tests outside Row.test.tsx may change in P9.2."
Answer of the `architecture-advisor` subagent, verbatim:

`````text
DECISION: Option 1, sharpened; not `OWNER MUST DECIDE`. The 1.x measurements in the brief are confirmed with five corrections (below). `Row` gains `authors`, `verified` and `nextVersion`, `version` narrows to `string`, the comfortable option becomes icon column + text column of two flex lines (name + badges / version · authors · status) with an optional third line (description), the compact option keeps one line (name, version, badges) by flattening the same DOM with `display: contents`; the accessible name is `aria-labelledby` of the name span and the version span (same computed text as today, so every consumer test that reads `Serilog 3.0.0` keeps passing), the description is `aria-describedby` of up to four ids (badges, authors, description, status), and the `id version` tooltip goes on the text column span (`.nuiget-row-body`), never on the option or the wrapper. Tokens: `--nuiget-row-height-comfortable: 66px`, new `--nuiget-icon-size-xl: 32px`, new `--nuiget-color-version-new` aliased to `--vscode-gitDecoration-addedResourceForeground` with `--vscode-charts-green` as fallback (measured: `charts.green` fails the theme gate in Light Modern); the Verified mark uses the existing `--nuiget-color-link`; name `--nuiget-font-size-md` + `font-weight: 600`, every secondary line `--nuiget-font-size-sm` muted without opacity. `Listbox.ROW_HEIGHT.comfortable` becomes 66. The thirteen existing `Row.test.tsx` titles stay; two named tests are added. No consumer, no consumer test and no primitive test other than `Row.test.tsx` changes in P9.2.

WHY:
- 1.x confirmed at `0457c75:src/webview/app/App.css`: `.package-item` :70-79 (flex, flex-start, gap 12, padding 12/16, 1 px `panel-border` bottom, border-box); `.selected` :85-90 (active selection bg/fg, `border-left: 3px solid focusBorder`, `padding-left: 13px`); icon :92-104 (32×32, `margin-top: 2px`, `object-fit: contain`, radius 4); info :106-110; name :112-116 (600, 14 px); version :118-121 (12 px, description fg); meta :123-128 (flex, gap 12, 11 px); arrow :134-139 (charts-green, bold) and `.package-version-new` :141-144 (charts-green, 500; the brief did not cite this one); authors :559-563 (11 px, description fg, `opacity: 0.7`); `.verified-badge` :565-574 and its svg override :3400-3402 (`textLink-foreground` wins by specificity); skeleton :3172-3180 (66 px); `InstalledTab.tsx:42` `ESTIMATED_ITEM_HEIGHT = 66`. Markup confirmed: `InstalledTab.tsx:182-245` (icon | info{name + badges; meta{version}; authors{Verified + authors}}), `UpdatesTab.tsx:689-709` single project (name; meta{v-old, arrow, v-new}; authors) and :600-625 All Projects (no authors), `App.tsx:3060-3083` browse (name; meta{version, downloads}; authors).
- Corrections. (a) The 1.x body font is `var(--vscode-font-size)` = 13 px (`App.css:6`), so 14/12/11 px are 1.08/0.92/0.85 em: name = `--nuiget-font-size-md` + 600, version/authors/description = `--nuiget-font-size-sm` (0.85em); ADR-008 and `webview-stylesheets.test.ts` (`no px font size`) forbid px, and no new size token is needed. (b) 66 was 1.x's estimate and skeleton height, not a measured card; in 2.0 it is a `min-height` (D15 fixes the value) and the Listbox measures rows (`Listbox.tsx:96`); a Browse row with three lines may measure above 66. (c) `opacity: 0.7` on authors: Light Modern `descriptionForeground` #717171 on #ffffff measures 4.88:1 and at 0.7 alpha about 4.17:1, below the 4.5:1 `theme.ui.test.ts:53,170` enforces; no opacity anywhere. (d) No 1.x row had a tooltip (`InstalledTab.tsx:1318-1326`, `App.tsx:3040-3056`, `UpdatesTab.tsx:686-712`; `SidebarApp.tsx` has `title=` only at :1577, :1637, :1725, :1913, on headers and the Update-all button): the `id version` tooltip is the plan row's addition, kept as written. (e) `charts.green` in VS Code 1.85 (`workbench.desktop.main.js`) is light #388A34, dark #89D185, hcLight #374e06: on Light Modern's #ffffff it measures 4.33:1, on the sidebar's #f8f8f8 4.07:1, on the active-selection grey 3.53:1; `gitDecoration.addedResourceForeground` (the git extension's `package.json`: light #587c0c, dark #81b88b, hc #a1e3ad, hcLight #374e06) measures 4.88 / 4.60 / 7.19 / 9.31. The plan row says "`--vscode-charts-green`/token"; the token alias is the latitude, and the theme gate (P5.11, six themes at `theme.ui.test.ts:21-28`) is the owner's own rule, so the alias puts the git green first and charts-green as the fallback for a host without the git extension.
- 2.0 facts checked: `Row.tsx` whole; `primitives.css:71-227`; `tokens.css:24-32,48-54,90-94`; `Listbox.tsx:7-8,59,96`; `webview-tokens.test.ts:26-35` (REQUIRED is a subset check, additive tokens pass) and :69-77 (the `ROW_HEIGHT` mirror); `webview-stylesheets.test.ts` (no px font size, `.nuiget-` prefix, pointer targets, the `.nuiget-row-actions` visibility rules); `webview-css-baseline.test.ts:37-62` (none of `display: contents`, `order`, inset `box-shadow`, `fit-content`, `margin-inline-start` is denied); `sidebar.ui.test.ts:106-128` asserts a compact row's height equals `--nuiget-row-height-compact` exactly, so compact rows get no border and no padding change; `theme.ui.test.ts:213-227` runs axe on whichever tab the earlier files left and on the sidebar. Consumer assertions that the new DOM must keep true, all verified compatible: `SidebarView.test.tsx:92,124-125,143-147,178-180,192` (`toHaveAccessibleName('Serilog 3.0.0')`, `'Broken unresolved'`, descriptions `'Centrally managed'`, `'Unresolved'`, and `:147 not.toHaveAccessibleDescription()`), `BrowseList.test.tsx:77-82`, `UpdatesSection.test.tsx:73-75`, `InstalledTab.test.tsx:43,67,196-197`, `UpdatesTab.test.tsx:45,65,239-240`, `AllProjectsView.test.tsx:81`, `Listbox.test.tsx:54` (name `^id `), :253, :272, `composed.test.tsx:35-44`, `Listbox.bench.ts:32`, `src/test/ui/v2/main-updates.ui.test.ts:46` (`textContent` contains `13.0.2 →`). All nine call sites pass a string `version` (`shownVersion` returns `string`, `rules.ts:13`), so narrowing the prop is checked by `tsc`.
- `title` placement is settled by evidence, not taste: the accessible description falls back to the element's own `title` when `aria-describedby` is absent, which `toHaveAccessibleDescription` follows, so a title on the option turns `SidebarView.test.tsx:147` red; the wrapper may carry only `className`, `data-*` and the ref (P3.2 ruling, `ARCHITECTURE.md:277-283`, the gotcha table). A descendant span's `title` enters neither the name (labelledby wins) nor the description.
- The `flex-shrink` gate needs the stylesheet in jsdom: `vitest.config.mts` sets no `css` option, so `import './primitives.css'` injects nothing. Probed with jsdom 30.1.2 (the installed one): a `<style>` holding the real `tokens.css` + `primitives.css` cascades the compound selector `.nuiget-row--compact .nuiget-row-description` to `position: absolute`, expands `flex: 0 1 auto` to `flex-shrink: 1`, and reports `display: contents`; `var()` values stay unresolved, which the gate does not need.
- Contrast consequence stated plainly: nothing in P9.2 passes `nextVersion`, `authors` or `verified`, so P9.2's own UI job never renders the green or the authors line; the first measurement of `--nuiget-color-version-new` is P9.4's run (main panel) and P9.10's (sidebar). The alias above is chosen so that run is green without a retune.

DO:
1. Baseline gates at 6df4567 (`npx tsc --noEmit`, `npm run check-types`, `npx eslint src`, `npx vitest run`) green before editing.
2. `tokens.css`: `--nuiget-row-height-comfortable: 66px` (comment: D15, the 1.x `.package-item` card); `--nuiget-icon-size-xl: 32px` after `-lg`; under "Colours: list rows" `--nuiget-color-version-new: var(--vscode-gitDecoration-addedResourceForeground, var(--vscode-charts-green));` with a comment carrying the measured ratios of WHY (e); in the forced-colours block `--nuiget-color-version-new: CanvasText;`. No other token changes; `--nuiget-row-height-compact` stays 24.
3. `Listbox.tsx:8`: `const ROW_HEIGHT = { compact: 24, comfortable: 66 } as const;` (the exact regex of `webview-tokens.test.ts:72`). Nothing else in `Listbox.tsx` changes; it keeps measuring.
4. `Row.tsx` props: `version?: string` (narrowed from `ReactNode`); new `nextVersion?: string` (an update's target; the cell then reads `version → nextVersion`), `authors?: string`, `verified?: boolean` (renders `VerifiedIcon` with `title="Verified: the package id prefix is reserved by its owner"` before the authors text; the line renders when either is set); `versionTitle`, `description`, `icon`, `badges`, `status`, `busy`, `disabled`, `actions`, `density` unchanged. JSDoc: `description` is for Browse rows only (D14).
5. `Row.tsx` DOM, in this order inside the option: `span.nuiget-row-check` (checkable, as now) → `span.nuiget-row-icon[aria-hidden="true"]` rendered in comfortable density always, with `icon` inside when given (the column is reserved) and not at all in compact → `span.nuiget-row-body[title=<tooltip>]` → `span.nuiget-row-line` { `span.nuiget-row-name#<optionId>-name`, `span.nuiget-row-badges#<optionId>-badges` when badges } → `span.nuiget-row-line` { `span.nuiget-row-version#<optionId>-version[title=versionTitle]` when version, holding `{version}`, then when nextVersion `{' '}<span class="nuiget-row-version-arrow">→</span>{' '}<span class="nuiget-row-version-new">{nextVersion}</span>` (the arrow stays a text node: `main-updates.ui.test.ts:46` and `UpdatesTab.test.tsx:65` read `textContent`), `span.nuiget-row-authors#<optionId>-authors` when authors or verified, `span.nuiget-row-status#<optionId>-status` when status } → `span.nuiget-row-description#<optionId>-description` when description. The actions container stays the aria-hidden sibling. `aria-labelledby` = `<optionId>-name` plus ` <optionId>-version` when version is set; `aria-describedby` = the ids present among `-badges -authors -description -status` in that order, attribute absent when none. Tooltip = `name`, then ` version` when set, then ` → nextVersion` when set. No module-level call in the file (N63).
6. `primitives.css`, comfortable: `.nuiget-row--comfortable { box-sizing: border-box; border-bottom: 1px solid var(--nuiget-color-border); }` (on the wrapper, so the line spans the actions; the measured row is 67 px against the 66 px estimate, which the virtualizer absorbs); `.nuiget-row--comfortable .nuiget-row-option { align-items: flex-start; gap: var(--nuiget-space-5); padding: var(--nuiget-space-5) var(--nuiget-space-6); }`; `.nuiget-row-icon { flex: none; inline-size: var(--nuiget-icon-size-xl); block-size: var(--nuiget-icon-size-xl); margin-block-start: var(--nuiget-space-1); }` and `.nuiget-row-icon img, .nuiget-row-icon svg { inline-size: 100%; block-size: 100%; object-fit: contain; border-radius: var(--nuiget-radius-md); }` (beats `main.css:200 .nuiget-browse-icon` by specificity; P9.6 deletes that rule); `.nuiget-row-body { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: var(--nuiget-space-1); }`; `.nuiget-row-line { display: flex; align-items: baseline; gap: var(--nuiget-space-3); min-width: 0; overflow: hidden; }`; `.nuiget-row--comfortable .nuiget-row-name { font-weight: 600; flex: 0 1 auto; min-width: 40%; }` (keeps the base ellipsis rule :150-154); `.nuiget-row-badges { display: inline-flex; flex: none; gap: var(--nuiget-space-2); }`; `.nuiget-row-version-arrow, .nuiget-row-version-new { color: var(--nuiget-color-version-new); font-weight: 600; }`; `.nuiget-row-authors { color: var(--nuiget-color-fg-muted); font-size: var(--nuiget-font-size-sm); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`; `.nuiget-row-authors svg { color: var(--nuiget-color-link); vertical-align: text-bottom; margin-inline-end: var(--nuiget-space-2); }`; `.nuiget-row-description { overflow: hidden; text-overflow: ellipsis; }` added to the existing muted/sm/nowrap rule. Delete the `.nuiget-row-title` rule (:143-148) and the `.nuiget-row-desc` rule (:177-183) with their spans. Selected accent mirrors the three background rules at :106-126: `.nuiget-row--comfortable .nuiget-row-option[aria-selected="true"] { box-shadow: inset 3px 0 0 var(--nuiget-color-focus); }`, `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row--comfortable .nuiget-row-option[aria-selected="true"] { box-shadow: none; }`, `.nuiget-listbox[aria-multiselectable="true"] .nuiget-row--comfortable .nuiget-row-option[aria-current="true"] { box-shadow: inset 3px 0 0 var(--nuiget-color-focus); }` (inset shadow: no padding arithmetic, no reflow; `forced-color-adjust: none` is already on those rules). Add `.nuiget-row-version-new`, `.nuiget-row-version-arrow` and `.nuiget-row-authors` to the inherit-on-selected block at :168-175 (the green measures 3.53:1 on the selection grey).
7. `primitives.css`, compact, placed after the comfortable rules so the cascade order is unambiguous: `.nuiget-row--compact .nuiget-row-body { flex-direction: row; align-items: baseline; gap: var(--nuiget-space-3); }`; `.nuiget-row--compact .nuiget-row-line { display: contents; }` (the body stays a box, so its `title` is unaffected); `.nuiget-row--compact .nuiget-row-name { flex-grow: 0; flex-shrink: 0; flex-basis: auto; max-width: 70%; }` and `.nuiget-row--compact .nuiget-row-version { flex-grow: 0; flex-shrink: 1; flex-basis: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }` (longhands on purpose: the gate reads `flex-shrink`; a long version ellipsises before the name moves, a long name ellipsises at 70 % of the body; 70 % is a starting value P9.10 may retune from `sidebar-narrow-200px`); `.nuiget-row--compact .nuiget-row-badges { order: 1; margin-inline-start: auto; }` (today's right-pushed badges); extend the visually-hidden rule at :186-193 to `.nuiget-row--compact .nuiget-row-authors` and keep description and status in it (D14: no description in compact rows; still read out). No padding, height or border change for compact (`sidebar.ui.test.ts:121`).
8. `testSupport.ts` (additive, approved here; P9.12 reuses it): `installStylesheet(): () => void` that reads `src/webview/shared/tokens.css` and `src/webview/shared/primitives/primitives.css` with `readFileSync` (paths from the repo root, as the lint tests do), appends one `<style>` to `document.head` and returns its remover. Not exported from `index.ts`.
9. `Row.test.tsx`: keep the thirteen titles as they are; the bodies change only where the DOM did (`screen.getByText('3.0.0')` for the version title still works). Add, with `installStylesheet()` in `beforeEach` and its remover in `afterEach`: `comfortable row stacks name over version and authors` (render `density="comfortable"`, `authors`, `verified`, `badges`, `description`; assert `compareDocumentPosition` order name → version → authors → description inside `.nuiget-row-body`, the name span has non-empty text, the option's accessible name is `Serilog 3.0.0` and its description is `Centrally managed Verified: the package id prefix is reserved by its owner Serilog Contributors Structured logging` in that order, `.nuiget-row-icon` is present and `aria-hidden` without an `icon` prop, axe 0 with `aria-hidden-focus` and `nested-interactive` `'passes'`); `long version never hides the name in compact density` (render compact with a 60-character prerelease version; assert DOM order name before version, non-empty name text, and `Number(getComputedStyle(name).flexShrink) < Number(getComputedStyle(version).flexShrink)` with `getComputedStyle(version).minWidth === '0px'`, and that `.nuiget-row-authors` and `.nuiget-row-description` are absent or visually hidden). Recommended, short: `an update row reads old → new as text and marks the new version` (`nextVersion`; `toHaveTextContent('3.0.0 → 3.1.0')`, `.nuiget-row-version-new` text `3.1.0`, accessible name `Serilog 3.0.0 → 3.1.0`), `the tooltip is on the body, not on the option` (`title` on `.nuiget-row-body` equals `Serilog 3.0.0`; the option has no `title`; a row without badges/status has no accessible description).
10. Docs duties in the same commit: `ARCHITECTURE.md:277-283` DOM block rewritten to the new tree (body, two lines, the four description ids, the tooltip's place); `CHANGELOG.md` `## [Unreleased]` `### Changed`: `- **Two-line package cards in the main panel, name-first rows in the sidebar**`; `.github/copilot-instructions.md` 2.0 gotchas, one row: `title` on a row lives on `.nuiget-row-body` only (on the option it becomes the accessible description when no `aria-describedby` exists, `SidebarView.test.tsx:147`; the wrapper carries nothing), and an update row's arrow stays the text `→` (`main-updates.ui.test.ts:46`, `UpdatesTab.test.tsx:65`); `src/webview/shared/STATUS.md` from the §2.5 template with this ruling verbatim, the three bundle sizes and the contrast numbers; `docs/plans/STATUS.md` row P9.2. Interaction model §1 density cell stays for P9.13 as the plan assigns it.
11. Gates in the §2.2 order plus `npm run lint`, `npm run docs:check`, `node esbuild.mjs --production --analyze` (paste the three sizes; ceilings 322502 / 577766 / 351245). Push; after the green run apply RUN.md:84: download `ui-screenshots`, view `main-installed-single`, `main-updates`, `main-browse-results`, `sidebar-sections`, `sidebar-narrow-200px`. Expected intermediate state, not a red gate: comfortable rows 66 px with a bottom line, two lines, an empty 32 px icon column in Installed and Updates (icons arrive in P9.3/P9.4), the Installed description still on line 3 until P9.3 drops the prop (D14), Browse rows with 24 px data-URI icons inside the 32 px column (P9.6), no authors line yet, update rows still `old → new` in muted text (P9.4 passes `nextVersion`); compact rows unchanged at 24 px with the name no longer displaced.
12. Commit with the `git-commit` skill citing P9.2, D14, D15, MI3, MU11, MB1, DP7, MH5, ADR-008; stage by explicit path after `git status --porcelain --untracked-files=all`.

DO NOT:
- Put `title` on the option or on the wrapper; put `aria-*` or `tabIndex` on the wrapper; render a button, input or `tabIndex` inside the option.
- Replace the `→` text with an SVG alone, or hide it with `aria-hidden` (the name would read `3.0.0 3.1.0`).
- Alias `--nuiget-color-version-new` to `--vscode-charts-green` alone, write a colour literal, a px font size, `!important`, `opacity` on text, or a `--nuiget-font-size-*` token for 14 px.
- Change `--nuiget-row-height-compact`, give compact rows a border or padding, or let `.nuiget-row--compact` rows exceed 24 px (`sidebar.ui.test.ts:121`).
- Edit any consumer (`InstalledProjectSection`, `UpdatesTab`, `AllProjectsUpdates`, `BrowseList`, `TransitiveSection`, `AllProjectsTransitiveSection`, `ProjectPackages`, `ProjectUpdates`, `BrowseResults`), `main.css`, `sidebar.css`, any consumer test, `Listbox.test.tsx`, `composed.test.tsx` or `Listbox.bench.ts`; if one of them goes red, stop and ask with the failing title, never adjust it.
- Change the `installFakeLayout({ row: 44 })` numbers in consumer tests (they fake the measurement, not the token; P9.12 measures against the token).
- Mock `@tanstack/react-virtual`, add a `style` prop beyond `cssVars()`, add a module-level call to `Row.tsx`, or remove the reserved icon column when `icon` is undefined.
- Drop the `description` prop or the compact visually-hidden rule (Browse keeps its third line; compact still reads it out).
- Touch `src/protocol/**`, `src/core/contracts.ts`, `docs/adr/**`, `docs/ux/interaction-model.md` §1 (P9.13) or create the sentinel.

CONTRACT CHANGE: none. Files of the item: `src/webview/shared/primitives/Row.tsx`, `src/webview/shared/primitives/primitives.css`, `src/webview/shared/tokens.css`, `src/webview/shared/primitives/Listbox.tsx`, `src/webview/shared/primitives/Row.test.tsx` (gate). Approved additions by this ruling: `src/webview/shared/primitives/testSupport.ts` (the `installStylesheet` helper), `src/test/lint/webview-tokens.test.ts` (only adding `--nuiget-icon-size-xl` and `--nuiget-color-version-new` to `REQUIRED`; optional, additive), `ARCHITECTURE.md`, `CHANGELOG.md`, `.github/copilot-instructions.md`, `src/webview/shared/STATUS.md`, `docs/plans/STATUS.md`. No other file.

VERIFY:
- `npx vitest run --project frontend src/webview/shared/primitives/Row.test.tsx` → exit 0; output lists the thirteen existing titles and `comfortable row stacks name over version and authors`, `long version never hides the name in compact density`.
- `npx vitest run --project backend src/test/lint` → exit 0 (the `ROW_HEIGHT` mirror at 66, no px font size, `.nuiget-` prefix, Chromium 114 denylist, no colour literal).
- `npx vitest run --project frontend src/webview` → exit 0, and `git diff --name-only HEAD -- 'src/webview/**/*.test.tsx' 'src/webview/**/*.bench.ts' | grep -v 'primitives/Row.test.tsx'` → empty.
- `git diff --name-only HEAD` → a subset of the file list under CONTRACT CHANGE.
- `grep -c 'comfortable: 66 }' src/webview/shared/primitives/Listbox.tsx` → 1; `grep -c -- '--nuiget-row-height-comfortable: 66px' src/webview/shared/tokens.css` → 1; `grep -c -- '--nuiget-color-version-new: var(--vscode-gitDecoration-addedResourceForeground, var(--vscode-charts-green))' src/webview/shared/tokens.css` → 1; `grep -c -- '--nuiget-icon-size-xl: 32px' src/webview/shared/tokens.css` → 1.
- `grep -n 'title=' src/webview/shared/primitives/Row.tsx` → two hits, the body span and the version span; `grep -n 'role="option"' -A12 src/webview/shared/primitives/Row.tsx | grep -c title` → 0.
- `grep -n "'→'\|>→<" src/webview/shared/primitives/Row.tsx` → 1 (a text arrow).
- `npx tsc --noEmit`, `npm run check-types`, `npx eslint src`, `npm run lint`, `npm run docs:check`, `npm test`, `npm run bench` → exit 0 each; `node esbuild.mjs --production --analyze` → three sizes below 322502 / 577766 / 351245, pasted in the STATUS note.
- `gh run watch <id> --exit-status` → 10 jobs green, the `UI` job included (compact height assertion and six-theme axe pass); `gh run download <id> -n ui-screenshots -D /tmp/nuiget-shots` → the PNGs of DO 11 viewed and recorded as `viewed:` lines in `src/webview/shared/STATUS.md`.

Files checked (absolute, under /Users/mattias/github/nuiget): .github/agents/architecture-advisor.agent.md; docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:318-375; docs/plans/parity-audit-2026-10-16.md:7,53-72,187-191,347-397,629-655,727-739,1174-1233,1412-1442; docs/plans/STATUS.md:122-135,2016-2138 (P3.2 ruling, Row contract at its lines 21-22,26-27,32),2139-2200 (P3.6: compact stays 24 px); docs/plans/findings-ledger.md rows U5, U11, N63, N64; docs/plans/RUN.md:84,123; docs/adr/006-icons-and-csp.md, docs/adr/008-webview-architecture.md; docs/ux/interaction-model.md:1-60,136-138,164-165; ARCHITECTURE.md:262-300; src/webview/shared/primitives/{Row.tsx,Row.test.tsx,Listbox.tsx:1-110,composed.test.tsx:28-60,106-126,Listbox.bench.ts:12-32,Badge.tsx,icons.tsx:140-175,testSupport.ts:6-47,primitives.css:60-300}; src/webview/shared/tokens.css; src/webview/shared/packageIcon.ts; src/webview/shared/installed/rules.ts:13-16; src/webview/shared/STATUS.md:1-30; src/webview/main/main.css:200-202; the nine consumer call sites listed in WHY; src/test/lint/{webview-tokens,webview-stylesheets,webview-colours,webview-css-baseline}.test.ts; src/test/ui/v2/{sidebar.ui.test.ts:100-130,theme.ui.test.ts:21-28,42-55,160-175,195-262,main-updates.ui.test.ts:40-75}; vitest.config.mts:1-80; git show 0457c75: src/webview/app/App.css:1-25,60-145,147-192,240-275,540-580,3035-3075,3165-3185,3395-3405; src/webview/app/components/InstalledTab.tsx:38-46,180-250,1318-1326; src/webview/app/components/UpdatesTab.tsx:590-635,686-712; src/webview/app/App.tsx:3040-3090; src/webview/sidebar/SidebarApp.tsx (title sites), SidebarApp.css:324-331; .vscode-test/vscode-darwin-arm64-1.85.0 (workbench.desktop.main.js colour defaults; extensions/git/package.json `gitDecoration.addedResourceForeground`). Probes run (inspection only): WCAG contrast arithmetic in node; jsdom 30.1.2 cascade of an injected `<style>` holding the real tokens and primitives stylesheets.
`````

Acted on: DO 1-12 as written, with one change to DO 6: the Verified icon is followed by a text space instead of
`margin-inline-end`, because the description the ruling's own test expects ("…by its owner Serilog Contributors…")
reads "…ownerSerilog…" without it.

## Exact next step (one item ID)

P9.3.

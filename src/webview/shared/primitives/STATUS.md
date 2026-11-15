# STATUS — src/webview/shared/primitives (UX-P3.fix-10)   commit df5ed63 (proving push; the closing commit adds docs only)   2026-11-15

git status --short src/webview/shared/primitives: ` M Listbox.tsx`, ` M Listbox.test.tsx`, `?? STATUS.md` (this note)

Item: UX-P3.fix-10 ⚑-design "An untouched list's tab stop is its first row (Listbox; the tools cell's ARIA class)",
tracker row `docs/plans/STATUS-ux.md` (the plan has no row of its own; the tracker row is the definition).

## Verified by running

Baseline at 53e5e7f, before editing:

- `npx tsc --noEmit` → exit 0
- `npm run check-types` → exit 0
- `npx eslint src` → exit 0
- `npx vitest run` → `Test Files  181 passed (181)`, `Tests  2556 passed | 9 skipped (2565)`, exit 0
- CI run 43702118074 on 53e5e7f → `completed success`

The mechanism's tests, red on 53e5e7f's `Listbox.tsx` (tests added first, design-advisor DO 2):

```text
     × an untouched tree's tab stop is its first node when a folder row arrives above its first project (UX-P3.fix-10) 7ms
     × a row prepended before any interaction becomes the tab stop 4ms
     × a list emptied and refilled with focus elsewhere is untouched again: its stop is the first row 23ms
     × a selectedId absent at mount does not pin the first arrival: the stop follows the first row 2ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
      Tests  4 failed | 47 passed (51)
```

The other four new cases (moved stop, focus only, touched then blurred, refill with focus inside, selection at mount)
pass on 53e5e7f too: they hold today's behaviour, which the change keeps.

After the change (working tree on 53e5e7f):

- `npx vitest run src/webview/shared/primitives/Listbox.test.tsx` → `Tests  51 passed (51)`; 20 runs in a row → `Listbox loop green: 20/20`
- `npx tsc --noEmit` → exit 0
- `npm run check-types` → exit 0 (again after the `PIN_FACTS` `unnamed` fallback)
- `npx eslint src` → exit 0
- `npx vitest run --project frontend src/webview/shared/primitives` → `Tests  207 passed (207)`
- `npm test` → `Test Files  181 passed (181)`, `Tests  2565 passed | 9 skipped (2574)`, `[axe-coverage] 74 files, 42 rules passed somewhere, 0 missing`, exit 0
- `npm run bench` → exit 0 (`Tests  75 passed (75)` in its last project)
- `node esbuild.mjs --production --analyze` → exit 0; `dist/extension.js 299460 / 326720`, `dist/webview.js 587771 / 613761`, `dist/sidebar.js 362250 / 374532`
- `npm run package:vsix` → exit 0, `Packaged: nuiget-v2.0.0.vsix (17 files, 612.99 KB)`; `npm run check:vsix` → `check:vsix: OK`
- `npx vitest run --project backend src/test/lint` → `Tests  470 passed (470)`
- `node scripts/check-css-baseline.mjs --item P3.fix-10` → `check-css-baseline: 0 entries for P3.fix-10`
- `npm run docs:check` → exit 0 (`docs/protocol.md is up to date`)
- `npm run check:matrix` → `282 rows: 277 covered, 2 gap, 3 manual-credentials; 0 finding(s).`
- `shasum -a 256 src/test/ui/v2/aria/sidebar-all-projects-tools.json` → d0cec4c1bbf3727dcfac739911e85d02f99ee94e09fb777efc3e3deb7ed77355
- `npm run test:ui` (local, macOS, never evidence) → v2 suites `49 passing`; capture suite `91 passing`, `21 failing`, all of this Mac's known local-only classes: `DS-SCROLL-1@<state>: no scrolling list (one expected)` (14, the 3008x1600 window), `SPEC@…/header: … project-selector Δx 11 Δw -6.5` (6, fonts), the artboard export's `colour profile mismatch` (1). The item's lines: `[reach] sidebar-all-projects-tools: scrollTop 0 of 1415, client 1415, tools row at 682, tab stop "group-row-folder-app", stops 1`; `[reach] sidebar-all-projects-updates: scrollTop 0 of 1415, client 1415, tools row at 660, tab stop "group-row-updates-folder-app", stops 1`; the four `[keys] … tab` walks `as expected (hard)`; every `[aria] … differs` is the local `-0 +N` extra-rows class or the runner-path class of `main-sources*`/`main-browse-multi-install-dialog`.
- `npm run test:ui:classic` (local) → `7 passing`, `6 failing`, the same two local-only classes (DS-SCROLL-1 ×4, SPEC Δx 11 ×2); `[reach] sidebar-all-projects-updates: … tab stop "group-row-updates-folder-app", stops 1`.

## Visual evidence (UI items)

Run 43705415149 (df5ed63), green on every job; `captures/43705415149/` (ui-log, ui-screenshots).

```text
[reach] sidebar-all-projects-updates: scrollTop 490 of 1207, client 717, tools row at 170, tab stop "group-row-updates-folder-app", stops 1
[reach] sidebar-all-projects-tools: scrollTop 534 of 1251, client 717, tools row at 148, tab stop "group-row-folder-app", stops 1
[aria] main-installed-all: 72 nodes, equal
[aria] sidebar-all-projects: 47 nodes, equal
[aria] sidebar-all-projects-updates: 48 nodes, equal
[aria] sidebar-all-projects-tools: 47 nodes, equal
[diff] summary: 114 compared, 114 at 0 px, 0 above tolerance, 0 without a golden, 0 refused
classic: [reach] sidebar-all-projects-updates: scrollTop 470 of 1207, client 737, tools row at 190, tab stop "group-row-updates-folder-app", stops 1
```

- `grep -c differs` → 0 (Modern) and 0 (classic); `grep -c "not reachable"` → 0; `grep -c "pending P3.fix-10)"` → 0.
- The four `[keys] <screen> tab:` walks (main-installed, main-updates, main-browse, sidebar) → `as expected (hard)`;
  `KEYS_EXPECTED` unchanged.
- `shasum -a 256 src/test/ui/v2/aria/sidebar-all-projects-tools.json` →
  d0cec4c1bbf3727dcfac739911e85d02f99ee94e09fb777efc3e3deb7ed77355 (unchanged).
- Judged captures: `captures/43705415149/sidebar-all-projects-tools.dark-modern.300.png` sha256
  cef506a92170bcd5df3cdb5ebc45f18845d187d77589697ed4cf692cb975df4a;
  `captures/43705415149/sidebar-all-projects-updates.dark-modern.300.png` sha256
  b21dae97d195eb4b6742dc652e9bc81bb3f4191e21ba531eb88a1c0715112852; artboard
  `docs/design/artboards/main-installed-all.dark-modern.1200.png` (no sidebar artboard; the UX-P3.8 and UX-P3.fix-5
  precedent).
- design-judge (wf_d915a260-18b): `{ states: 2, candidates: 10, standing: 0, blocking: 0, refuted: 8, singleJudge: 2,
  incomplete: 0 }`; the two single-judge findings are DS-SCROLL-2 (no scroll shadow on the scrolled trees), owned by
  UX-P3.fix-6 and unchanged by this item; dispositions in `docs/plans/judge-log/P3.fix-10.json`.
- G-UI: step 1 lint tests green and `check-css-baseline` 0 entries; step 2 no pending rule names this item; step 3
  every cell 0 px; step 4 above; step 5 `[axe]` and ARIA `equal` on every state, keys as expected; step 6 Tier A PNGs
  in the artifact.

## Done (tested)

- `Listbox.tsx`: a `touched` state (React state, architecture-advisor DO 1, option 7), initialised true only when
  `selectedId` names a row of `items`; set by a row's focus, a key on the list and a click on a row; reset in the
  existing id-sync effect when the list has no items. While untouched the active index is 0. No prop, no exported
  type, no effect added; `moveTo`, `rangeExtractor` and the refocus layout effect unchanged.
- `Listbox.test.tsx`: nine cases added (one in the group-rows block, eight in a new block), none edited or removed.
- `capture.ui.test.ts`: `PIN_FACTS` appends `, tab stop "<wrapper test id or text>", stops <n>` (design-advisor DO 6).
- Docs: `docs/design/DECISIONS.md` row, interaction model §5 sentence (design-advisor DO 9), ARCHITECTURE.md's
  `Listbox` paragraph, CHANGELOG `### Fixed`.

## Pre-commit review

`precommit-review` (`{ "range": "--cached", "item": "P3.fix-10" }`, run wf_4a4b76f5-aaf) → `blocking: []`, `refuted: []`,
`incomplete: []`, `reviewersAnswered: 3`; one non-blocking finding, fixed before the commit:
`docs/ux/interaction-model.md:149`, the §5 sentence lacked the selected-at-mount exception that the code, the DECISIONS
row and ARCHITECTURE.md state; it now reads "(or, when it opens with one of its rows selected, that row)".

## Done (untested)

None.

## Not started

None. The closing commit removed the class sentence from the gotcha "Live content that moves a box or a count"
(`.github/copilot-instructions.md`), noted the class closed in the P3.10 and P3.11 rows and set the tracker row `done`;
its run is the second reading of the same code (a run that prints the class reopens the item as a stop-and-ask).

## Deviations from contract/ADR/decision (file:line each)

- Architecture-advisor follow-up 1 VERIFY 1 (`git diff --stat <proving>..<closing> -- src` → no output) is read with
  this note excluded: the handoff note lives in this directory (plan §2.5), so the closing commit changes
  `src/webview/shared/primitives/STATUS.md` and no other file under `src`
  (`git diff --stat df5ed63..HEAD -- src ':(exclude)*.md'` → no output).

## Advisor decisions (date, item, question, answer verbatim)

### 2026-11-15, UX-P3.fix-10, architecture-advisor, opening ruling

Question: is the state change in the primitive sound, and which of options 1/2 (focus counts as touched or not), 3/4
(`touched` resets when the list empties or never), 5/6 (a `selectedId` at mount counts as touched or not), 7 (state
or ref) are ruled, plus any harness constraint (the `[reach]` `PIN_FACTS` addition, `KEYS_EXPECTED`).

> BRIEF CHECK (three corrections before the ruling):
> 1. The snapshot hash in the tracker row is stale. `shasum -a 256 src/test/ui/v2/aria/sidebar-all-projects-tools.json` reads d0cec4c1bbf3727dcfac739911e85d02f99ee94e09fb777efc3e3deb7ed77355 at 53e5e7f, not 244f6cef…. The file was re-adopted at d1adb32 (UX-P3.11 GOLDEN CLASS DO 2, docs/plans/handoff/P3.11.md:112-116); its line 12 is still `treeitem "app" [expanded, level 1]`. The hash to hold is d0cec4c1….
> 2. Option 3's "today it starts at min(lastActiveIndex, len-1)" is imprecise. On an empty render `activeIndex` is -1, so the effect writes `lastActiveIndex.current = 0` (Listbox.tsx:173-175) and nulls `activeId`. A refilled list already starts at index 0 today. Options 3 and 4 differ only in whether the refilled list then follows `items[0]`.
> 3. The plan has no P3.fix-10 row (grep of docs/plans/2026-10-23-nuiget-ux-execution-plan.md: 0 hits). The tracker row, docs/plans/STATUS-ux.md:120, is the item's definition.
> The rest of the brief matches the tree (Listbox.tsx:167-187, :205-225, :232-238, :332-358; InstalledSection.tsx:72-79; KEYS_EXPECTED a11y.ts:514-540; PIN_FACTS capture.ui.test.ts:1745-1751, printed at :1089 and :1314).
>
> DECISION: The state change is sound. Options 1, 3, 5 (narrowed) and 7 (React state).
> - 1: focus on a row counts as touched.
> - 3: `touched` resets when the list has no items.
> - 5, narrowed: at mount `touched` is true only when `selectedId` is non-null AND that item is in `items`. The prop alone is not enough.
> - 7: `useState`, not a ref.
>
> WHY:
> - Option 2 would move DOM focus without user input. With focus in the list, an insertion above changes `activeIndex`, and the layout effect at Listbox.tsx:211-225 then focuses the new first row. That breaks the row's "a moved active row stays with its item" and the primitive's own statement that it only takes focus back (comment at :203-204). A focused row is also the screen reader's current position.
> - Option 4 keeps the defect alive. A list touched once, emptied and re-streamed is pinned by id to whichever row arrives first (the effect at :173-179 writes `items[0].id` into `activeId`). That is the same arrival-order outcome this item removes. With no items there is no item for a move to stay with.
> - Option 5 as briefed has the same hole. With `selectedId` non-null and the item absent, `findIndex` is -1, the fallback picks index 0 and the effect pins that row with `touched` true. All sidebar consumers start at `useState(null)` (InstalledSection.tsx:48, :176; UpdatesSection.tsx:73, :190), so the tools cell is not affected. The main panel's lists pass a `current` that can be set before a stream completes.
> - Option 7: the value decides which row gets `tabIndex=0` (:383) and what `rangeExtractor` adds (:181-187), so it is render input. A handler that sets only a ref does not re-render when the id is unchanged (Tab onto the first row). `eslint.config.mjs` enables only `rules-of-hooks` and `exhaustive-deps`, so lint would not catch a ref read in render.
> - ADR-013 Decision 8 and D48 (plan §1, line 111) require one list with one tab stop. The change keeps exactly one `tabindex="0"`. `ListboxProps` (:94-138) needs no new member.
> - No product code focuses a row unprompted. The non-test `.focus(` calls under src/webview are the search boxes, Tabs, Toolbar, Dialog/layers, the Sources dialog, Listbox's own effect, and Row.tsx:141, which runs inside a mouse handler. So an untouched list stays untouched until the user acts.
>
> DO:
> 1. In `Listbox.tsx` add `const [touched, setTouched] = useState(() => selectedId !== null && items.some(item => item.id === selectedId))`.
> 2. After the existing `activeIndex` computation (:169-172): when `!touched && items.length > 0`, `activeIndex = 0`. Keep the id sync of the effect at :173-179 as it is, so `activeId` holds `items[0].id`. Add `touched` to its dependencies where read.
> 3. Set `touched` true in exactly three places:
>    - `onFocus`, when it resolves a row (:332-337). This covers Tab, a pointer press, a press on a row action, and the effect's own focus after a refill.
>    - `handleKeyDown`, once an active item exists (:240-244).
>    - `onClick`, once the click is on a row's focusable element (after the guard at :341). This covers a toggle or selection that arrives without a focus event.
> 4. Reset: in the effect at :173-179, when `items.length === 0`, `setTouched(false)`. No new effect, no state write during render.
> 5. Do not change the layout effect at :211-225, `moveTo`, `rangeExtractor` or any prop.
> 6. Tests in `Listbox.test.tsx`, added, none edited:
>    - The row's two cases by its wording: prepend a row before any interaction and expect `tabindex="0"` on the new first row; a moved active row (ArrowDown) stays with its item after a prepend.
>    - Focus only: `user.tab()` into the list, prepend, expect the stop and the focus still on the original row.
>    - Empty then refill: move the stop, re-render with `[]`, refill, prepend, expect the stop on the new first row.
>    - Selection at mount: `selectedId` in `items` keeps the stop on the selected row after a prepend; `selectedId` not in `items` follows the first row.
>    - Each prepend case also asserts exactly one `tabindex="0"` in the list.
> 7. `PIN_FACTS` (capture.ui.test.ts:1745-1751): append `, tab stop "<name>"`.
>    - Read it from the list's `[tabindex="0"]` element.
>    - The name is `axe.commons.text.accessibleText(el)` when `axe` is defined in the page, the source the snapshot's names come from (a11y.ts:293, guard form at :471). Otherwise use the element's whitespace-collapsed `textContent`.
>    - When the count of `[tabindex="0"]` in the list is not 1, print the count instead of a name.
>    - Print only. A printed name that is not `app` on a run whose snapshot reads `equal` is a harness reading to report, not a product change.
> 8. `KEYS_EXPECTED`: all four walked list stops are already first rows (a11y.ts:518, :525, :530, :536, :540). Expect no edit. A walk whose list stop moves to anything other than its list's first row is a stop-and-ask, not an expectation edit.
> 9. Correct the hash in the tracker row to d0cec4c1… in the item's own tracker edit, citing docs/plans/handoff/P3.11.md:112-116.
> 10. Take the tab-stop rule itself to the design-advisor: whether focus pins the stop (option 1's sub-point; the row lists "key, click or selection", not focus), and any snapshot question. If it rules that focus must not pin, come back here before changing the state model: that variant needs the layout effect at :211-225 changed too.
>
> DO NOT:
> - Do not use a ref for `touched`, and do not derive it from `document.activeElement` in render.
> - Do not initialise `touched` from `selectedId !== null` alone.
> - Do not make a later `selectedId` prop change move the stop. That is today's behaviour and is out of this item.
> - Do not change `ListboxProps`, `RowPlacement` or any exported type (design trigger 5).
> - Do not change a settle predicate, `LEAF_FACTS`, `ariaSnapshot`, `ariaLine` or a reach. Do not make a reach press a key or click a row to set the stop.
> - Do not re-adopt `aria/sidebar-all-projects-tools.json`, and do not edit an existing `Listbox.test.tsx` case or any feature test that goes red. Report it with its title.
> - Do not remove the gotcha's class sentence before the second consecutive green run.
>
> CONTRACT CHANGE: none. No frozen path. `src/webview/shared/primitives/Listbox.tsx` and its test change under the tracker row; no exported `*Props` type.
>
> VERIFY:
> 1. `shasum -a 256 src/test/ui/v2/aria/sidebar-all-projects-tools.json` → d0cec4c1bbf3727dcfac739911e85d02f99ee94e09fb777efc3e3deb7ed77355, before and after the item.
> 2. `git diff 53e5e7f -- src/webview/shared/primitives/Listbox.tsx | grep -E '^[+-].*(Props|RowPlacement|ListboxGroups)'` → no output.
> 3. `git diff 53e5e7f --stat -- src/webview src/test | grep -v -e Listbox.tsx -e Listbox.test.tsx -e capture.ui.test.ts` → only the summary line (plus `a11y.ts` only if DO 8's stop-and-ask was ruled).
> 4. `git diff 53e5e7f -- src/webview/shared/primitives/Listbox.test.tsx | grep -c '^-[^-]'` → 0 (tests added, none removed or edited).
> 5. `npx vitest run src/webview/shared/primitives/Listbox.test.tsx` → exit 0, the new titles listed. Then `for i in $(seq 1 20); do npx vitest run src/webview/shared/primitives/Listbox.test.tsx || break; done` → 20 green.
> 6. `npx tsc --noEmit`, `npm run check-types`, `npx eslint src`, `npx vitest run`, `npm test`, `npm run bench` → exit 0 each, no `[axe-coverage] … missing` line.
> 7. `node esbuild.mjs --production --analyze` → three sizes pasted, no `Bundle ceiling exceeded`.
> 8. On each of two consecutive green labs/ux runs, in the Modern log: `grep -c 'tab stop "app"'` on the `[reach] sidebar-all-projects-tools` and `[reach] sidebar-all-projects-updates` lines → 1 each; `grep '\[aria\] sidebar-all-projects-tools'` → `equal`, `differs` 0; the four `[keys]` walks unchanged.
>
> DEFECTS:
> - docs/plans/STATUS-ux.md:120: the row says the snapshot "stays at sha256 244f6cef…". The tree holds d0cec4c1… since d1adb32. Minor, documentation; a session verifying the row literally would stop on a false mismatch. Owner: this item's tracker edit (DO 9).
> - src/webview/shared/primitives/Listbox.tsx:167-179: with `selectedId` non-null and absent from `items` at mount, the first arriving row is pinned. Pre-existing, same class as the item's defect, closed by the narrowed option 5.
> - Not checked: no test was run (read-only). Whether an existing feature test under src/webview asserts a stop that stays put without interaction is unknown until VERIFY 6. Why `sidebar-all-projects`, `sidebar-all-projects-updates` and `main-installed-all` have read `equal` is not checked. The exact text `accessibleText` returns for the folder group row is taken from the committed snapshot line (`treeitem "app"`), not from a run of the new print.

### 2026-11-15, UX-P3.fix-10, design-advisor, opening ruling

Question: which of 1/2 (Tab focus counts as touched or not), 3/4 (untouched again when the list empties or never),
5/6 (a `selectedId` at mount counts as touched or not) the tab-stop rule requires, and whether the gate reading and
the plan to keep every snapshot unchanged are right.

> BRIEF CHECK (read first): two claims in the brief are wrong about the tree.
> - The committed snapshot `/Users/mattias/github/nuiget/src/test/ui/v2/aria/sidebar-all-projects-tools.json` is sha256 `d0cec4c1bbf3727dcfac739911e85d02f99ee94e09fb777efc3e3deb7ed77355`, not `244f6cef…`. UX-P3.11's d1adb32 re-adopted it for the two names ("Clear Search", "Provisional"), recorded at `docs/plans/handoff/P3.11.md:114`. Line 12 still reads `treeitem "app" [expanded, level 1]`, so "kept" stands, at the new hash. The tracker row P3.fix-10 (`docs/plans/STATUS-ux.md:120`) carries the stale hash too.
> - "Today a refilled list starts at the old index, clamped" is not what the code does when the list passes through empty. On an empty render the effect at `Listbox.tsx:173-179` sets `lastActiveIndex` to 0 and `activeId` to null; the refill then pins whichever row arrives first, by id. That is this item's defect again.
> - Option 5's premise ("main panel details restored: stop on the selected row, as today") did not hold in what I read. `selectedId` is read only in the `useState` initializer (`Listbox.tsx:167`), and every caller's selection state starts `null` (`InstalledTab.tsx:52`, `UpdatesTab.tsx:52`, `BrowseList.tsx:49`, `InstalledSection.tsx:48,176`, `UpdatesSection.tsx:73,190`, `BrowseResults.tsx:45`). The restore at `InstalledTab.tsx:236-246` runs after mount and does not move the stop.
>
> DECISION: Option 1, option 3, and a narrowed option 5. Keep every snapshot, re-adopt nothing. The gate reading is right with three amendments (DO 6-8). Run `design-judge` on the two sidebar tree cells as you intend; I do not waive it.
>
> The rule, in one place:
> - A list is **untouched** until one of its rows has held focus. Tab into the list, a click on a row, and the list's own refocus of a row after a change (the `hadFocus` effect) all count, since each puts focus on a row.
> - While untouched, the tab stop is `items[0]`, whatever is inserted, removed or reordered.
> - Once touched, today's rules hold unchanged: the stop stays with its item by id; when the item is gone, the row at its index takes over.
> - The list is untouched again whenever it has no items (option 3).
> - Mount with a `selectedId` that names a row present in `items` starts touched on that row, exactly as the initializer does today. A `selectedId` that names no present row, and any later `selectedId` change, does not move the stop (unchanged, not this item's).
>
> WHY:
> - Option 1 over 2. Under option 2 a row inserted above moves DOM focus through the `hadFocus` effect (`Listbox.tsx:211-225`) with no user input, and a screen reader announces a row the user did not go to. The primitive's own rule is that the active row "stays with its item" (`Listbox.tsx:165`), and the test at `Listbox.test.tsx:243-253` holds it. The workbench's lists keep focus on the element across updates (stated from knowledge, not from a probe in this repository).
> - Option 3 over 4. Option 4 keeps the defect in a narrower case: a touched list that empties and refills chunk by chunk pins the first-arriving row (trace above). "A new result set starts at its first row" is also what today's code intends by resetting the index to 0.
> - Narrowed option 5. A `selectedId` given at mount with `items` still empty is dropped by the effect today and the first-arriving row is pinned. Counting that as touched would bring the arrival-order dependence back, on the main All Projects tree (`InstalledTab.tsx:329-338`).
> - No walked stop should move: every list stop in `KEYS_EXPECTED` (`a11y.ts:514-540`) is already a first row ("Direct Packages #", "Newtonsoft.Json #", "Dapper #", "Dapper # → #").
> - ADR-013 Decision 8 and D48 fix "one tab stop per view" and the arrow keys; neither says which row holds the stop, and `docs/design/DECISIONS.md` and interaction model §5 have no line on it. The first node as an untouched tree's stop is the ARIA roving-tabindex convention (from knowledge). So the rule gets a DECISIONS row (DO 9).
>
> DO:
> 1. Send the state mechanism (how "touched" is held, where it resets) to the `architecture-advisor` with the rule above verbatim. I rule the behaviour only.
> 2. Before the fix, add the mechanism's test and paste it red at 53e5e7f: a tree (`groups` given), first render `[project Catalog, its leaves]`, rerender with a level-1 folder row prepended, no interaction. Expect exactly one `[tabindex="0"]` inside the list and that it is the folder row. Read `treeitem`, not the helpers `option()` and `tabStops()` (`Listbox.test.tsx:54-55`), which see `role="option"` only.
> 3. Add these cases, each asserting exactly one `tabindex="0"`:
>    - Moved stop: Tab, ArrowDown, then prepend. Focus and stop stay on the item.
>    - Focus only: Tab, no key, then prepend. Focus and stop stay on the item (option 1).
>    - Touched, blurred, then prepend: the stop stays on its item.
>    - Refill with focus outside: touch a row, blur, empty, refill with one row, prepend another. The stop is the new first row (option 3).
>    - Refill with focus inside: Tab, empty (the empty holder has focus), refill with one row, prepend another. Focus and stop stay on the first-arrived row (the refocus is a touch).
>    - Mount with `selectedId` naming a present non-first row, then prepend: the stop stays on the selected row.
> 4. Leave the tests at `Listbox.test.tsx:243-292` byte-identical; they must pass.
> 5. Re-read the four walked screens' `[keys]` lines on the proving run. A moved stop is a stop-and-ask to me, not a `KEYS_EXPECTED` update: under this ruling none should move.
> 6. `PIN_FACTS` appends `, tab stop "<name>", stops <n>`. `<n>` is the count of `[tabindex="0"]` inside the list. `<name>` is the `data-testid` of the stop's `[data-index]` wrapper when it has one (`Listbox.tsx:376`), else the first 60 characters of the stop's text. I did not read the folder row's render, so a text literal could carry a count; the test id cannot.
> 7. Expected lines: `tab stop "group-row-folder-app", stops 1` on `sidebar-all-projects-tools` and `tab stop "group-row-updates-folder-app", stops 1` on `sidebar-all-projects-updates`. The second id is inferred from the pin row `group-row-updates-folder-tools`; paste what the run prints and stop if it names another row. Amend the tracker row's literal `tab stop "app"` to these when you rewrite the row, and correct its hash to `d0cec4c1…`.
> 8. The two runs are the proving push (code, tests, reach line) and the closing commit, never a rerun. Two clean runs can be luck (the class showed in about half the recorded runs), so DO 2's red-then-green test is the proof of record. A later run that prints the class reopens this item as a stop-and-ask.
> 9. Add a `docs/design/DECISIONS.md` row with the rule above, and one sentence in interaction model §5 beside the roles paragraph (`docs/ux/interaction-model.md:149`).
> 10. Run `design-judge` on the proving run for `sidebar-all-projects-tools` and `sidebar-all-projects-updates` (RUN-ux §4 puts G-UI on every item that changes `src/webview/**`; §4.3 asks one entry per state touched). Paste the result; a standing finding comes to me.
> 11. Closing commit: remove the class sentence from the gotcha "Live content that moves a box or a count", note it closed in the P3.10 and P3.11 rows.
>
> DO NOT:
> - Do not re-adopt any snapshot or golden. An `[aria] … differs` on any cell, or a `[diff]` above 0 px, is a stop-and-ask with the line pasted.
> - Do not let a reach press a key, click or focus a row to set the stop (follow-up 3's DO NOT stands).
> - Do not make the stop follow a later `selectedId` change, and do not change the gone-item index rule for a touched list.
> - Do not move focus off a row the user is on to honour "first row".
> - Do not change an exported `*Props` type; a new prop is design trigger 5.
> - Do not mask, filter or collapse the off-window tab-stop row in `ariaSnapshot`.
> - Do not `gh run rerun` to collect the second run.
>
> CONTRACT CHANGE: none. `src/webview/shared/primitives/Listbox.tsx`, `Listbox.test.tsx`, `src/test/ui/v2/capture/capture.ui.test.ts` (`PIN_FACTS` only), the docs of DO 9 and 11. The state change needs the `architecture-advisor`.
>
> VERIFY:
> 1. `shasum -a 256 src/test/ui/v2/aria/sidebar-all-projects-tools.json` → `d0cec4c1bbf3727dcfac739911e85d02f99ee94e09fb777efc3e3deb7ed77355`, before and after.
> 2. `git diff --stat 53e5e7f..HEAD -- src/test/ui/v2/aria src/test/ui/v2/golden src/test/ui/v2/a11y.ts` → empty.
> 3. `npx vitest run src/webview/shared/primitives/Listbox.test.tsx` → DO 2's case fails at 53e5e7f (pasted), then all pass with the fix; exit code 0.
> 4. `git diff 53e5e7f..HEAD -- src/webview/shared/primitives/Listbox.test.tsx` shows additions only (no removed line inside 243-292).
> 5. On each of the two runs' `ui-output.txt`: `grep -c 'differs' ` → 0; `grep '\[reach\] sidebar-all-projects-tools'` and `…-updates` → the two lines of DO 7; `[diff] summary: 114 compared, 114 at 0 px, 0 above tolerance`; `not reachable` 0; every `[keys]` screen equal to `KEYS_EXPECTED`.
> 6. `git diff 53e5e7f..HEAD -- src/webview/shared/primitives/Listbox.tsx | grep -n 'Props'` → no changed line in an exported `*Props` type.
> 7. `grep -c 'first removed: treeitem "app"' .github/copilot-instructions.md` → 0 after the closing commit.
> 8. `design-judge` result pasted: `incomplete` 0, zero standing blocking findings.
>
> DEFECTS:
> - `/Users/mattias/github/nuiget/src/webview/shared/primitives/Listbox.tsx:167-179` NEW: "An untouched list's tab stop is its first row; a list without items is untouched again; measured by the `Listbox.test.tsx` cases of DO 2-3 and the `tab stop … stops 1` reading of the tree cells' `[reach]` lines." minor, pre-existing, no capture shows it. This item fixes it.
> - `/Users/mattias/github/nuiget/docs/plans/STATUS-ux.md:120` no rule, minor, record: the row cites the snapshot hash `244f6cef…`; the tree holds `d0cec4c1…` since d1adb32. Fixed by DO 7.
>
> Not checked:
> - I opened no PNG; the item moves no pixel by design and no capture exists for it yet.
> - The chunk arrival order on any run; the mechanism is read from code.
> - What the sidebar's folder group row renders (hence the test-id form in DO 6), and the Updates folder row's exact id.
> - Whether any of the eleven `selectedId` callers can mount its `Listbox` with a selection already set (a list mounted conditionally after a click); I read the initial states, not every mount path.
> - `InstalledTab.tsx:329-338` is one `Listbox` for single project and All Projects: whether a mode switch passes through an empty list, and so whether a touched main list can still pin a first-arriving row there.
> - Why `sidebar-all-projects-updates` and `main-installed-all` have read `equal` so far.
> - The plan's §2.8 G-UI steps in full; I read RUN-ux §4 and §4.3 only, which is why the judge is kept rather than waived.
> - The baseline gates and CI run 43702118074 were still running when I answered.

### How the two rulings were reconciled (session, 2026-11-15)

- Both rule options 1, 3 and the narrowed 5; the architecture-advisor's option 7 (React state) is followed.
- `PIN_FACTS`: the design-advisor's form (DO 6, the wrapper's test id and the stop count) is followed over the
  architecture-advisor's `accessibleText` form (its DO 7): the design-advisor owns the reading, its form is a superset
  (it prints the count whatever it is), and the test id carries no count. The expected lines are the design-advisor's
  DO 7; the folder row ids were read in the tree: `folder-${folder.toLowerCase()}` (`InstalledSection.tsx:78`) and
  `updates-folder-${folder.toLowerCase()}` (`UpdatesSection.tsx:106`), wrapped as `group-row-<id>` (`Listbox.tsx`).
- The gotcha sentence: the design-advisor puts its removal in the closing commit, whose run is the second; the
  architecture-advisor says not before the second consecutive green run. Sent back to the architecture-advisor
  (follow-up 1 below): the closing commit removes it and changes nothing under `src`.
- The tracker row's gate literal `tab stop "app"` is read as the design-advisor's form (its DO 7, pasted above):
  `tab stop "group-row-folder-app", stops 1` and `tab stop "group-row-updates-folder-app", stops 1`
  (architecture-advisor follow-up 1, DO 5).
- A stop whose wrapper has no test id and no text prints `unnamed`, never an empty string (follow-up 1, DO 6).

### 2026-11-15, UX-P3.fix-10, architecture-advisor, follow-up 1

Question: the design-advisor puts the gotcha sentence's removal in the closing commit, whose run is the second; the
opening DO NOT forbids removal before the second consecutive green run. Options: 1) the closing commit removes it and a
run printing the class reopens the item; 2) a third docs-only commit; 3) leave it to the planning session. Any
objection to the design-advisor's `PIN_FACTS` form?

> Follow-up 1, UX-P3.fix-10 (architecture-advisor).
>
> DECISION: Option 1. My DO NOT is withdrawn in its literal reading and replaced by the wording below. No objection to the design-advisor's `PIN_FACTS` form.
>
> WHY:
> - The tracker row (docs/plans/STATUS-ux.md:120) says the closing commit removes the class sentence, and the design-advisor's DO 8 and 11 say the same. The row defines the item; my line was stricter than it needed to be.
> - What my line protected was: no removal without evidence. Run 1, the proving push, carries the code. If the closing commit changes nothing under `src`, run 2 measures the same code a second time, so the removal rests on run 1 and is confirmed by run 2.
> - Option 2 costs a third run for no extra evidence. Option 3 leaves the item's own closing duty to another session.
> - The wrapper-test-id reading is the design-advisor's to own. It is deterministic, needs no `axe` in the page, and the wrapper is where `data-testid` lives (`Listbox.tsx:376`). It replaces DO 7 and VERIFY 8 of my opening ruling.
>
> DO:
> 1. Replacement wording for the DO NOT: "Do not remove the gotcha's class sentence before the proving run is green with `[aria] sidebar-all-projects-tools` reading `equal`; remove it in the closing commit, which changes no file under `src`."
> 2. Make the closing commit only after run 1 shows: `equal` on the cell, `differs` 0, and the tab-stop line on both tree cells in the design-advisor's form.
> 3. If run 2 prints the class, or any `differs` on the cell: stop-and-ask, item not `done`, and the fix-forward restores the sentence. No re-run to get an `equal` line.
> 4. If the closing commit must touch a file under `src` (a snapshot adoption, a `KEYS_EXPECTED` edit), it is no longer a second reading of the same code. Come back before pushing it.
> 5. Record in the item's note that the gate literal `tab stop "app"` of the tracker row is read as the design-advisor's form, citing its pasted ruling.
> 6. Check one thing in the print: a tab stop whose wrapper has no `data-testid` must print something distinguishable (for example `none`), never an empty string.
>
> VERIFY:
> 1. `git diff --stat <proving-sha>..<closing-sha> -- src` → no output.
> 2. Run 1 and run 2, Modern log: `grep '\[aria\] sidebar-all-projects-tools'` → `equal` on both runs.
> 3. Both runs: the `[reach] sidebar-all-projects-tools` line holds `tab stop "group-row-folder-app", stops 1`, and the `[reach] sidebar-all-projects-updates` line holds its first folder row's id with `stops 1`. I did not read the Updates tree's first-row id; take the literal from the design-advisor's ruling.
> 4. `shasum -a 256 src/test/ui/v2/aria/sidebar-all-projects-tools.json` → d0cec4c1bbf3727dcfac739911e85d02f99ee94e09fb777efc3e3deb7ed77355 at both commits.
> 5. After the closing commit: `grep -c 'P3.fix-10 removes it' .github/copilot-instructions.md` → 0, and `npm run docs:check` → exit 0.
>
> Not checked: I did not read your diff or the design-advisor's ruling text; this answers the brief as stated.

## Exact next step (one item ID)

UX-P3.fix-10 is `done`. Its closing commit's run must read `[aria] sidebar-all-projects-tools … equal` and both
tab-stop lines again (the second reading); if it prints the class or any `differs` on the cell, the item reopens as a
stop-and-ask. Next item: UX-P3.11b.

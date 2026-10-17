# STATUS — src/webview/shared   commit 80940aa (parent of the P9.fix-2 commit)   2026-10-17T10:00:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`,
`ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`,
`src/webview/main/index.test.tsx`, `src/webview/shared/store/{StoreProvider.tsx,StoreProvider.test.tsx,transitive.tsx,transitive.test.tsx}`,
`src/webview/sidebar/{index.tsx,index.test.tsx,STATUS.md}`, `src/webview/shared/STATUS.md`

Item: **P9.fix-1** — the sidebar asks no transitive packages ahead of time (finding N87), from BLOCKING 1 of the P9
phase review and the follow-up ruling on the test shape (both verbatim below). This note replaces the P9.2/P9.11 note
(history at `c946043`).

## Verified by running

```text
baseline (3f2a2e0)   → npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npx vitest run: 135 files,
                       2011 passed, 9 skipped
npx tsc --noEmit     → exit 0
npm run check-types  → exit 0
npx eslint src       → exit 0
npm run lint         → exit 0
npx vitest run --project frontend src/webview/shared/store src/webview/sidebar src/webview/main/index.test.tsx
                     → Tests 193 passed (193)
npm test             → exit 0; Test Files 135 passed (135); Tests 2016 passed | 9 skipped (2025)
npm run bench        → exit 0; Test Files 14 passed (14); Tests 75 passed (75)
npm run docs:check   → exit 0; docs:protocol:check — docs/protocol.md is up to date.
node esbuild.mjs --production --analyze → exit 0; dist/extension.js 297018 / 322502, dist/webview.js 548791 / 577766,
                       dist/sidebar.js 333128 / 351245 (run 39016052047 at 3f2a2e0: 297018, 548746, 333071; +45 and
                       +57 bytes)
npm run package:vsix → exit 0; DONE Packaged: nuiget-v2.0.0.vsix (17 files, 581.13 KB)
npm run check:vsix   → check:vsix: OK
negative control     → `prefetch={false}` removed from src/webview/sidebar/index.tsx: `the entry mounts the store
                       without the transitive prefetch (P9.fix-1, N87)` fails, the StoreProvider tests pass (1 failed |
                       9 passed); line restored. `!prefetch ||` removed from transitive.tsx: the slice test fails;
                       restored.
grep -rn "dispatchEvent(new MessageEvent" src/webview (tests) → MessageBus.test.ts:200 only
npm run test:ui      → SKIPPED locally: CI runs the UI job on the push; the visual check follows in the gate re-run
```

## Done (tested)

- `store/transitive.tsx`: `TransitiveProvider` `prefetch?: boolean`, default `true`; the 500 ms timer does nothing when
  it is `false`; `enable()` and `restore()` unchanged. Test `prefetch false: the installed list ready asks nothing after
  the delay, and enable() still asks transitive/get`; the P9.5 prefetch test is unchanged.
- `store/StoreProvider.tsx`: `prefetch?: boolean`, default `true`, passed to `TransitiveProvider` only. Tests `prefetch
  false reaches the transitive slice: no transitive/get after the installed list` and `without the prop the transitive
  slice asks transitive/get once after the installed list` (createFakeHost, fake timers).
- `src/webview/sidebar/index.tsx`: `<StoreProvider bus={bus} prefetch={false}>`; test `the entry mounts the store
  without the transitive prefetch (P9.fix-1, N87)` through a `vi.doMock` wrapper that records the props and renders
  the real `StoreProvider`. `src/webview/main/index.test.tsx`: `the entry mounts the store with the transitive
  prefetch (P9.fix-1, N87)` (main entry unchanged).
- Ledger N87 in both tables; ARCHITECTURE store table (`transitive` bullet); CHANGELOG `### Fixed`; the gotcha row
  "Host messages in a component test" gains the entry sentence.

- P9.fix-2 (N88, by the ruling verbatim in `src/webview/main/STATUS.md`): `primitives/Listbox.tsx` `moveTo` asks the
  option to `scrollIntoView?.({ block: 'nearest' })` after `scrollToIndex`, because a list as high as its rows inside
  an outer scroller cannot scroll itself and the focus is `preventScroll`; `Listbox.test.tsx` `ArrowDown scrolls the
  active option into view (a list in an outer scroller cannot scroll itself)` (fails without the line). Gates in
  `src/webview/main/STATUS.md`.
- P9.fix-3 (D15 amended): `primitives/Row.tsx` third line for the authors when there is no description;
  `primitives.css` comfortable option centred, icon without top margin; `tokens.css` `--nuiget-row-height-comfortable:
  78px`; `Listbox.tsx` `ROW_HEIGHT.comfortable` 78 (the tokens lint pairs them). `Row.test.tsx` rewrite and new test.

## Done (untested)

- Nothing.

## Visual check (CI run 39017730043, push of cf9d794, artifact `ui-screenshots`, 15 PNGs)

viewed: sidebar-sections.png: sidebar Installed (2) and Updates (2) rows as at 3f2a2e0; nothing in the sidebar depended on the prefetch
viewed: main-transitive-expanded.png: the main panel still shows `TRANSITIVE PACKAGES (1)` with the `net8.0` badge and the Serilog card, so the main entry keeps the P9.5 prefetch

## Not started

- Nothing of P9.fix-1.

## Deviations from contract/ADR (file:line each)

- None. No file under `src/protocol/**`, `src/core/contracts.ts` or `docs/adr/**` changed.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-17, P9 phase review (`PHASE REVIEW P9`, `architecture-advisor`), verbatim (also under `## Phase gates` of
`docs/plans/STATUS.md`):

`````text
VERDICT: PASS WITH FIXES

BLOCKING:
1. P9.fix-1 — The sidebar runs the P9.5 transitive prefetch and its feed enrichment for a list it never shows. `src/webview/shared/store/StoreProvider.tsx:28` mounts `TransitiveProvider` for both entries; since 9ea8a40 the provider enables itself 500 ms after the committed project's installed list is ready (`src/webview/shared/store/transitive.tsx:50-62`, `TRANSITIVE_PREFETCH_MS`), with no consumer check, and `useTransitive` has consumers only in `src/webview/main` (`TransitiveSection.tsx:35`, `TransitiveDetails.tsx:21`; `grep -rn "useTransitive(" src/webview/sidebar` is empty). A sidebar-only session therefore sends `transitive/get` (assets read through the Catalog) and then `transitive/metadata` over the whole transitive set (`transitive.tsx:78-97`), which the enricher answers with a lookup, an icon fetch and a vulnerability check per package (`src/core/feeds/enricher.ts:54-56`); once enabled the key is live, so every `transitive:<project>` invalidation re-asks and re-enriches (`useResource.ts:53,105`). At `labs/2.0-P8-done` the slice had no timer (`git show labs/2.0-P8-done:src/webview/shared/store/transitive.tsx` has `enabledFor === projectPath` only), so this is a regression of the phase. No gate sees it: the harness drives `FakeWebview`, not the React tree, and no sidebar jsdom test counts `transitive/get` (`grep -rn "transitive/get" src/webview/sidebar src/test/e2e src/test/ui` is empty). This is distinct from DP10 (the sidebar's own `transitive/metadata` for its installed rows, an open row by design). Fix: `TransitiveProvider` gains `prefetch?: boolean` (default `true`, so no existing test changes), plumbed through `StoreProvider`; `src/webview/sidebar/index.tsx` passes `prefetch={false}`; the main entry is unchanged. Negative test in `src/webview/sidebar/index.test.tsx` (it mounts the entry, which is the only place that proves the entry's prop): after `await import('./index')`, answer `session/get`, `projects/list` and `installed/get` through the `acquireVsCodeApi` mock's message path the way `SidebarView.test.tsx:36-38` does, wait past `TRANSITIVE_PREFETCH_MS`, and assert that `api().postMessage.mock.calls` holds no request of type `transitive/get` (and no `transitive/metadata` beyond what `InstalledProvider` already sends for the installed rows). Record finding N87 in `docs/plans/findings-ledger.md` (class: a request a surface sends that no test of that surface counts, like N85/N86).

NON-BLOCKING:
1. Closure table row MI12 reads `closed` (`docs/plans/parity-audit-2026-10-16.md:30`) but one of its three parts landed: headers in normal case (`main.css:683`); the count is shown whether expanded or not (`InstalledProjectSection.tsx:178`, the P9.11 tracker note itself says "count-when-collapsed deferred"), and the hover background was declined deliberately (`main.css:675`). Row should read `partly` with that note. P10.1 (docs).
2. Tracker row P9.13 (`docs/plans/STATUS.md:135`) has an empty Commit cell; P10.1 enters `3f2a2e0`, as RUN.md §5 step 1 directs for a closing commit.
3. TF8: the plan row (:359) says "the host rescans on `.csproj` create; both fixed", but the commits are the test-side Refresh loop (eb68dbb, 44c2980) and N86 (c9dffb7); the watcher at `extension.ts:320` is unchanged and a create event VS Code never delivers is still undetected host-side. The closure row is defensible (N86 was the real bounce), but P10.1's CHANGELOG must not claim a watcher fix; the optional hardening of the audit's TF8 fix (5) stays a 2.0.1 candidate.
4. README image URLs point at `raw.githubusercontent.com/.../main/docs/images/*.png` (`README.md:8,10,12`); the files exist on `labs/2.0` only until PR #18 merges, so the Marketplace listing of a VSIX published before the merge shows broken images. P10.1: the release checklist says merge first, then publish (D9).
5. `metadataResolver.fromSource` (`src/core/feeds/metadataResolver.ts:88-96`) starts a flat-container HEAD for every allowed source it tries, also for a source whose metadata lookup then fails, and never aborts it; one wasted HEAD per missed source. Harmless (`.catch(() => undefined)`), 2.0.1 candidate.
6. P9.9 (b) cites ADR-008 as the home of the ErrorBoundary but ADR-008 was not amended and has no error-handling text (`grep -i "error\|boundary" docs/adr/008-webview-architecture.md` is empty). A one-line amendment at the next contract item that opens the sentinel; not now.

DO:
1. Paste this review verbatim under `## Advisor decisions` of `docs/plans/STATUS.md` (and `src/webview/shared/STATUS.md` for the fix's directory).
2. Insert tracker row `P9.fix-1` (phase P9, status `open`) above P10.1 with the text of BLOCKING 1; its files: `src/webview/shared/store/transitive.tsx` + test, `src/webview/shared/store/StoreProvider.tsx`, `src/webview/sidebar/index.tsx` + `index.test.tsx`, ledger N87, ARCHITECTURE 2.0 store table (one clause), CHANGELOG `[Unreleased]` `### Fixed` headline `**The sidebar no longer asks for the transitive packages it does not show**`.
3. Stop after recording, per plan :367-369 and RUN.md §7 (the P9 gate includes the owner's review of `ui-screenshots`, run 39016052047); report the run id and artifact name.
4. The next session runs P9.fix-1 (gates of §2.2 step 5 plus the RUN.md §4 visual rule: view `sidebar-sections` and `main-transitive-expanded`; bundle sizes pasted, N63).
5. Tag `labs/2.0-P9-done` only when both hold: P9.fix-1 green on CI and the owner's `P9 approved`. I agree with holding the tag.

DO NOT:
- Do not remove the prefetch from the main panel or lengthen the delay: the P9.5 ruling put the count in the collapsed header, and its tests (`transitive.test.tsx:124`) stay.
- Do not drop `TransitiveProvider` from the sidebar's tree: `StoreProvider` is the one shared composition (ADR-008) and a `useTransitive` call without a provider would throw.
- Do not prove the fix with a test that mounts `StoreProvider prefetch={false}` itself; only the entry test proves the entry.
- Do not edit the 88 audit entries; only the closure table row.
- Do not touch `src/protocol/**`, `contracts.ts` or `docs/adr/**` for P9.fix-1.

CONTRACT CHANGE: none. The phase's one contract change was lawful under D6: ruling recorded in `src/host/STATUS.md:121-175` before the sentinel; sentinel `P9.9` during the edit, absent now (`ls .claude/.contract-change` → No such file; the hook denies `git commit` while it exists); 7b3b3f0 changes `src/protocol/messages.ts` (+2), `src/protocol/guards.ts` (+1 key), `docs/adr/007-protocol.md` (amended date and the 45th-request bullet), `docs/protocol.md` regenerated ("Requests (45)"); handler at `src/host/handlers.ts:435-439` clips each field to 4000; `handlers.test.ts` 44→45 is a recorded named rewrite. `docs/protocol.md` has no later drift (`git log labs/2.0-P8-done..HEAD -- docs/protocol.md` is that one commit) and the Lint job of run 39016052047 (docs:protocol:check) is green.

VERIFY:
- `grep -n "prefetch" src/webview/shared/store/transitive.tsx src/webview/shared/store/StoreProvider.tsx src/webview/sidebar/index.tsx` → the prop declared, plumbed and `prefetch={false}` in the sidebar entry only.
- `npx vitest run --project frontend src/webview/sidebar/index.test.tsx src/webview/shared/store/transitive.test.tsx` → 0 failed, the new negative test present by title, `transitive.test.tsx:124` unchanged and green.
- `grep -n "^| N87" docs/plans/findings-ledger.md` → one row.
- `grep -n "^| MI12" docs/plans/parity-audit-2026-10-16.md` → `partly`; `grep -nE "^\| P9\.13 .*\| done \| 3f2a2e0" docs/plans/STATUS.md` → one line (after P10.1).
- `grep -nE "^\| P9\.fix-1 \| P9 \|.*\| open \|" docs/plans/STATUS.md` → one line above P10.1; `git tag -l 'labs/2.0-P9-done'` → empty until P9.fix-1 is green and the owner wrote `P9 approved`.

CHECKED:
- Commits: `git log --oneline labs/2.0-P8-done..HEAD` (45, HEAD 3f2a2e0); `git diff --stat` (150 files, +8226/−1306); full diffs of `src/extension.ts`, `src/core/feeds/{icons,flatContainer,metadataResolver,search,types}.ts`, `src/core/catalog/feedClients.ts`, `src/webview/shared/store/{ops,details,allProjects,transitive,search}.tsx`, `src/webview/shared/installed/rules.ts`, `viewState.ts`, `MultiInstallDialog.tsx`, `sidebar/UpdatesSection.tsx`, `src/test/harness/{scenarios.test,fakeFeed,harness}.ts`, `src/test/ui/v2/{theme,main-search,main-all-projects,main-installed}.ui.test.ts`, `src/test/lint/webview-{css-baseline,tokens,stylesheets}.test.ts`, `.github/workflows/ci.yml`, `docs/plans/RUN.md`; `git show 7b3b3f0` (protocol, guards, ADR-007, protocol.md, handlers).
- Files read: `src/host/feedback.ts` (whole), `ErrorBoundary.tsx`, both entries, `useInstallAction.ts`, `MainShell.tsx:220-300`, `metadataResolver.ts:1-80`, `handlers.ts:276-300`, `Catalog.ts:283-300`, `enricher.ts`, `useResource.ts`, `StoreProvider.tsx`, `tokens.css`, `CHANGELOG.md` head, `README.md` images, `docs/plans/parity-audit-2026-10-16.md:1-111` and the MI12/TF8 entries, the plan §1-§3 and P9/P10 rows, tracker rows P9.0-P9.13/P10.1, `src/host/STATUS.md` and `src/protocol/STATUS.md` rulings, `.github/STATUS.md`, ledger N85/N86, `src/webview/sidebar/index.test.tsx:1-44`.
- Tests: all 28 plan-named titles present (grep by title, each in its named file); removed `it(` lines are three renames recorded as named rewrites (44→45 requests; the provisional header title; the grouped-suggestions title); no `.skip`/`.only`/`skipIf` added; no test file deleted or renamed.
- Salvage gate: no `Thenable` outside `contracts.ts`; no `vscode` import in core; no core→host/webview/react import; no webview→core/host/vscode import; `child_process` only under `src/core/cli`; Node ≥ 20 API in added lines only `.at(-1)` in test files (Node 24 tests); `show*Message`/`withProgress` outside `feedback.ts` are the pre-submission messages the P9.9 ruling listed.
- CI: `gh run view 39016052047 --json` → `success`, headSha 3f2a2e0, 10 of 10 jobs success; ci.yml uploads `ui-screenshots` with `if: always()` + `if-no-files-found: error` and checks every `ScreenshotState` name (15 states ≥ 12).
- Gate claims not re-run here (read-only session): tsc/check-types/eslint/lint/docs:check 0, `npm test` 135 files 2011 passed 9 skipped, bench 0 — taken from the brief and consistent with the green Lint, Test, Build & Package and Benchmark jobs of the run.
`````

2026-10-17, P9.fix-1, follow-up to the same agent: "the entry builds `createMessageBus(api)` on `window`, and the gotcha
'Host messages in a component test' forbids dispatching `MessageEvent`s on `window`: which test shape proves the fix,
and does the main entry's test need an assertion?" Answer, verbatim:

`````text
DECISION: Option 2, in three layers, and yes, the main entry's test asserts too. Not Option 1: no second exception to the "Host messages in a component test" gotcha. My earlier DO NOT ("only the entry test proves the entry") is refined, not reversed: the entry test proves what the entry passes, the StoreProvider test proves the plumbing and the behaviour on the real bus, the slice test proves the prop's semantics; the three together prove the fix. Noted that RUN.md §6.2 has the session run P9.fix-1 before the stop; my DO 3/4 yield to that.

WHY: The brief is right about the tree: `src/webview/sidebar/index.tsx:21` builds `createMessageBus(api)` with the default `source = window` (`MessageBus.ts:67`), so answering the entry's `installed/get` means `window.dispatchEvent(new MessageEvent(...))`, which the gotcha reserves to `MessageBus.test.ts`; the gotcha exists because such a test couples itself to the bus's transport and bypasses `createFakeHost` (`testSupport.ts:43-49`), and a second named exception would invite a third. The entry test file already proves things about the entry by `vi.doMock` of a module the entry imports (`index.test.tsx:55`, `./SidebarView`; `main/index.test.tsx:55`, `./MainShell`) under `vi.resetModules()` (`:10`) and `vi.doUnmock` (`:18`), so a recording wrapper around `../shared/store/StoreProvider` that renders the real provider is the file's own pattern and keeps `:36-40` (the request set) true. The prop must stay default `true`: 15 test files mount `<StoreProvider` and the plan prefers the option that keeps tests intact; a required prop would be 15 named rewrites for no extra proof. With default `true` the main entry passes nothing, so the main test asserts `prefetch` is not `false` to stop the sidebar line from being copied there. `StoreProvider.test.tsx` exists and the plumbing (`StoreProvider` → `TransitiveProvider`) is otherwise untested; a `createFakeHost` test there is the one place that proves `prefetch={false}` on the store reaches the slice and silences the timer. `transitive.test.tsx:35-38` already mounts `TransitiveProvider prefetch={prefetch}` next to the existing prefetch test at `:124`, which stays as the default-`true` proof.

DO:
1. `src/webview/shared/store/transitive.tsx`: `TransitiveProvider` gets `prefetch?: boolean` (default `true`); the timer effect (`:50-62`) returns early when `prefetch === false`; `enable()` and `restore()` unchanged. `StoreProvider.tsx`: `prefetch?: boolean` passed through to `TransitiveProvider` only. `src/webview/sidebar/index.tsx`: `<StoreProvider bus={bus} prefetch={false}>`. `src/webview/main/index.tsx` unchanged.
2. `src/webview/shared/store/transitive.test.tsx`: new test `prefetch false: the installed list ready asks nothing after the delay, and enable() still asks transitive/get` using `mount(false)`: answer `installed/get`, `wait(TRANSITIVE_PREFETCH_MS + 1)`, `host.requests('transitive/get')` is `[]`; then `enable()`, one `transitive/get`. The test at `:124` stays as it is (default).
3. `src/webview/shared/store/StoreProvider.test.tsx`: new test `prefetch false reaches the transitive slice: no transitive/get after the installed list` with `createFakeHost`, `<StoreProvider bus={host.bus} prefetch={false}>`, answer `session/get`, `projects/list`, `installed/get` as `SidebarView.test.tsx:36-38` does, advance past `TRANSITIVE_PREFETCH_MS`, assert `host.requests('transitive/get')` is `[]`; a sibling test without the prop asserts one `transitive/get` after the delay (the plumbing of the default).
4. `src/webview/sidebar/index.test.tsx`: new test `the entry mounts the store without the transitive prefetch`: `vi.doMock('../shared/store/StoreProvider', async importOriginal => { const actual = await importOriginal<typeof import('../shared/store/StoreProvider')>(); return { StoreProvider: (props) => { seen.push(props); return actual.StoreProvider(props); } }; })` (or render `<actual.StoreProvider {...props} />`), then `await import('./index')`, assert `seen[0].prefetch === false`; `vi.doUnmock('../shared/store/StoreProvider')` in `afterEach` beside `:18`. Same test in `src/webview/main/index.test.tsx` asserting `seen[0].prefetch` is not `false`.
5. Ledger N87; ARCHITECTURE 2.0 store table clause ("the sidebar mounts the store with `prefetch={false}`"); CHANGELOG `[Unreleased]` `### Fixed` `**The sidebar no longer asks for the transitive packages it does not show**`; gotcha row under "Host messages in a component test" gains one sentence: "An entry's requests are proved by a `vi.doMock` wrapper of a module it imports, never by answering them on `window`." `src/webview/shared/STATUS.md` and `src/webview/sidebar/STATUS.md` rewritten; tracker row P9.fix-1 `done` with the SHA; then re-run the P9 gate line and stop for the owner.

DO NOT:
- Do not dispatch `MessageEvent`s on `window` in `index.test.tsx`, and do not add an exception for it to the gotcha.
- Do not make `prefetch` required or default `false` (15 StoreProvider mounts; the main panel's P9.5 behaviour and `transitive.test.tsx:124` stay).
- Do not mock the bus, `TransitiveProvider` or `useResource` in any of the three tests; only the StoreProvider module is wrapped, and it renders the real one.
- Do not drop `TransitiveProvider` from the sidebar's tree or render a different `StoreProvider` composition per surface (ADR-008: one shared store).
- Do not change the delay or the main entry.

CONTRACT CHANGE: none.

VERIFY:
- `grep -n "prefetch" src/webview/shared/store/transitive.tsx src/webview/shared/store/StoreProvider.tsx src/webview/sidebar/index.tsx src/webview/main/index.tsx` → declared with default true in the slice, plumbed in the store, `prefetch={false}` in the sidebar entry, no match in the main entry.
- `npx vitest run --project frontend src/webview/shared/store/transitive.test.tsx src/webview/shared/store/StoreProvider.test.tsx src/webview/sidebar/index.test.tsx src/webview/main/index.test.tsx` → 0 failed, the four new titles present, `transitive.test.tsx:124` and `sidebar/index.test.tsx:22` unchanged and green.
- `grep -rn "dispatchEvent(new MessageEvent" src/webview --include='*.test.tsx' --include='*.test.ts'` → `MessageBus.test.ts` only.
- Negative control before committing: revert the one line in `sidebar/index.tsx` (`prefetch={false}` removed) → the sidebar entry test and the StoreProvider default test still pass, the entry test fails; restore the line.
- `npx tsc --noEmit`, `npm run check-types`, `npx eslint src`, `npm test`, `npm run bench`, `node esbuild.mjs --production --analyze` (three sizes in the STATUS note, N63), CI green, `ui-screenshots` viewed: `sidebar-sections`, `main-transitive-expanded`.
`````

Acted on: DO 1-5 of the follow-up; the review's DO 3 and DO 4 yield to RUN.md §6 step 2 (stated in the follow-up).

## Exact next step (one item ID)

P9.fix-4 (the Toolbar part of the P9.fix-2..6 ruling).

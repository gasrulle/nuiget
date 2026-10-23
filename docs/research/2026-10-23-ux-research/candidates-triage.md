# Candidates triage: every 2.0.1 candidate, bucketed for the UX overhaul

Research dimension `candidates-triage` of the nUIget UX-overhaul sweep, 2026-10-22. Read-only against
`/Users/mattias/github/nuiget` `main` at `e4d6e97`. Every claim cites `path:line` on that tree, a command and its
output, or a fetched URL. "Not verified" marks what was not checked.

## 1. Summary

48 triage rows, none unassigned:

| Bucket | Rows | Ids |
|---|---:|---|
| ux-item | 26 | N81 (a), N82, DP10, MI7, DP8, MI10, MU8, MI12, MB16, MB18, MB19, SB2, SB7, SB9, SB10, SB13, SB14, V1, V2, V3, V4, V5, RESTORE-HEADER, DETAILS-CONTRAST, DETAILS-GRID, MULTI-FOLDER |
| pre-release-blocker | 2 | DP3, RELEASE-MECHANICS |
| post-release-backlog | 18 | N19, N81 (b), N84, MI11, MB13, MB17, MH9 (recent searches), P7.4, LIST-RENDER-ALL, TF8-WATCHER, METADATA-HEAD, ADR-008-AMEND, R21-TEST, R15-TEST, MATRIX-HOLES, DEP-SWEEP, CACHED-FIDELITY, PR-TEMPLATE |
| owner-decides | 2 | N64, MB3 |

What changes against the inherited verdicts:

1. **DP3 becomes a pre-release blocker.** The P9.1 acceptance and the refuter's "Browse only, medium" predate P9.3 to
   P9.5; package icons now render in five main-panel lists that share the one icon resolver, so the breaker can blank
   every list the redesign shows (section 5, F1).
2. **N64 cannot be closed with ExTester at the current floor.** ExTester 8.28.1 supports VS Code 1.138.0 to 1.140.0
   only; the capture run used VS Code 1.140.0 with ChromeDriver 150 (F2). Owner decision with the floor ADR.
3. **SB7 should use the workbench binding**, Ctrl/Cmd+DownArrow from the search box, not 1.x's plain ArrowDown (F3).
4. **MI7/DP8 have a workbench colour role** (`problemsErrorIcon/WarningIcon/InfoIcon.foreground`), and MI10's
   danger-button half is moot (VS Code defines no danger button colour) (F4).
5. **Recent searches stay removed by the workbench rule**: the Extensions view's search box has no history (F3).
6. **14 candidates live outside the three named sources** (STATUS.md hand-offs, the closure table's footer, the
   release checklist). They are triaged here and need ledger rows (F7).

## 2. Frame and bucket rules

### 2.1 What "2.0.1" means now

- The Marketplace still serves 1.18.9 only. Command: `curl -s -X POST
  https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery` for `Gasrulle.nuiget`, output
  `1.18.9 2026-10-10T08:08:42.577Z` as the newest version. `package.json` on `main` says `2.0.0`; `git tag --list`
  has no `v2.0.0`.
- The owner's brief: the UX overhaul "ships as the 2.0.0 pre-release (the first published 2.x ...), 2.0.1 as the
  regular release afterwards" (`~/github/nuiget-ux-initiative-prompt.md:46-47`).
- Every "2.0.1" in the 2.0 documents therefore meant "after a 2.0.0 that never shipped". None is backlog by
  default; each was bucketed again.
- Base: `main` `e4d6e97`. `origin/main` is one commit ahead (`622352d`, `.github/dependabot.yml` and
  `.github/workflows/dependabot-auto-merge.yml` only; `gh api repos/gasrulle/nuiget/compare/e4d6e97...622352d`), so
  no candidate is affected.

### 2.2 Bucket rules applied

1. **ux-item** when the overhaul's design touches the screen the candidate lives on (layout, states, keyboard model,
   row content, dialogs). The screen is named.
2. Otherwise **pre-release-blocker** when a user of the first published 2.x would meet wrong data, a silent
   misbehaviour or an authentication failure without recovery, and nothing earlier accepted that for the same
   publication on the same evidence.
3. Otherwise **post-release-backlog** (to be recorded in `docs/plans/findings-ledger.md`).
4. **owner-decides** only where the buckets differ materially in cost or scope and no rule or measurement decides.

A fix the design would not itself specify (prefetch timing, text decoding, a core breaker) is bucketed by rules 2
and 3 even when it lives on a designed screen; this is why MI11, MB13 and MB17 are backlog rows.

Each ux-item also carries a **cuttable** tag. The brief lets the plan cut feature phases on overrun but not polish
(`~/github/nuiget-ux-initiative-prompt.md:46-52`). A correctness or accessibility fix on a designed screen is tagged
"polish, not cuttable" so that it rides with that screen's polish item and cannot be lost with a feature phase.

### 2.3 Sources read

| Source | What was taken | Evidence |
|---|---|---|
| `docs/plans/findings-ledger.md` | `grep -n '2\.0\.1'` → lines 123 (N19), 168 (N64), 179 (N81), 180 (N82), 182 and 454 (N84), 457 (N87, which names DP10) | command output |
| `docs/plans/parity-audit-2026-10-16.md` `## Closure status` | 17 `open` rows (MI10, MI11, MU8, MB3, MB13, MB16, MB17, MB18, MB19, SB2, SB7, SB9, SB10, SB13, SB14, DP8, DP10) and 3 `partly` rows (MI7, MI12, DP3); the table's footer (`:109-110`) | `parity-audit-2026-10-16.md:18-110` |
| `docs/plans/regression-matrix.md` "Not rows" | recent searches, hover prefetch, Collapse all / Expand all, ArrowLeft/ArrowRight between the details tabs, V1–V5, P7.4, header "Restore project(s)" | `regression-matrix.md:18-21` |
| `docs/plans/STATUS.md` advisor rulings | every "2.0.1" hand-off not in the ledger | `grep -n '2\.0\.1' docs/plans/STATUS.md` |
| `docs/release-checklist.md` | release route, approvals, pre-release packaging | `release-checklist.md:1-110` |
| Sub-directory `STATUS.md` notes | cross-check of the sidebar's open rows | `src/webview/sidebar/STATUS.md:32` lists SB2, SB7, SB9, SB10, SB13, SB14, DP10 (matches the closure table) |

Deduplication: the "Not rows" paragraph overlaps the closure table (hover prefetch = MI11 + MB13; Collapse all /
Expand all = MI10 + MU8; ArrowLeft/ArrowRight = MB18; recent searches = MH9, `not a gap` in the closure table at
`parity-audit-2026-10-16.md:69`). One row per id; each row lists all its sources. MI7 and DP8 are the same defect
filed twice (the critic says so, `parity-audit-2026-10-16.md:1519`); both ids keep a row with the same verdict.

N87 is `closed` (`findings-ledger.md:185`, P9.fix-1). Its section-4 entry matches the grep only because it says DP10
is "open for 2.0.1" (`findings-ledger.md:457`). N87 is not a candidate; DP10 is.

## 3. Triage table

Cost is in session-days. "Audit" cites the parity audit's own estimate line; "mine" is this dimension's estimate,
labelled as such. "Contract" means `src/protocol/**`, `src/core/contracts.ts` or `docs/adr/**` behind the
`.claude/.contract-change` sentinel (plan D6).

### 3.1 From the findings ledger

| # | Id | Source | What | Bucket | Screen | Cuttable | Cost | Contract |
|---|---|---|---|---|---|---|---|---|
| 1 | N19 | `findings-ledger.md:123`, `:384`; `STATUS.md:4188` | In the provisional list of a multi-target project, a .NET Standard framework's resolved version is not found by framework and falls back to another framework's version | post-release-backlog | — | — | 0.5–1 (mine) | no |
| 2 | N64 | `findings-ledger.md:168`, `:434`; `STATUS.md:4189` | No CI job renders the webviews in the Chromium of the minimum VS Code (1.85, Chromium 114) | owner-decides | all webview screens (P0 harness) | — | 0 or 1–2 (mine) | ADR only if the floor moves |
| 3 | N81 (a) | `findings-ledger.md:179`; `STATUS.md:908` | `firstUsefulRender` is never sent when a session opens in All Projects | ux-item | main panel shell and sidebar shell, All Projects | polish, not cuttable | 0.25 (mine) | no |
| 4 | N81 (b) | `findings-ledger.md:179`, `:451`; `STATUS.md:4187` | No perf marks for project switch, operations, search and update check | post-release-backlog | — | — | 0.5 + ⚑ (mine) | yes |
| 5 | N82 | `findings-ledger.md:180`, `:452`; `STATUS.md:910` | On Windows a password with a placeholder inside a longer value (`prefix%VAR%`) is stored encrypted by default and never expanded | ux-item | main panel, NuGet sources dialog (add source) | polish, not cuttable (credential correctness) | 0.1 (mine) | no |
| 6 | N84 | `findings-ledger.md:182`, `:454`; `src/core/sources/STATUS.md:104` | Nothing warms credentials, so on a cold Windows machine the first private-feed request with a DPAPI password can go unauthenticated until the health monitor's next pass | post-release-backlog | — | — | 0.5 (mine) | no |
| 7 | DP10 (via N87) | `parity-audit-2026-10-16.md:98`, `:1307-1316`; `findings-ledger.md:457`; `src/webview/sidebar/STATUS.md:32` | The sidebar asks `transitive/metadata` for its installed rows and renders none of it | ux-item | sidebar, Installed section rows | polish, not cuttable | 0.5 or 0 (audit `:1309`) | no |

### 3.2 From the parity audit's closure table

| # | Id | Source | What | Bucket | Screen | Cuttable | Cost | Contract |
|---|---|---|---|---|---|---|---|---|
| 8 | MI7 (partly) | `parity-audit-2026-10-16.md:25`, `:215-223` | Installed and transitive rows show a generic "Vulnerable" badge with no severity or count (the tab count landed) | ux-item | main Installed tab rows (single and All Projects) and transitive rows | polish, not cuttable | 0.5 with DP8 (audit `:217`) | no |
| 9 | DP8 | `parity-audit-2026-10-16.md:96`, `:1287-1295` | Same defect as MI7, filed by the pipeline area | ux-item | as MI7 | polish, not cuttable | in MI7 (audit `:1289`: 0.25) | no |
| 10 | MI10 | `:28`, `:245-253`; `regression-matrix.md:18`; `CHANGELOG.md:92` | The Installed bulk toolbar has no Collapse all / Expand all (and Uninstall selected is no danger button) | ux-item | main Installed tab toolbar, All Projects | feature, cuttable | 0.5 shared with MU8 (audit `:247`) | no |
| 11 | MU8 | `:38`, `:420-428`; `regression-matrix.md:18`; `CHANGELOG.md:92` | The All Projects Updates toolbar has no Collapse all / Expand all | ux-item | main Updates tab toolbar, All Projects | feature, cuttable | in MI10 (audit `:422`: 0.5) | no |
| 12 | MI11 | `:29`, `:255-263`; `regression-matrix.md:18`; `CHANGELOG.md:92` | Hovering an Installed row no longer prefetches its versions and metadata | post-release-backlog | — | — | 0.5 (audit `:257`) | no |
| 13 | MI12 (partly) | `:30`, `:265-273`; `STATUS.md:1067` | All Projects project headers show their count while expanded; the hover background was declined on purpose | ux-item | main Installed and Updates tabs, All Projects project headers | polish, not cuttable | 0.25 (audit `:267`) | no |
| 14 | MB3 | `:44`, `:521-552`; `docs/perf-baseline.md:49-50` | Browse shows a skeleton until every result is enriched (lookup and icon) | owner-decides | main Browse list (loading state) | — | 1 + ⚑ (audit `:523`) or 0 | yes for the chunk |
| 15 | MB13 | `:54`, `:661-669`; `regression-matrix.md:18`; `CHANGELOG.md:92` | Hovering a Browse row no longer prefetches versions and metadata | post-release-backlog | — | — | 0.5 (audit `:663`) | no |
| 16 | MB16 | `:57`, `:691-699` | After the prerelease toggle the details version selector stays on the old newest version; the list is unbounded | ux-item | main details pane header, version selector | polish, not cuttable | 0.25 (audit `:693`) | no |
| 17 | MB17 | `:58`, `:701-709` | HTML entities in search and registration descriptions are shown literally | post-release-backlog | — | — | 0.25 (audit `:703`) | no |
| 18 | MB18 | `:59`, `:711-719`; `regression-matrix.md:18`; `CHANGELOG.md:92` | ArrowLeft/ArrowRight in a package list no longer switch the Details/README tabs | ux-item | main panel lists and details tabs (keyboard model, interaction model §5) | feature, cuttable | 0 (decision) or 0.5 (audit `:713`) | no |
| 19 | MB19 | `:60`, `:721-729`; `docs/ux/interaction-model.md:65` | Browse's first load announces nothing, though §4 requires a `role="status"` "Loading …" | ux-item | main Browse list and details pane, loading states | polish, not cuttable (accessibility) | 0.25 (audit `:723`) | no |
| 20 | SB2 | `:75`, `:970-983` (verification OK) | In `@installed`/`@updates` mode a collapsed section stays collapsed and the filter shows an empty header | ux-item | sidebar, Installed and Updates sections in filter mode | polish, not cuttable (correctness) | 0.1 (audit `:972`) | no |
| 21 | SB7 | `:80`, `:1050-1058` | No keyboard bridge from the search box to the lists and back | ux-item | sidebar search box and lists (main panel search box too) | polish, not cuttable (keyboard reachability) | 0.5 (audit `:1052`) | no |
| 22 | SB9 | `:82`, `:1070-1078` | Installed packages in the sidebar's Browse results have no Uninstall action or Delete key; All Projects shows "+" when installed everywhere | ux-item | sidebar Browse results, row actions | feature, cuttable | 0.5 (audit `:1072`) | no |
| 23 | SB10 | `:83`, `:1080-1088`; `interaction-model.md:67` | Under All Projects the sidebar's project headers carry no "provisional" badge, contrary to §4 | ux-item | sidebar All Projects project headers | polish, not cuttable (contradicts the model) | 0.25 (audit `:1082`) | no |
| 24 | SB13 | `:86`, `:1110-1118` | The sidebar's section count shows "0" and stays beside the loading spinner | ux-item | sidebar section headers | polish, not cuttable | 0.1 (audit `:1112`) | no |
| 25 | SB14 | `:87`, `:1120-1128` | The sidebar's search box is not focused when the view first renders | ux-item | sidebar search box | polish, not cuttable | 0.1 (audit `:1122`) | no |
| 26 | DP3 (partly) | `:91`, `:1205-1224` | Five consecutive real 404s at a source skip its icons until a sources or workspace refresh | pre-release-blocker | — | — | ≤ 0.5 (audit `:1207`; refuter 1–2 h) | no |

### 3.3 From the regression matrix's "Not rows" (not already above)

| # | Id | Source | What | Bucket | Screen | Cuttable | Cost | Contract |
|---|---|---|---|---|---|---|---|---|
| 27 | MH9 (recent searches) | `regression-matrix.md:18`; `parity-audit-2026-10-16.md:69`; plan `:335-338` (D16, reopened); `CHANGELOG.md:16`, `:92` | The 1.x recent-searches list stays removed | post-release-backlog (decision row: not restored) | — | — | 0 | no |
| 28 | V1 | `findings-ledger.md:188`, `:469`; `regression-matrix.md:19` | The main panel's tab bar and bulk toolbar look squeezed | ux-item | main panel tab bar and the Installed/Updates toolbars | polish, not cuttable | in the screen items | no |
| 29 | V2 | `findings-ledger.md:189`, `:470` | "Select all" and "Uninstall selected" are misaligned with each other and with the list | ux-item | main Installed tab toolbar | polish, not cuttable | in the screen items | no |
| 30 | V3 | `findings-ledger.md:190`, `:471` | The "provisional" badge of an All Projects project header overlaps the list's right border | ux-item | main Installed tab, All Projects project header | polish, not cuttable | in the screen items | no |
| 31 | V4 | `findings-ledger.md:191`, `:472` | Section headers have a small top margin and a large bottom margin | ux-item | main Installed tab section headers (direct, transitive) | polish, not cuttable | in the screen items | no |
| 32 | V5 | `findings-ledger.md:192`, `:473` | Spacing between header, toolbar, section headers and rows follows no single scale | ux-item | main panel vertical rhythm (Installed, Updates) | polish, not cuttable | in the screen items | no |
| 33 | P7.4 | `regression-matrix.md:19-20`; plan `:519`; `STATUS.md:106`; `release-checklist.md:36-37` | The manual VoiceOver/NVDA pass was skipped | post-release-backlog | — | — | owner-run | no |
| 34 | RESTORE-HEADER | `regression-matrix.md:20`; `parity-audit-2026-10-16.md:110`, `:1512`; `interaction-model.md:87` | §5 lists "Restore project(s)" in the header; only the transitive banners offer Restore | ux-item | main panel header | polish, not cuttable (doc and code must agree) | 0.1 (drop from §5) or 0.5 (add, mine) | no |

### 3.4 Outside the three named sources

| # | Id | Source | What | Bucket | Screen | Cuttable | Cost | Contract |
|---|---|---|---|---|---|---|---|---|
| 35 | DETAILS-CONTRAST | `parity-audit-2026-10-16.md:110`, `:1510` | The theme UI test tolerates `incomplete` colour-contrast nodes inside the details pane, so the pane's contrast is never measured | ux-item | main details pane, all six themes | polish, not cuttable (accessibility gate) | 0.5 (mine) | no |
| 36 | DETAILS-GRID | `STATUS.md:1165`, `:1175` | The details actions grid never wraps; below about 300 px the whole pane scrolls sideways | ux-item | main details pane header, actions | polish, not cuttable | in the details header item | no |
| 37 | MULTI-FOLDER | `STATUS.md:1167` | No named state renders a workspace with two folders; the folder caption has never been seen | ux-item | main Installed and Updates tabs, All Projects with two workspace folders (P0 fixture and capture list) | polish, not cuttable | in the P0 fixture item | no |
| 38 | LIST-RENDER-ALL | `STATUS.md:1168` | The single-project Installed list renders every row (ruling C-1, accepted) | post-release-backlog | — | — | not estimated | no |
| 39 | TF8-WATCHER | `STATUS.md:1069` | A `.csproj` create event that VS Code never delivers is still undetected host-side | post-release-backlog | — | — | not estimated | no |
| 40 | METADATA-HEAD | `STATUS.md:1071`; `src/core/feeds/metadataResolver.ts:88-97` | `fromSource` starts a flat-container HEAD for every source it tries, also when the lookup then fails | post-release-backlog | — | — | ≤ 0.25 (mine) | no |
| 41 | ADR-008-AMEND | `STATUS.md:1072` | ADR-008 does not mention the ErrorBoundary that P9.9 says it holds | post-release-backlog (fold into the first UX commit that opens `docs/adr`) | — | — | one line | yes (ADR) |
| 42 | R21-TEST | `STATUS.md:1243`, `:1262` | Matrix row R21 is "covered" by a test that feeds the manifest defaults, so a hard-coded 20/5 would pass | post-release-backlog | — | — | ≤ 0.25 (mine) | no |
| 43 | R15-TEST | `STATUS.md:1244`, `:1262` | Matrix row R15 has no test of the Solution Explorer menu placement | post-release-backlog | — | — | ≤ 0.25 (mine) | no |
| 44 | MATRIX-HOLES | `STATUS.md:1251` | `check-regression-matrix.mjs` does not flag a gap row whose title exists and does not check a row's kind against its suite | post-release-backlog | — | — | ≤ 0.25 (mine) | no |
| 45 | DEP-SWEEP | `STATUS.md:1016`, `:1030`, `:4426` | `msw` and the integration setup's devDependencies have no importer left | post-release-backlog | — | — | ≤ 0.25 (mine) | no |
| 46 | CACHED-FIDELITY | plan `:526`; `STATUS.md:4430`; `src/core/contracts.ts:323` | `cachedFidelity` stays in the frozen contract; its deletion is a contract item | post-release-backlog | — | — | ≤ 0.5 + ⚑ (mine) | yes |
| 47 | PR-TEMPLATE | `STATUS.md:4534`; `.github/pull_request_template.md:43-58`, `:140-141` | The pull-request template names only deleted 1.x files | post-release-backlog | — | — | ≤ 0.1 (mine) | no |
| 48 | RELEASE-MECHANICS | `STATUS.md:4534`; `release-checklist.md:1-28`, `:62-97` | The release checklist is filled for the P10.1 build and its P9-approved screenshots, and CI packages no pre-release VSIX, while the overhaul ships as the 2.0.0 pre-release | pre-release-blocker | — | — | 0.5 (mine) plus an owner patch for `ci.yml` | no |

Not rows, recorded for completeness: `STATUS.md:4534` also asked to check `README.md:260` (`npm run compile`); the
script exists (`package.json` `scripts.compile` = `npm run check-types && npm run lint && node esbuild.mjs`), so that
hand-off is closed. `docs/adr/005-execution-context-and-outbound-policy.md:61` says a remote-specific defect "is a
2.0.1 finding"; no such defect is recorded, so there is nothing to triage.

## 4. Reasons and evidence per row

Lines are on `main` at `e4d6e97` unless a ref is named. Where the 2.0 documents cite lines that have moved, the
current line is given and the old one is called "cited".

### 4.1 Ledger rows

**1. N19 → post-release-backlog.** The provisional list looks up the resolved version by framework
(`src/core/project/inspector.ts:142-151`: `let resolved = framework === undefined ? undefined :
byFramework.get(framework)?.get(id);`) in a map keyed by the first segment of each assets `targets` key
(`src/core/project/assets.ts:151`: `const framework = target.split('/')[0];`); on a miss it falls back to the first
version the assets file lists for the id across frameworks (`inspector.ts:152-155`, `assets.ts:104-138`). The ledger
says a .NET Standard framework's `targets` key is not mapped (`findings-ledger.md:123`); no tracked fixture has a
netstandard target (`git ls-files 'src/core/project/__fixtures__/**/project.assets.json'` → one file, targets
`['net8.0']`), so that key format is the ledger's claim, not re-verified. The ledger's `assets.ts:241` is stale (that
line is now `computeTransitiveFrameworks`). Non-visual, provisional list only, the evaluated list is right, and the
P7.6 ruling accepted it "for 2.0.0" (`STATUS.md:4188`), which is the same first publication. Nothing new argues for
more.

**2. N64 → owner-decides.** The ledger's 2.0.0 guard is the CSS-baseline lint (`findings-ledger.md:168`). The UI job
runs `extest setup-and-run ... --code_version max` (`package.json:310`); the locked ExTester is 8.28.1
(`package-lock.json`, `node -e` → `8.28.1`) and declares `"supportedVersions": {"vscode-min": "1.138.0",
"vscode-max": "1.140.0"}` (`node_modules/vscode-extension-tester/package.json:59-61`). The capture run downloaded
VS Code 1.140.0 and ChromeDriver 150.0.7871.124 (`scratchpad/research/ui-job.log:223`, `:231`; that log checks out
`c50d335`, the commit of run 39025149785). So no WebDriver route can render the floor's Chromium. Options:
(A) a P0 harness item that renders the webview bundles under a fake host in a pinned Chromium matching the chosen
floor, about 1–2 days (mine) plus a new browser binary and its settings patch; which Chromium builds are obtainable is
not verified; (B) keep `src/test/lint/webview-css-baseline.test.ts` as the only guard, 0 days, although the overhaul
rewrites most CSS and the lint only denies features it knows; (C) raise the floor, which the owner allows only when a
technique is blocked, and raising it to ExTester's range would drop every user below 1.138. The buckets differ by a
new tool and 1–2 days of P0. Recommended: (A) when the floor ADR keeps a Chromium older than the one the UI job runs
and the design uses CSS close to that line; (B) otherwise.

**3. N81 (a) → ux-item.** Both shells key `firstUsefulRender` on the single-project slice
(`src/webview/main/MainShell.tsx:129-136`, `src/webview/sidebar/SidebarView.tsx:82-89`), which is `null` under
All Projects (`src/webview/shared/store/installed.tsx:30`, `:39`). The manifest and README promise the mark
("Writes the webviews' [perf] marks (webview ready, first useful render)", `package.json:282`, `README.md:97`). The
shells are rebuilt by the overhaul, and a perceived-speed measurement may read the mark. Cited lines
`MainShell.tsx:92`, `SidebarView.tsx:82` (`STATUS.md:908`) have moved.

**4. N81 (b) → post-release-backlog.** The mark names are a closed union in the frozen protocol:
`'perf/mark': { payload: { name: 'webviewReady' | 'firstUsefulRender'; ... } }` (`src/protocol/messages.ts:180`).
The shipped setting text names only those two marks (`package.json:282`), so nothing misleads a user. Promote to a
P0 item with its own ⚑ only if the measurement dimension picks in-product marks as its perceived-speed probe. Cited
handler `src/host/handlers.ts:422-430` is now `:425`.

**5. N82 → ux-item (NuGet sources dialog), not cuttable.** The dialog forces clear text only when the whole value
is one placeholder (`src/webview/main/features/sources/SourceSettingsDialog.tsx:65`:
`const ENVIRONMENT_PLACEHOLDER = /^%[^%\s]+%$/;`), while the reader expands a placeholder anywhere in a clear-text
value (`src/core/sources/NuGetConfigReader.ts:32`: `/%([^%\s]+)%/g`). On Windows the encrypt box is on by default, so
`prefix%VAR%` is stored encrypted as literal text and the feed answers 401. The dialog is a designed screen and the
fix is one expression and one test.

**6. N84 → post-release-backlog.** Verified: `package/prewarm` has a handler (`src/host/handlers.ts:321-322`) that
reaches `Catalog.prewarm` (`src/core/catalog/Catalog.ts:535`), and no file under `src/webview` sends it
(`grep -rn "package/prewarm\|\.prewarm(" src` outside tests → the handler, the Catalog and the protocol only). The
monitor retries a failed source after 120 000 ms (`src/extension.ts:250`; the ledger's `src/extension.next.ts:245`
no longer exists). The consequence was "accepted for 2.0.0" (`findings-ledger.md:182`), the same first publication
the overhaul becomes, and it was accepted knowing both CI measurements: one cold `powershell.exe` start killed at
10 346 ms against the 10 s budget beside a concurrent real-SDK restore (run 38873696417, `findings-ledger.md:454`),
and 6865 ms after the test fix (run 38876762482, `findings-ledger.md:182`). One of two measurements exceeded the
budget; nothing has been measured since. Recovery is automatic, and the release checklist has a manual DPAPI check
(R167, `release-checklist.md:42`). Promote it if the perceived-speed research wants credentials and service indexes warmed
at activation; that also removes the wait of several seconds before the first private-feed answer on a cold Windows
machine. The start-set tests pin the requests a webview sends at mount (`src/webview/main/index.test.tsx:39`).

**7. DP10 → ux-item (sidebar Installed rows).** `InstalledProvider` sits in the shared `StoreProvider`
(`src/webview/shared/store/StoreProvider.tsx:27`) and asks `transitive/metadata` on every list change
(`installed.tsx:70-87`); no non-test file under `src/webview/sidebar` reads `metadata` (`grep -rn metadata
src/webview/sidebar` outside tests → empty). Whether this is waste is a design decision: if the redesigned sidebar
rows show an icon or a vulnerability mark (today the sidebar has no vulnerability signal at all, `@vulnerable` is the
main panel's alone, `SidebarView.tsx:46`, `:120-121`), the ask becomes needed and DP10 closes as a no-op; otherwise
make the ask opt-in as the audit proposes (`parity-audit-2026-10-16.md:1312`).

### 4.2 Closure-table rows

**8–9. MI7 and DP8 → ux-item, not cuttable.** Rows still render `<Badge label="Vulnerable" tone="error"
title="Has known vulnerabilities" />` (`src/webview/main/features/installed/InstalledProjectSection.tsx:147`,
`TransitiveSection.tsx:159`); the Installed tab's vulnerable count landed (`regression-matrix.md:65`, R41). The
closure note keeps severity "words and icon, not colour (deliberate)" (`parity-audit-2026-10-16.md:25`); VS Code does
define severity colours, `problemsErrorIcon.foreground`, `problemsWarningIcon.foreground`,
`problemsInfoIcon.foreground` (`https://raw.githubusercontent.com/microsoft/vscode-docs/main/api/references/theme-color.md`,
lines 611-613 of the fetched copy at `scratchpad/research/triage-src/theme-color.md`). The colour-role table of the
design decides; the row badge is row anatomy.

**10–11. MI10 and MU8 → ux-item, feature (cuttable).** `CollapseAllIcon` and `ExpandAllIcon` exist
(`src/webview/shared/primitives/icons.tsx:221`, `:231`) and no non-test `.tsx` under `src/webview` renders them
(`grep -rn 'CollapseAllIcon\|ExpandAllIcon\|Collapse all\|Expand all' src/webview --include='*.tsx'` outside tests →
the two definitions only). The toolbars hold two buttons each (`InstalledTab.tsx:214-218`,
`AllProjectsUpdates.tsx:308-312`). MI10's danger-button half has no workbench answer to copy: the theme-colour
reference lists `button.background`, `button.foreground`, `button.border`, `button.separator`,
`button.hoverBackground` and the `button.secondary*` keys and no danger key (`triage-src/theme-color.md:129-137`), so
drop it. These toolbars are the containers V1 and V2 name; adding two icon buttons must fit their overflow rule.
Restoring them edits `CHANGELOG.md:92` ("Not back from 1.x: recent searches, Collapse all and Expand all, details
prefetched on hover, and ArrowLeft/ArrowRight between the Details and README tabs"), which the owner's ruling allows
until publication (`~/github/nuiget-ux-initiative-prompt.md:47-49`).

**12 and 15. MI11 and MB13 → post-release-backlog.** No webview code prefetches on hover (no `onMouseEnter` or
`prefetch` in the list primitives; `package/prewarm` warms sources, not packages, `Catalog.ts:535`). The behaviour is
invisible, no measurement of details-open latency exists (`docs/perf-baseline.md:20-37` lists dotnet timings, search
timings and bundle sizes only), a pointer-only prefetch gives keyboard users nothing, and the CHANGELOG already says
it is not back (`CHANGELOG.md:92`). Reopen if the perceived-speed research measures a details-open latency above its
target; prefetching the active row would serve keyboard users too (an idea, not evaluated).

**13. MI12 → ux-item, not cuttable.** Counts are passed whether expanded or not
(`InstalledProjectSection.tsx:178`, `AllProjectsUpdates.tsx:148`); the missing hover is deliberate
(`src/webview/main/main.css:700`: "No hover: VS Code's pane headers have none (P9.10)"). This is the header V3 names
and the sidebar header SB10 names: one header-anatomy decision (F5).

**14. MB3 → owner-decides.** `Catalog.search` enriches every result before it answers (audit `:525`, confirmed
by its refuters). A pre-registered rule keeps the fix closed: "When a cold search goes over its target on two
consecutive runs, open a ⚑ row P7.2d for a lite `found` chunk on `search/query`. ... Do not open the row before then"
(`docs/perf-baseline.md:49-50`). CI measured 1086 ms (baseline), 819 ms and 1058 ms cold against the 1700 ms target
(`docs/perf-baseline.md:34`, `:77`); one local run measured 2323 ms (audit `:537`, `:540`). Option
(A): a ux-item on Browse's loading state with a ⚑ protocol change (a results chunk before enrichment), about 1 day
(audit `:523`), if the design makes "rows before icons" a rule. Option (B): backlog under the P7.2d rule. Recommended:
(B) unless the design research makes progressive rows a rule; step 1 of the audit's fix (skip the redundant lookup
for API rows, core only, no contract) is backlog either way.

**16. MB16 → ux-item (details header), not cuttable.** The version is set at a selection
(`src/webview/shared/store/details.tsx:171`), at a view switch (`:185`) and by `chooseVersion` (`:257`) only; a
reloaded list after the prerelease toggle keeps it, and `package/versions` is asked without `take` (`:234`). The
version control is part of the details header whose overflow rule row 36 names.

**17. MB17 → post-release-backlog.** No decoding exists in the webview (`grep -rn 'decodeHtml' src/webview` →
empty). Probe: the top 1000 nuget.org search results for seven queries (`""`, json, http, logging, test, xml, html)
gave 6553 unique packages, of which 1 has an HTML entity in its description (`InheritDocTool`: `&lt; &gt;`); command
and data in `scratchpad/research/triage-src/probe-mb17/`. Registration-endpoint descriptions were not probed. Rare and
cosmetic; it can ride along if the Browse-row item touches description rendering.

**18. MB18 → ux-item (keyboard model), feature (cuttable).** `Listbox` handles ArrowUp/ArrowDown
(`src/webview/shared/primitives/Listbox.tsx:143-145`); `Tabs` handles ArrowLeft/ArrowRight only while a tab has focus
(`Tabs.tsx:40`). The design owns the list keyboard model: if All Projects groups become tree-like, ArrowLeft and
ArrowRight are the workbench's collapse and expand keys (workbench behaviour not verified here), which conflicts
with the 1.x binding. Recommended outcome: not restored (0 days); restoring is 0.5 days and edits `CHANGELOG.md:92`.

**19. MB19 → ux-item, not cuttable (accessibility).** `BrowseList` returns `<Skeleton density="comfortable" />`
while loading (`src/webview/main/features/search/BrowseList.tsx:92-93`) and announces only the answer (`:84`);
interaction model §4 requires 'Skeleton rows (3) + `role="status"` text "Loading …"' (`docs/ux/interaction-model.md:65`).

**20. SB2 → ux-item, not cuttable.** `expanded={layout.installedExpanded}` and `expanded={layout.updatesExpanded}`
are passed in every mode (`src/webview/sidebar/SidebarView.tsx:177`, `:198`; cited `:176/:197`), and the collapse
survives reloads in the view state. Verified by three refuters (audit `:970-983`). A 0.1-day correctness fix that must
not be lost with a feature phase.

**21. SB7 → ux-item, not cuttable.** The search box moves only inside its own dropdown (`if (open)`,
`src/webview/shared/search/SearchBox.tsx:176-191`). The workbench's Extensions view bridges with Ctrl+DownArrow
(Cmd+DownArrow on macOS): `SuggestEnabledInput` fires `onShouldFocusResults` on
`e.keyCode === KeyCode.DownArrow && (isMacintosh ? e.metaKey : e.ctrlKey)` (`suggestEnabledInput.ts:213`) and the view
focuses its list on it (`extensionsViewlet.ts:664`), plus a navigable-container next/previous pair
(`extensionsViewlet.ts:714-726`). Source: `microsoft/vscode` `main` at `54d565d2` (fetched 2026-10-22; copies in
`scratchpad/research/triage-src/`). 1.x used plain ArrowDown (audit `:1053`). By the owner's direction the item
should specify the workbench binding; the behaviour in VS Code 1.85 was not checked.

**22. SB9 → ux-item, feature (cuttable).** Enter on an installed Browse row announces "already installed"
(`src/webview/sidebar/BrowseResults.tsx:91-95`) and the row shows a badge, no Uninstall action (`:161-166`).

**23. SB10 → ux-item, not cuttable.** The badge renders only when `!all.active`
(`src/webview/sidebar/InstalledSection.tsx:135-136`); §4 places it on "the project header (All Projects sections ...,
sidebar Installed section)" (`interaction-model.md:67`). Either the badge or the model changes; the same badge
collides with the list border in the main panel (V3).

**24. SB13 → ux-item, not cuttable.** `SectionHeader` renders the count whenever it is defined
(`src/webview/shared/primitives/SectionHeader.tsx:51`), and `UpdatesSection.test.tsx:157` asserts "counts 0". The main
panel's Installed tab does the opposite: "The Installed tab counts the packages and shows no 0"
(`regression-matrix.md:64`, R40). The surfaces disagree; the design picks one rule. The workbench's behaviour for a
zero count in a pane header was not verified.

**25. SB14 → ux-item, not cuttable.** The host sends `ui/focusSearch` from `onDidChangeVisibility` only
(`src/host/SidebarHost.ts:58-60`) and the view focuses only on that event (`SidebarView.tsx:108`). The Extensions view
focuses its search box whenever the view takes focus (`extensionsViewlet.ts:731-733`: `override focus(): void {
super.focus(); this.searchBox?.focus(); }`).

**26. DP3 → pre-release-blocker.** The breaker is unchanged in shape since P9.1: threshold 5
(`src/core/feeds/icons.ts:27`), a suppressed source is skipped without a fetch (`:188-199`), a bare `missing` counts
and anything else clears (`:218-222`), and the count clears only through `reset()` (`:183-184`) on a sources or
workspace invalidation (audit `:1209`). The P9.1 acceptance and the refuter's downgrade ("Browse-only today
since no other list renders icons", audit `:1524`) predate P9.3–P9.5: `packageIconSrc` now renders in
`InstalledProjectSection.tsx`, `TransitiveSection.tsx`, `BrowseList.tsx`, `UpdatesTab.tsx` and
`AllProjectsUpdates.tsx` (`grep -rln packageIconSrc src/webview --include='*.tsx'` outside tests). The realistic
trigger is five consecutive ids that a source does not know, for example private packages asked of nuget.org in a
workspace without package-source mapping (refuter, audit `:1223`); then every list the redesign shows falls back to
the default icon until Refresh. Fix address-neutral (no nuget.org exemption: ledger M2, audit `:1218`), core only, no
contract, ≤ 0.5 day. Frequency is not established (no telemetry; not reproduced).

### 4.3 "Not rows" not covered above

**27. MH9 recent searches → post-release-backlog (decision row only).** D16 is reopened, so the plan's decision
table needs a row. The closest exemplar decides: the Extensions view's search box is a `SuggestEnabledInput` with
`'@'` trigger suggestions and no history (`extensionsViewlet.ts:639-647`), while input history belongs to the Search
view (`searchWidget.ts:37`, `:58`). nUIget's box mirrors the Extensions view ('@' prefixes). Keep it removed (0 days);
the CHANGELOG already says so (`CHANGELOG.md:16`, `:92`).

**28–32. V1–V5 → ux-items, not cuttable, negative control.** Deferred "as the negative control of its measurement
harness" (`findings-ledger.md:463-473`). Sequencing rule: the P0 harness must report each of them on the unchanged
tree before any item fixes it, otherwise the harness is never shown to catch what the owner saw. V1 has no numeric
rule yet and is judge-only by the brief's own words; V2–V5 are measurable from bounding rectangles (left edges,
baselines, badge rectangle against the list border, top against bottom margin, insets against a spacing scale).
Looking at `captures/39025149785/20261017T103410/main-installed-all.png`, the "provisional" badge's right edge sits on
the list pane's border (judge-only observation, V3).

**33. P7.4 → post-release-backlog.** The brief keeps it out: "the screen-reader pass stays out of scope and is recorded
as such" (`~/github/nuiget-ux-initiative-prompt.md:158-159`); the release checklist says it "is a 2.0.1 item, not a
release check" (`release-checklist.md:36-37`). Owner-run; automated substitutes belong to the accessibility dimension.

**34. RESTORE-HEADER → ux-item (main header), not cuttable.** §5 lists "Restore project(s) | Transitive banner,
header" (`interaction-model.md:87`); Restore is offered only by the transitive banners
(`TransitiveSection.tsx:84`, `AllProjectsTransitiveSection.tsx:115`), and 1.x had no header Restore either (critic,
audit `:1512`). The header is redesigned (V1); decide add (about 0.5 day, mine; `ops/restore` exists,
`src/webview/shared/store/ops.tsx:119`) or drop "header" from §5 (0.1 day). Either way the model and the code agree.

### 4.4 Outside the named sources

**35. DETAILS-CONTRAST → ux-item, not cuttable.** `theme.ui.test.ts:164-167` lets `incomplete` colour-contrast nodes
pass when they are inside the details pane; the critic found exactly such nodes under every theme
(audit `:1510`), and the closure footer keeps it open (`parity-audit-2026-10-16.md:109-110`). The redesigned details
typography should remove the tolerance (accessibility and harness).

**36. DETAILS-GRID → ux-item, not cuttable.** `.nuiget-details-actions` is a grid of `max-content` tracks
(`src/webview/main/main.css:287-291`) and the split goes down to 25 % (`MainShell.tsx:62`); the P9 review measured a
need of about 300 px with the multi-install button (`STATUS.md:1165`). The brief asks every row of controls,
"details actions" included, for a minimum width and an overflow behaviour.

**37. MULTI-FOLDER → ux-item (P0 fixture), not cuttable.** "No named state renders a workspace with two folders, so
nobody has viewed it" (`STATUS.md:1167`). The P0 fixture workspace and the capture list should include one.

**38. LIST-RENDER-ALL → post-release-backlog.** "Single-project Installed tab renders every row (ruling C-1, accepted
knowingly); one line for the 2.0.1 performance backlog" (`STATUS.md:1168`). Reopen if the design changes the list
structure or the performance research measures scroll cost on a large project.

**39. TF8-WATCHER → post-release-backlog.** "a create event VS Code never delivers is still undetected host-side ...
stays a 2.0.1 candidate" (`STATUS.md:1069`).

**40. METADATA-HEAD → post-release-backlog.** `fromSource` starts `packageSize` before `metadataOf` and awaits it only
when metadata was found (`src/core/feeds/metadataResolver.ts:88-97`); one wasted HEAD per missed source, harmless
(`STATUS.md:1071`).

**41. ADR-008-AMEND → post-release-backlog, folded into the first UX commit that opens `docs/adr`.**
`grep -ci 'error\|boundary' docs/adr/008-webview-architecture.md` → 0, while P9.9 names ADR-008 as the
ErrorBoundary's home (`STATUS.md:1072`). The plan commits ADR-010+ at approval
(`~/github/nuiget-ux-initiative-prompt.md:528-536`), so the one-line amendment costs nothing there.

**42–44. R21-TEST, R15-TEST, MATRIX-HOLES → post-release-backlog.** The P10 review rated them "2.0.1 items" and
"2.0.1 at most" (`STATUS.md:1243-1251`, `:1262-1263`); the matrix stays green without them.

**45. DEP-SWEEP → post-release-backlog.** `msw` is still a devDependency (`package.json`: `^2.15.0`) and
`grep -rl msw src scripts vitest.config.mts` → empty; dev-only, never in the VSIX (`STATUS.md:1016`, `:4426`).

**46. CACHED-FIDELITY → post-release-backlog.** `cachedFidelity(projectPath: string): Fidelity | undefined;`
(`src/core/contracts.ts:323`) stays; its deletion is "a 2.0.1 contract item behind the sentinel" (plan `:526`).

**47. PR-TEMPLATE → post-release-backlog.** The template's file map lists `src/webview/NuGetPanel.ts`,
`src/services/*.ts`, `src/webview/app/App.tsx` and other 1.x files (`.github/pull_request_template.md:43-58`,
`:140-141`); `ls src/services` → "No such file or directory".

**48. RELEASE-MECHANICS → pre-release-blocker (last phase).** The checklist is "Release checklist — nUIget 2.0.0",
refilled at P10.1 with the P10.1 gates and "Approved screenshots | CI run 39025149785" (`release-checklist.md:1-28`);
the overhaul replaces the UI those approvals cover. CI packages without `--pre-release` and "vsce 4.0.0 refuses
`vsce publish --pre-release` for a VSIX that was not packaged as a pre-release" (`release-checklist.md:62-66`), so
route A needs a local package by the owner (`:69-88`); a CI pre-release artifact "is a one-step `ci.yml` addition if
the owner wants pre-releases from CI" (`STATUS.md:4534`). Must be settled before the first publication; the
`ci.yml` part is an owner-applied patch.

## 5. Findings beyond the list

| F | Letter | Severity | Decision-relevant | Claim |
|---|---|---|---|---|
| F1 | V | medium | yes | DP3's blast radius widened after its acceptance: icons render in five main-panel lists that share one resolver per config chain, so the breaker can blank every list the redesign shows. Pre-release blocker. |
| F2 | H | medium | yes | ExTester 8.28.1 supports VS Code 1.138.0–1.140.0 only, and the UI job runs 1.140.0 with ChromeDriver 150; no WebDriver route renders the floor's Chromium 114, so N64 needs another technique or stays lint-guarded. |
| F3 | X | medium | yes | Workbench exemplars, verified in `microsoft/vscode` `main` at `54d565d2`: the Extensions view bridges search box → list with Ctrl/Cmd+DownArrow (SB7), focuses its search box when the view takes focus (SB14), and has no search history (recent searches stay removed). |
| F4 | V | medium | yes | VS Code has severity colour keys (`problemsErrorIcon/WarningIcon/InfoIcon.foreground`) and no danger-button key: MI7/DP8 get a colour role from the workbench; MI10's danger half is dropped. |
| F5 | X | medium | yes | V3, SB10 and MI12 are one header-anatomy decision (where the provisional badge and the count go on a project header, both surfaces); §4 of the interaction model (`:67`) must change with it. |
| F6 | X | low | yes | MI10/MU8 add two icon buttons to the toolbars V1 and V2 name; the toolbar's minimum-width and overflow rule has to budget them, so they belong to the toolbar item, not to a later feature phase that would break the measured layout. |
| F7 | H | medium | yes | No single 2.0.1 list exists: 14 candidates live only in `STATUS.md` advisor rulings, the closure table's footer and the release checklist (rows 35–48). None has a ledger row; the plan must add the backlog ones to the ledger or they are lost. |
| F8 | H | medium | yes | The release checklist and CI packaging are written for the P10.1 build; the overhaul ships as the 2.0.0 pre-release, which voids the P9 screenshot approval the checklist cites and needs a pre-release VSIX that CI does not build. |
| F9 | A | medium | yes | The details pane's contrast has never been measured: `theme.ui.test.ts:164-167` lets its incomplete colour-contrast nodes pass in every theme. The measurement harness inherits a blind spot unless the redesign removes the tolerance. |
| F10 | H | low | yes | No named state renders a two-folder workspace; the multi-root All Projects layout has never been seen. The P0 fixture workspace should include one. |
| F11 | X | low | yes | DP10's verdict hangs on the sidebar row design: if sidebar rows gain an icon or a vulnerability mark, the metadata ask is needed; if not, it is waste. Sequence DP10 after that decision. |
| F12 | H | low | no | The computed task text of this sweep (not the owner's prompt file) describes the captures as a "VS Code 1.105-era build"; the UI job log of the capture commit shows VS Code 1.140.0 and ChromeDriver 150.0.7871.124. |
| F13 | H | low | no | Stale ledger state: S4, N14 and N7 still say "closes at P8.2 when the 1.x copies go" though P8.2b deleted the 1.x tree (`ls src/services` → no such directory); N5 still says "release workflow open until P8.3" though P8.3 is done with manual publishing; N19, N81 and N84 cite moved or deleted lines. |
| F14 | H | low | no | N87 is closed; the brief's "N87/DP10" pairing comes from N87's section-4 text naming DP10. DP10 is the candidate. |
| F15 | H | low | no | The critic's remedy "add UI and E2E to the required checks" is done: ruleset 12524593 requires Lint, Build & Package, both Test jobs, E2E (1.85.0), E2E (stable) and UI. |
| F16 | X | low | no | MB17 is rare on nuget.org: 1 of 6553 unique search results carries an HTML entity in its description (search API only). |
| F17 | X | low | no | Any restoration of a "Not back" item (Collapse all, hover prefetch, ArrowLeft/ArrowRight, recent searches) must edit `CHANGELOG.md:92`, which the owner's ruling allows until publication. |

### F1. DP3 blast radius

Evidence: `src/core/feeds/icons.ts:27`, `:183-199`, `:218-222`; `grep -rln packageIconSrc src/webview --include='*.tsx'`
outside tests → `InstalledProjectSection.tsx`, `TransitiveSection.tsx`, `BrowseList.tsx`, `AllProjectsUpdates.tsx`,
`UpdatesTab.tsx`; the downgrade rested on "Browse-only today since no other list renders icons"
(`parity-audit-2026-10-16.md:1524`). Proposal: an address-neutral breaker (stop suppressing a source that has served
an icon in the session, or bound the suppression in time), core only, in the last phase. Confidence: high on the
mechanism, low on frequency (not reproduced).

### F2. ExTester cannot render the floor

Evidence: `node_modules/vscode-extension-tester/package.json:59-61` (`"vscode-min": "1.138.0"`, `"vscode-max":
"1.140.0"`); `package.json:310` (`--code_version max`); `scratchpad/research/ui-job.log:223` ("Downloading VS Code:
1.140.0 / stable"), `:231` ("Downloading ChromeDriver 150.0.7871.124"); `findings-ledger.md:434` (the E2E job at
1.85.0 "cannot see whether the webview rendered"). Proposal: decide N64 with the floor ADR: a pinned-Chromium render
of the webview bundles under a fake host in P0, or the lint alone. Which Chromium builds can be pinned was not
verified.

### F3. Workbench exemplars for the search box

Evidence (copies in `scratchpad/research/triage-src/`, fetched from `raw.githubusercontent.com/microsoft/vscode/main`
on 2026-10-22, `main` = `54d565d227f05c6b4dd9e109811128394125a753` by `gh api repos/microsoft/vscode/commits/main`):
`suggestEnabledInput.ts:213` (Ctrl/Cmd+DownArrow fires `onShouldFocusResults`); `extensionsViewlet.ts:664` (the view
focuses its list on it), `:714-726` (navigable container), `:731-733` (`focus()` focuses the search box), `:639-647`
(`SuggestEnabledInput` with `'@'` triggers, no history); `searchWidget.ts:37`, `:58` (the Search view has search
history). Caveat: today's `main`, not the floor version.

### F4. Colour roles

Evidence: `scratchpad/research/triage-src/theme-color.md:129-137` (button keys; no danger key), `:611-613`
(`problemsErrorIcon.foreground`, `problemsWarningIcon.foreground`, `problemsInfoIcon.foreground`), fetched from
`https://raw.githubusercontent.com/microsoft/vscode-docs/main/api/references/theme-color.md`.

### F5. One header decision

Evidence: V3 (`findings-ledger.md:190`); `main-installed-all.png` (badge on the list border, judge-only);
`InstalledProjectSection.tsx:178` (count while expanded); `src/webview/sidebar/InstalledSection.tsx:135-136` (no
badge under All Projects); `interaction-model.md:67`.

### F7. Candidates outside the named sources

Evidence: `STATUS.md:1016`, `:1069`, `:1071`, `:1072`, `:1165`, `:1167`, `:1168`, `:1243-1251`, `:4426`, `:4430`,
`:4534`; `parity-audit-2026-10-16.md:109-110`; `release-checklist.md:1-28`. Proposal: one ledger row per backlog
candidate (rows 38–47 of section 3), with the source line.

### F8. Release mechanics

Evidence: `release-checklist.md:1` ("Release checklist — nUIget 2.0.0"), `:28` (approved screenshots of run
39025149785), `:62-66` (vsce refuses `--pre-release` for a VSIX not packaged as one), `:88` ("The regular release must
then be 2.0.1 or later"); `STATUS.md:4534`; brief `:46-47` (ships as the 2.0.0 pre-release). Proposal: a last-phase
item that refreshes the checklist for the overhaul and an owner-applied `ci.yml` patch for a pre-release artifact (or
the documented local route A).

### F9 to F17

Evidence is in the rows they refer to (sections 4.2 to 4.4). F13: `findings-ledger.md:41`, `:109`, `:111`, `:118`,
`:123`, `:179`, `:182`. F15: `gh api repos/gasrulle/nuiget/rulesets/12524593` → `required_status_checks` with
`Lint`, `Build & Package`, `Test (ubuntu-latest)`, `Test (windows-latest)`, `E2E (1.85.0)`, `E2E (stable)`, `UI`.

## 6. Sequencing notes for the plan

1. V1–V5 must be reported by the P0 harness on the unchanged tree before any item fixes them (negative control).
2. The header decision (F5: V3, SB10, MI12 residue, `interaction-model.md:67`) comes before the Installed, Updates and
   sidebar header items.
3. The toolbar item carries V1, V2, MI10 and MU8 together (F6) and RESTORE-HEADER's choice for the header.
4. The sidebar row-content decision comes before DP10 (F11).
5. Polish-tagged rows with a correctness or accessibility basis (N82, SB2, SB7, SB10, MB19, DETAILS-CONTRAST) ride in
   their screen's polish item and are not cut with a feature phase.
6. The last phase holds DP3 and RELEASE-MECHANICS; ADR-008-AMEND folds into the first commit that opens `docs/adr`.
7. N64 and MB3 wait for the owner, N64 together with the floor ADR.

## 7. Not reachable and gaps

Not reachable:

- The owner's screenshots on the SanDisk USB volume (not mounted; the brief says not to search for it).
- The owner's second-machine screenshots and Webview Developer Tools console named by the critic
  (`parity-audit-2026-10-16.md:1507`).
- Marketplace reviews and Q&A (the user-signal dimension's).

Gaps:

- Only 2 of the 15 capture PNGs were opened (`main-installed-all.png`, `sidebar-sections.png`); the other candidates
  were triaged from code and documents.
- Registration-endpoint descriptions were not probed for MB17; the probe covers the search API's top results only.
- The workbench's zero-count behaviour in a pane header (SB13) and ArrowLeft/ArrowRight in a workbench list (MB18)
  were not verified.
- The N19 claim about the `targets` key of .NET Standard frameworks was not re-verified (no tracked fixture has one).
- Which Chromium builds can be pinned for a floor render (N64 option A) was not verified.
- Exemplar behaviour was read from today's VS Code `main`, not from VS Code 1.85.
- Costs marked "mine" are estimates without a dry run.
- Frequency of DP3's trigger and of N84's over-budget cold start is unknown (no telemetry).
- Open ledger rows that the `2.0.1` grep does not catch were not triaged: N41 (`owner`, open: the "Bypassed rule
  violations" message, `findings-ledger.md:145`) and N72 (accepted, "P7.6 may reopen", `findings-ledger.md:198`).
  Neither is scheduled for 2.0.1; listed so the planner knows the set is not every open row.

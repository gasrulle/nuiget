# Performance and perceived speed of the nUIget 2.0 webviews

Research dimension: **performance** of the nUIget UX-overhaul sweep, 2026-10-22. Repository `main` at `e4d6e97`,
read-only. Every claim cites `path:line` at that commit, a command and its output, or a fetched URL. A claim marked
**hypothesis** or **estimate** has no direct measurement behind it.

## 0. Summary

The 2.0 webviews are not slow to compute. On every list, though, they show the user an intermediate state that is
wrong, late or unexplained. The six things that matter most:

| # | What the user sees | Evidence | Where the fix lives | Protocol change |
|---|---|---|---|---|
| 1 | During every revalidation of an installed list (after an operation, a file save or a Refresh), the evaluated rows are replaced by the provisional list. SDK-implicit rows vanish and come back, conditional rows flip to "unresolved", the counts drop (`Installed 2` → `Installed 1` → `Installed 2`) and the "provisional" badge flashes | measured (§3.2); tracked fixtures prove that the lists differ | webview (`installed.tsx:59-60`) | no |
| 2 | After an operation ends, its row is idle again, with its Uninstall or Update button back, until the host's next list arrives. That takes at least the `dotnet nuget config paths` walk (411 ms baseline) on Installed, and longer on Updates | measured phase table (§4.1) | webview (a "settling" state in the ops slice), or core ordering | no |
| 3 | The "fast" provisional tier is gated by a `dotnet` process. The first rows of a project cannot appear sooner than about 0.4 s (one `config paths` walk, 317–1576 ms on CI) after `installed/get`, and a multi-target project's evaluation runs its framework passes one after the other | `Catalog.ts:195-209`, `context.ts:41-54`, `evaluator.ts:101-104`, `docs/perf-baseline.md:24-33` | core | no (ADR-009 d.3 wording) |
| 4 | Icons and authors of Installed rows arrive in a single all-or-nothing answer. Each package in it waits for the full vulnerability data set (nuget.org: about 20 MB decoded), which is downloaded on the first ask of every session and again after Refresh. The sidebar asks for this metadata too, but never shows it | `enricher.ts:54-58`, `vulnerability.ts` header, `feedClients.ts:141-149`, measured sidebar requests (§5.3) | core and protocol (split vulnerabilities out); webview (sidebar ask) | yes, for the split |
| 5 | The Installed tab, its transitive section and All Projects Updates are not virtualized in practice (every row is mounted, 20–21 elements per row), and every `found` update chunk, `ops/progress` event and filter keystroke re-renders every mounted row | `main.css:205-220`, measured render counts (§7, §8) | webview | no |
| 6 | A cold search shows a skeleton until every result is enriched: 581–1309 ms on CI, against 2323 ms measured locally at P5.6. A new query blanks the previous results, where the workbench's Extensions view keeps them under a progress bar | CI logs (§6.1), `search.tsx:208-221`, VS Code source (§6.3) | protocol (MB3/P7.2d); webview (keep the old results) | yes, for MB3 |

The measurement harness is also not able to see any of this. The only time-to-first-row instrument
(`firstUsefulRender`) fires on the authoritative answer, not on the first row. No CI job turns on
`nuiget.enablePerformanceLogging` or collects the `[perf]` lines. The search timings are quantized by a 250 ms
WebDriver poll: warm search reads 283/283/285/540 ms. And all end-to-end runs use a two-package fixture (§10).

## 1. Method and sources

- Read: both entries, `StoreProvider`, all store slices, `useResource`, the features of the main panel and the
  sidebar, `Listbox`, `Row`, `Skeleton`, `ProgressBar`, `LiveStatus`, `SectionHeader`, the `Catalog` reads,
  `ProjectContextProvider`, `MsBuildProjectEvaluator`, the enricher, the vulnerability client, `feedClients.ts`,
  `handlers.ts`, `feedback.ts`, `extension.ts`, `esbuild.mjs`, `ci.yml`, `docs/perf-baseline.md`,
  `benchmarks/baseline.json`, `benchmarks/README.md`, ADR-004, ADR-009, ARCHITECTURE.md (2.0 sections),
  `docs/ux/interaction-model.md` §4–§5, `docs/plans/parity-audit-2026-10-16.md` (MB3, MI11, MB13, MU5, MB19), and
  `docs/plans/findings-ledger.md` (N72, N84).
- Ran, all outside the repository (the scratchpad):
  - **Bundle composition.** `node measure.mjs` builds both webview entries with the repository's esbuild settings
    (`esbuild.mjs:66-89`) into the scratchpad with a metafile. Script:
    `/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/perf-build/measure.mjs`.
    It reproduced the P10 sizes exactly (548 943 / 333 252 bytes; `docs/plans/STATUS.md:1225`).
  - **Render counts and phase tables.** Five Vitest files under
    `/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/perf-render/`
    (`shell.render.test.tsx`, `revalidate.render.test.tsx`, `settle.render.test.tsx`, `sidebar.render.test.tsx`,
    `mainstart.render.test.tsx`, run with the scratch `vitest.config.mts` there; results in `result.json`,
    `revalidate.json`, `settle.json`, `sidebar.json` and `main-start.json`). They mount the repository's real
    `StoreProvider`, `MainShell`, `InstalledTab`, `UpdatesTab` and `SidebarView` over `createFakeHost()`, with
    `installFakeLayout()` given a tall viewport so that every row mounts, as it does in VS Code (§7). `Row` is
    wrapped by a counting `vi.mock` that changes nothing else. jsdom with development React: **counts are
    meaningful, milliseconds are only relative.**
  - **CI timings.** `gh run view <id> --log` of runs 39038015310 (`7772aa2`, release), 39040554958 (`f07492a`),
    39042850237 (`e4d6e97`) and 39843006107 (`622352d`, today), grepped for `[P5.6] cold search`, `[P7.2] warm search`
    and the mocha test durations.
  - **VS Code source** for the workbench exemplar: `gh api repos/microsoft/vscode/contents/...` for
    `extensionsViews.ts` and `extensionsViewlet.ts` (current `main`, not 1.85).
- `git status --porcelain --untracked-files=all` in the repository returned 0 lines after the last run.

## 2. First render: what each surface does before its first useful paint

### 2.1 Entries and store

- Both entries acquire the API, create the bus and render `StrictMode > ErrorBoundary > StoreProvider > view`
  synchronously inside `if (rootElement)` (`src/webview/main/index.tsx:18-43`, `src/webview/sidebar/index.tsx:14-40`).
  Nothing is code-split. The whole bundle is parsed and evaluated before React mounts.
- `StoreProvider` nests eleven providers (`StoreProvider.tsx:22-47`). Mounting it sends the start requests.
- **Measured start sequence** (`main-start.json`, `sidebar.json`; fake host, in post order):

| Surface | At mount | After the first `session/get` answer | After the provisional chunk |
|---|---|---|---|
| Main panel | `perf/mark`, `layout/get`, `projects/list`, `session/get`, `config/get` | `sources/list`, `updates/get`, `installed/get` | `transitive/metadata` |
| Sidebar | `perf/mark`, `projects/list`, `session/get`, `config/get` | `updates/get`, `installed/get` | `transitive/metadata` |

  1. Data requests wait for one round trip. `installed/get` is keyed on the **committed** session
     (`installed.tsx:39`, `useResource.ts:65-68`), so nothing project-specific leaves before `session/get` is
     answered. That round trip is cheap: `session/get` answers from memory (`handlers.ts:241`). Embedding the first
     snapshot in the HTML (`renderWebviewHtml` already writes a `data-*` dataset, `services.ts:103-131`) would save
     one postMessage round trip. That is **estimated** at single-digit milliseconds, so it is low value.
  2. On the main panel, `sources/list` is posted **before** `installed/get`, in the same commit. React runs child
     effects first, and `SourcesProvider` sits below `InstalledProvider` (`StoreProvider.tsx:27-32`). This is the
     order that triggers ledger N72 (`findings-ledger.md:198`, "accepted (P7.2a)"): two concurrent
     `dotnet nuget config paths` walks on every panel open, competing for CPU with the walk the first rows wait on
     (§3.1). The effect is **not measured**.
  3. The sidebar asks `transitive/metadata` for its Installed rows (`sidebar.json`: `metadataAskedFor` =
     `Serilog 3.1.1`). No sidebar file reads `metadata`: `grep -rn "metadata" src/webview/sidebar/*.tsx | grep -v test`
     returns nothing. See §5.3.
- What the first paint shows, before any answer: a `Skeleton` of three rows. The Installed tab shows it when
  `committed === undefined` (`InstalledTab.tsx:182-185`); the sidebar shows it when `session === undefined`
  (`InstalledSection.tsx:112-114`). The header controls are disabled until the session arrives
  (`MainShell.tsx:236-251`, "Loading projects…" in the selector).

### 2.2 The perf marks measure the wrong moment

- `webviewReady` is sent in the first effect (`MainShell.tsx:104-116`, `SidebarView.tsx:76-81`).
- `firstUsefulRender` is sent when `installedSlice.status === 'ready' && result !== undefined`
  (`MainShell.tsx:130-136`, `SidebarView.tsx:83-89`). `status` stays `loading` while the provisional chunk is on
  screen (`useResource.ts:39`, `installed.tsx:59-60`). So the mark records the **authoritative** answer, roughly one
  evaluation (about 450 ms, `perf-baseline.md:33`) after the user already sees rows.
- The host logs the marks at `info` only when `nuiget.enablePerformanceLogging` is on (`handlers.ts:425-433`).
  Nothing in CI turns it on. `grep -rn "enablePerformanceLogging\|webviewReady\|firstUsefulRender" src/test .github/workflows/ci.yml scripts`
  returns only the config-shape lint (`src/test/lint/extension-config-settings.test.ts:20`), and the e2e workspace
  has no `.vscode/settings.json` (`ls src/test/e2e/fixtures/e2e-workspace/` → `TestProject.csproj nuget.config obj`).
  **Finding H1.**

### 2.3 Estimated cold timeline of opening the main panel

This is an **estimate** built from component timings, never measured end to end. The components are
`docs/perf-baseline.md:23-33` (CI, ubuntu-24.04).

| Step | Time | Source |
|---|---|---|
| Parse and evaluate `webview.js` (548 943 bytes), mount | not measured | §9 |
| `session/get`, `projects/list` | a few ms (memory; the project list was computed at activation, `extension.ts:179-208`, `:379`) | code |
| `installed/get` → provisional chunk | max(SDK probe, cached and persisted: `DotnetRunner.ts:305-317`, `extension.ts:77`; `dotnet nuget config paths` 411 ms (317–1576 ms observed, `perf-baseline.md:61,92`); source listing, cached at activation: `extension.ts:166`, `DotnetSourceProvider.ts:55-69`) + revision hash | `Catalog.ts:195-209`, `context.ts:41-54` |
| → authoritative answer (single target) | + one combined `msbuild` run, 448 ms (269–481 ms) | `evaluator.ts:93-100`, `perf-baseline.md:33` |
| → authoritative answer (two targets) | + combined run, then one item run per framework, **sequentially**: 448 + 454 + 453 ≈ 1.35 s | `evaluator.ts:101-104`, `perf-baseline.md:28-30` |
| Icons and authors of the rows | one `transitive/metadata` answer for all rows: enrich at concurrency 8, each row awaiting lookup, icon **and** vulnerability data | `installed.tsx:62-87`, `enricher.ts:23,47-58`; not measured |
| Transitive count | 500 ms after the authoritative answer: `transitive/get`, then `transitive/metadata` for every transitive package | `transitive.tsx:38,57-65,80-100` |

## 3. Refresh latency and the provisional state

### 3.1 The provisional tier waits for `dotnet` (finding X-3)

- ADR-004 calls the first tier "**Inspect** (`ProjectInspector`, fast)" (`docs/adr/004-project-model.md:17-21`),
  and the static inspection bench is 0.23–0.28 ms (`benchmarks/baseline.json`, `project.bench.ts`, "single-framework
  project" 0.2313 ms mean).
- `computeInstalled`, however, emits the provisional chunk only after
  `Promise.all([inspection, walk])` (`Catalog.ts:195-209`). The walk is `ProjectContextProvider.get`, which runs
  the SDK probe, `dotnet nuget config paths` and the source listing in parallel, then hashes the revision inputs
  (`context.ts:41-54`). `configFilesFor` spawns `dotnet nuget config paths` **every time** (`context.ts:77-89`);
  only the SDK probe (`DotnetRunner.ts:305-317`) and the source listing (`DotnetSourceProvider.ts:55-69`) are
  cached. The walk is needed for one fact in the provisional result: `unsupported: sdk-too-old` (`Catalog.ts:204`).
- The consequence is the floor on first rows after `installed/get`, and it applies to **every** recomputation
  (each invalidation of `installed:<path>`): about one `config paths` run, 411 ms baseline, with 317, 531, 369, 365,
  413, 523, 1576, 540, 564, 457 and 383 ms in the eleven perf runs (`perf-baseline.md:61,92`).
- A multi-target project evaluates its frameworks one after another
  (`for (const framework of frameworks) { … await this.json(…) }`, `evaluator.ts:101-104`). The provisional badge
  therefore stays about 1.35 s on a two-target project (§2.3). Whether parallel `msbuild` runs would be faster on
  the runners is a **hypothesis**.
- What core could do, with no change to the protocol types:
  - (a) Emit the inspection result as the provisional chunk before the walk, and let the authoritative answer
    carry `unsupported`. This changes ADR-009 d.3's description, a frozen document (D6).
  - (b) Cache the config chain per directory until a `nuget.config` watcher event or a `sources`/`workspace`
    invalidation. N72 notes the risk of handing a revision a stale chain (`findings-ledger.md:198`).
  - (c) Run the per-framework item runs in parallel.

  All three are core work and therefore **decision-relevant**.

### 3.2 Revalidation replaces evaluated rows with provisional ones (finding X-1, measured)

- `installed.tsx:59-60`: `shown = provisional !== undefined && provisional.projectPath === projectPath && unanswered ? provisional.result : resource.data`,
  where `unanswered = resource.status === 'loading' || resource.revalidating`. During a revalidation of data that
  is already authoritative, the provisional chunk of the new request **replaces** the authoritative list. The
  sidebar shares the slice. ARCHITECTURE describes this as intended ("While the request is unanswered, the
  `provisional` chunk of that request is shown as `result`", ARCHITECTURE.md:440-442). It contradicts the state
  vocabulary: "Revalidating | Existing rows stay … Never blank the list" (`docs/ux/interaction-model.md:66`).
- **Measured** (`revalidate.json`). The authoritative list is `Serilog` plus the SDK-implicit `NETStandard.Library`;
  the provisional list is `Serilog` only. The phases:

| Phase | Rows | `Direct packages` header | Installed tab | "provisional" badges | Progress bars |
|---|---|---|---|---|---|
| First load, provisional chunk | serilog | `(1)` | `Installed` (no count) | 1 | 0 |
| Authoritative answer | serilog, netstandard.library | `(2)` | `Installed 2` | 0 | 0 |
| Invalidated, before the chunk | serilog, netstandard.library | `(2)` | `Installed 2` | 0 | 1 |
| **Provisional chunk of the revalidation** | **serilog** | **`(1)`** | **`Installed 1`** | **1** | 1 |
| Answer | serilog, netstandard.library | `(2)` | `Installed 2` | 0 | 0 |

- **Do the two lists differ for real projects? Yes, on tracked fixtures.**
  - The inspector reads the multi-target fixture as 4 packages, without `NETStandard.Library`
    (`src/core/project/inspector.test.ts:118-128`).
  - The evaluator reads the same fixture with `NETStandard.Library` as implicit, netstandard2.0 only
    (`src/core/project/evaluator.test.ts:175-190`).
  - The inspector marks `$(Prop)` versions and `$(Configuration)`-guarded references as `unresolved`
    (`inspector.test.ts:95,105`), which the evaluation resolves.

  So for any library that targets netstandard2.0, or any project with property-driven versions, rows disappear,
  reappear or flip to "unresolved" (disabled) and back on every save, operation and Refresh.
- Fix, webview only: apply a provisional chunk only while the key has no data (`resource.data === undefined`).
  During a revalidation, keep the shown rows and show the progress bar. An optional refinement takes from the
  provisional list only the **removal** of rows the project file no longer declares, so that an uninstall still
  leaves sooner (§4.1). This is about 0.5 d with tests, and it rewrites one ARCHITECTURE sentence.
  **Decision-relevant**, because it changes how fidelity is presented.

### 3.3 First-load cues in the main panel (finding X-12)

- While the first list is provisional, the main panel shows rows, the info-toned "provisional" badge and nothing
  else:
  - no progress bar (`MainShell.tsx:226-227` shows it only for `revalidating`, which is false without data,
    `useResource.ts:128`);
  - no busy header (`InstalledProjectSection.tsx:191`, `busy={revalidating}`);
  - no tab count (`MainShell.tsx:184`, `status === 'ready'`; measured `Installed` with no count, §3.2).
- The sidebar shows a header spinner (`InstalledSection.tsx:134`) and announces "Loading installed packages"
  (`SidebarView.tsx:135-140`) while the rows are already visible.
- The workbench has one cue for "this view is working": a view progress bar (§4.3). nUIget mixes a section-header
  spinner (`SectionHeader.tsx:52`), a progress bar (`MainShell.tsx:279`, `SidebarView.tsx:165`), the provisional
  badge, row spinners and the Refresh icon.

### 3.4 All Projects: metadata only after evaluation (finding X-13)

- In All Projects the metadata of a project is emitted after `await upgrade` (`Catalog.ts:321-328`). In single
  project mode it is asked for the provisional rows at once (`installed.tsx:62-87`).
- The capture `main-installed-all.png` shows this: the provisional `Utility.csproj` row has the default icon and no
  authors, while `TestProject.csproj`'s Newtonsoft.Json row has both. This rests on a PNG; the code path is cited
  above.

## 4. Perceived blocking: operations

### 4.1 The row goes idle before the list catches up (finding X-2, measured)

- The host's order, from `settleOperation` (`handlers.ts:157-162`): `announceOperation` (the `ops/completed` event),
  then `invalidateAfter` (`resources/invalidated`), then the response. The ops slice drops the operation on
  `ops/completed` (`ops.tsx:102-112`). The list keeps the row until the recomputation's provisional chunk, by design
  ("nothing is removed by guessing", ARCHITECTURE.md:559-560; gotcha "Removing a row when an operation succeeds").
- **Measured** (`settle.json`, uninstall of Serilog from another surface):

| Phase | Serilog row |
|---|---|
| 0 before | listed; not busy; Uninstall button present |
| 1 `ops/progress` running | listed; `aria-busy=true`; spinner; no button |
| 2 `ops/completed` | **listed; not busy; Uninstall button back** |
| 3 `resources/invalidated`, host recomputing (≥ one `config paths` walk, §3.1) | **listed; not busy; Uninstall button back** |
| 4 provisional chunk | gone |
| 5 answer | gone |

- For an **update on the Updates tab** the gap is longer. `updates/get` recomputes `installed` (walk plus
  evaluation), then checks every package against the feeds, then enriches (`Catalog.ts:241-275`). During that time
  the updated row shows `old → new` with its Update button enabled again. The duration is **not measured**: no CI
  test times it, and the UI test "Enter updates one package and the project file follows" takes 3264 ms in run
  39843006107, including WebDriver steps.
- The interaction model asks for "Pending op … until the terminal outcome" and "row returns to its real state after
  invalidation" (`interaction-model.md:70-71`). The gap between the two is unspecified.
- Fix, webview only and not optimistic: keep the operation's (project, package) pairs in a **settling** set from
  `ops/completed` until the next answer for the affected `installed:`/`updates:` key arrives. The slice already
  knows those keys and generations (`bus.listedGeneration`, `useResource.ts:84`). Settling rows keep the spinner,
  with the status "Finishing". A failed outcome clears settling at once, as the model's "never leave optimistic
  state" requires. About 1 d. Alternative, in core: invalidate and recompute before announcing. That delays the
  toast and is not recommended.

### 4.2 Queued and running look the same; the status bar is generic (finding X-11)

- `run()` records the operation as `queued` (`ops.tsx:209`). The row shows the same spinner and the same word
  (`IN_PROGRESS[kind]`: "Uninstalling", `rules.ts:10`; `InstalledProjectSection.tsx:78-86,139`) while it waits
  behind another operation (the queue allows 1 running and 5 waiting, `extension.ts:89`).
- The status bar item says `$(sync~spin) nUIget: operation running` or `N running, M queued`
  (`extension.ts:274-284`): no package, no project.
- A single operation opens no notification (`feedback.ts:1-6,107-110`). The user sees a row spinner, a generic
  status bar item and, after about 2–4 s, a toast. Operation UI tests in run 39843006107 took 2370–3934 ms
  click-to-file-changed, including WebDriver steps.

### 4.3 Native progress locations (part of X-11)

- `ProgressOptions.location` accepts `{ viewId: string }` in the pinned API: `node_modules/@types/vscode` 1.85.0,
  `index.d.ts:12274-12279`. `ProgressLocation.Window` renders `$(icon)` text in the status bar
  (`index.d.ts:12253-12257`).
- The workbench's Extensions view wraps each query in `progressService.withProgress({ location: ProgressLocation.Extensions }, …)`
  (`extensionsViewlet.ts:993-994` in current VS Code `main`, fetched with `gh api`).
- So the sidebar could show its long work (first load, Refresh, an operation) as the view's own progress bar
  (`withProgress({ location: { viewId: 'nuiget…' } })`), and a single operation could use
  `ProgressLocation.Window` with "Uninstalling Serilog from App". Host-only work in `src/host/feedback.ts` (the
  gotcha "An outcome toast outside `src/host/feedback.ts`" puts every progress UI there).
- **Not verified:** that a `{ viewId }` progress renders on a *webview* view. The main panel is an editor webview
  and has no view id, so it keeps drawing its own bar.

## 5. Icons and lite metadata

### 5.1 Pipeline

- Host:
  - Icons are fetched by the host and sent as `data:` URIs. The CSP allows `img-src ${cspSource} data:` only
    (`services.ts:111-118`, ADR-006).
  - `MAX_ICON_BYTES` is 256 KB (`icons.ts:29`). That is up to about 341 KB per URI after base64, displayed at
    `--nuiget-icon-size-xl` (`primitives.css:250-265`), with no downscaling. Message sizes and decode cost are
    **not measured**.
  - Found icons are persisted (kept). Misses are kept 24 h, lite lookups 5 min. Vulnerability data stays in memory
    for 1 h, only when complete (ARCHITECTURE.md:197-201).
- Webview:
  - A row shows the bundled default icon until the metadata answer arrives. `packageIconSrc` returns the root's
    `data-package-icon` (`packageIcon.ts:10-21`; `services.ts:108-110`), so the icon swaps in place: the 32 px
    column is fixed (`primitives.css:250-256`), no layout shift.
  - Authors and the Verified mark fill the third line later. The comfortable row has a fixed minimum height
    (`primitives.css:86-88`), so this is also free of layout shift.

### 5.2 All or nothing, gated by the vulnerability download (finding X-4)

- `transitive/metadata` has no chunk type (`messages.ts:126`). The host answers once, after
  `enricher.enrich` (`Catalog.ts:285-289`).
- Per package, the enricher awaits `Promise.all([lookup, icon, vulnerabilities.forPackage])` (`enricher.ts:54-58`),
  at concurrency 8 (`enricher.ts:23`). `forPackage` awaits the **whole** data set of every source that has one
  (`vulnerability.ts:107-123`). nuget.org's decoded base page is "around 20 MB" (`vulnerability.ts`, the comment
  on `MAX_VULNERABILITY_BYTES`). The data set is shared in flight (`vulnerability.ts:131-146`) and kept in memory
  only.
- So **on the first `transitive/metadata` of every VS Code session no Installed row gets its icon or authors until
  that download finishes**, even when every icon is in the persisted cache. Search and updates do not wait: they
  use `searchEnricher` with `NO_VULNERABILITY_DATA` (`feedClients.ts:141-142`). The download time is **not
  measured**.
- A Refresh (`refresh/all` → `workspace` scope, `handlers.ts:408-411`) calls `feeds.reset()`, which runs
  `vulnerabilities.clear()` (`Catalog.ts:555-560`, `feedClients.ts:145-149`). The next enrichment downloads again.
  ADR-009 §6 lists what that invalidation clears, and vulnerability data is not on the list
  (`docs/adr/009-catalog.md:16`). ARCHITECTURE's wider "resets every shared feed client" (ARCHITECTURE.md:202)
  does cover it. Whether the re-download is intended is an owner question.
- Options:
  - (a) A separate `vulnerabilities/get`, or a `metadata` chunk followed by vulnerabilities. This is a protocol
    change (D6).
  - (b) Webview-only: split the ask into the rows in view first, then the rest. Icons then arrive in batches, but
    each batch still waits for the vulnerability data, so (b) helps only after the first download.
  - (c) Core-only: persist a compact advisory map of the installed ids, within the 8 MB budget. Its size is **not
    measured**.

  **Decision-relevant.**

### 5.3 Metadata nobody reads (finding X-14)

- The sidebar asks `transitive/metadata` for its Installed rows (measured, `sidebar.json`) and reads none of it
  (§2.1). Every sidebar start, and every row change, enriches all installed packages on the host, including the
  vulnerability download of §5.2.
- With both surfaces open the main panel asks again. `transitive/metadata` is no coordinator resource (ADR-009 d.1,
  `009-catalog.md:11`), so the two asks are not deduplicated. Lookups and icons are cached; the vulnerability
  download is shared in flight.
- The transitive prefetch asks metadata for **every** transitive package 500 ms after the installed answer, with
  the section collapsed (`transitive.tsx:57-65,80-100`). It competes on the feeds with the direct rows' metadata
  and the `updates/get` enrichment.
- Fix, webview only: a `metadata` flag on `InstalledProvider` (off in the sidebar, like `prefetch={false}`), and
  ask transitive metadata on expand while keeping the count prefetch. About 0.5 d.

### 5.4 Updates rows: bare, then re-sorted, then enriched (finding X-10)

- `found` chunks arrive bare (`updates.tsx:53-60`). Each chunk re-sorts the list by id (`UpdatesTab.tsx:88`,
  `ProjectUpdates.tsx:45`, `UpdatesSection.tsx:49`). A later package with an earlier id inserts above the others,
  so rows move under the pointer while the user may be aiming at an Update button. Icons and authors appear only
  with the answer (`Catalog.ts:254-271`).
- Option: append in arrival order and sort once at the answer, or keep the skeleton for the first N ms. Webview
  only.

## 6. The search typing path

### 6.1 Timings on record

| Run | Commit | Cold: Enter to first row | Warm |
|---|---|---|---|
| 38818381022 (baseline) | `758241c` | 1086 ms | 541 ms |
| 39038015310 | `7772aa2` | 797 ms | 283 ms |
| 39040554958 | `f07492a` | 1309 ms | 540 ms |
| 39042850237 | `e4d6e97` | 1056 ms | 285 ms |
| 39843006107 | `622352d` | 581 ms | 283 ms |

- Targets are 1700 ms cold and 900 ms warm (`perf-baseline.md:34-35,48`). The P7.2d trigger (two consecutive cold
  runs over target) has not fired. A local run measured 2323 ms cold at P5.6
  (`parity-audit-2026-10-16.md:537`, citing `STATUS.md:77`).
- The warm numbers are quantized. `findByTestId` polls every 250 ms (`src/test/ui/v2/sidebarWebview.ts:10,54-71`),
  and 283/285/540 ms are one or two poll intervals plus a WebDriver round trip. **The instrument cannot resolve
  anything under about 280 ms (finding H2).**

### 6.2 Mechanics

- Debounce. Main panel: `quicksearch` asks suggestions 150 ms after the last key, from 2 characters, while focused;
  `full` searches after 300 ms; `off` does nothing until Enter (`useSearchTyping.ts:11-13,76-98`). The default is
  `quicksearch` (`package.json:264`). The sidebar always searches 300 ms after the last key
  (`SidebarView.tsx:50-51,123-133`).
- The previous request is cancelled (`search.tsx:122-154`, `controller.abort()`).
- **The `metadata` chunk is wasted.** The host emits it after enrichment, right before the answer
  (`Catalog.ts:443-448`). The slice collects it and applies it only with the answer (`search.tsx:127-142`). Rows
  therefore appear only after every result is enriched. This is MB3, "open — needs a protocol change"
  (`parity-audit-2026-10-16.md:44,521-545`). The design there (a `found`/results chunk before `enrich`, or a
  `search/metadata` request) stands, and this report does not repeat it. **Decision-relevant (finding X-8).**
- `package/prewarm` has no caller (`handlers.ts:321-324`; ledger N84, `findings-ledger.md:182,454`; parity MB13).
  Its value for search is limited: the start-up `updates/get` already resolves the service index of every enabled
  source of the project (`Catalog.ts:248-253`). It would matter for the credential warm-up (N84) and for sources
  the project does not use. Low (finding X-9). Hover prefetch of details (MI11) is also still open
  (`parity-audit-2026-10-16.md:29,254-262`).

### 6.3 A new query blanks the results; the workbench keeps them (finding X-7)

- A new text makes `shown` undefined (`search.tsx:208`, `answered.query !== asked.query`) → `status: 'loading'` →
  `BrowseList` returns a three-row `Skeleton` in place of the list (`BrowseList.tsx:92-94`). The previous results
  disappear for the length of the search (0.3–1.3 s on CI, §6.1). Only the *same* text asked again keeps them under
  a bar (`search.tsx:224`, `BrowseList.tsx:100`).
- Workbench exemplar (current VS Code `main`, fetched): `ExtensionsListView.show()` cancels the previous request and
  calls `setModel` only when the new query resolves (`extensionsViews.ts:223-282`). Meanwhile the old list stays,
  and the viewlet shows the view-container progress bar (`extensionsViewlet.ts:931,993-994`). Not checked against
  1.85.
- Fix, webview only: keep the last answered results visible and marked busy (progress bar, `aria-busy`) while a
  new text loads, and keep the skeleton for the very first search only. About 0.5 d. This conflicts with nothing in
  §4 ("Loading (first) … Only when there is no previous data for the key"). The key is the text, so the owner
  should decide whether "previous data" may be another text's.

## 7. Virtualization

- `Listbox` always uses `@tanstack/react-virtual` with `overscan` 5 (`Listbox.tsx:58,90-98`), measures each row
  with `getBoundingClientRect()` (`Listbox.tsx:96`), and keeps the active row mounted (`Listbox.tsx:82-88`).
- **In the Installed tab, its transitive lists and All Projects Updates, the list is not its own scroll element:**
  `.nuiget-installed--sections .nuiget-listbox { flex: none; overflow: visible }` and the same for
  `.nuiget-transitive .nuiget-listbox` (`main.css:205-233`). The CSS comment states the consequence: "the
  virtualizer renders all of its rows, as the 1.x panel did" (`main.css:206-209`, P9.fix-2).
- The single-project Updates tab, Browse and the sidebar lists still scroll on their own (`primitives.css:55-59`),
  so they virtualize.
- **Measured DOM weight** (`result.json`): 15 elements per comfortable row before metadata, 20 after authors and
  Verified, plus 1 `<img>` in the product (the jsdom run has no `data-package-icon`). A project with 60 direct and
  240 expanded transitive packages mounts about 6000 elements in the Installed tab (**estimate**: 300 × 20).
- The bench does not cover this mode. `Listbox.bench.ts:20-34` mounts 1000 **compact** rows in a 480 px viewport,
  the scrolling mode, with baseline means of 1.27 ms (mount) and 2.74 ms (End) in `benchmarks/baseline.json`
  (finding H4).
- Fix options (webview, finding X-5):
  - (a) Virtualize against the outer scroller (`.nuiget-installed-lists`) with a per-section `scrollMargin`. The
    keyboard and `scrollIntoView` logic of N88 must follow (`Listbox.tsx:127-133`). About 1.5–2 d.
  - (b) Keep full rendering but memoize rows (§8). That fixes re-render cost, not mount cost.

## 8. Re-render hot spots (finding X-6, measured counts)

- `React.memo` appears only on the icons (`icons.tsx:27-184`). `grep -rnE "React\.memo|[^a-zA-Z]memo\(|useDeferredValue|useTransition|startTransition" src/webview`
  finds nothing else. `Row` builds a new `badges` fragment on every render (`InstalledProjectSection.tsx:140-148`),
  so even a memoized `Row` would re-render.
- `MainShell` subscribes to `useSession`, `useProjects`, `useUpdates`, `useInstalled`, `useOps`, `useAllProjects`,
  `useSearch` and `useMessageBus` (`MainShell.tsx:85-90,140,162,174`). It reads updates and all-projects state
  **for the tab counts** (`MainShell.tsx:175-196`) and creates `view` and the feature element on every render
  (`MainShell.tsx:197,286`). Its children re-render on any of those changes.
- **Measured** (`result.json`, 60 installed rows mounted):

| Event | `Row` renders | Note |
|---|---:|---|
| First (provisional) list | 60 | |
| Authoritative answer | 60 | |
| One `transitive/metadata` answer | 60 | expected |
| 20 `found` update chunks, Updates tab **not shown** | **1200** | 60 rows × 20 chunks; 22 shell commits |
| 10 `ops/progress` events for one package | **600** | 60 per event, though one row changed |
| 21 keystrokes of `@installed package.05` | 780 and 1280 (two runs) | the filter itself legitimately changes rows |

- jsdom shell time was 110–114 ms per `found` chunk (development React, relative only). Production Chromium is far
  faster; whether this costs a frame at 300 rows is a **hypothesis** to measure (H4).
- Fix, webview only and about 1–1.5 d, measured first as `.github/instructions/performance-optimization.instructions.md`
  asks:
  1. Move the tab counts into a small `TabCounts` component, or a selector, so the shell does not subscribe to
     `updates` and `allProjects`.
  2. Memoize the feature elements.
  3. Give `Row` a `React.memo` with primitive props (a badge list instead of a fragment).
  4. Pass `isBusy` per row.

## 9. Bundle sizes

- Ceilings are `322 502 / 577 766 / 351 245` bytes (`esbuild.mjs:24`). The last measured sizes are
  `297 018 / 548 943 / 333 252` (`docs/plans/STATUS.md:1141,1225`), reproduced exactly by the scratch build.
  Headroom: webview 28 823 bytes (5.0 %), sidebar 17 993 bytes (5.1 %).
- **Composition** (`measure.mjs`, minified bytes in output):

| Input | `webview.js` | % | `sidebar.js` | % |
|---|---:|---:|---:|---:|
| react-dom | 209 855 | 38.2 | 209 543 | 62.9 |
| highlight.js (15 languages, `markdown.ts:13-28`) | 78 516 | 14.3 | — | — |
| `src/webview/main` | 76 533 | 13.9 | — | — |
| `src/webview/shared` | 62 337 | 11.4 | 57 392 | 17.2 |
| marked | 45 965 | 8.4 | — | — |
| dompurify | 30 089 | 5.5 | — | — |
| @tanstack/virtual-core + react-virtual | 26 883 | 4.9 | 26 882 | 8.1 |
| react + scheduler | 12 192 | 2.2 | 12 146 | 3.6 |
| CSS (`webview.css`, `sidebar.css`) | 36 949 | | 26 825 | |

- The README stack (highlight.js, marked, dompurify, marked-highlight) is **155 935 bytes, 28.4 % of
  `webview.js`**. The renderer is built lazily (`markdown.ts:45-69`), but the code is parsed at load. Splitting it
  out needs ESM output with `splitting` and a second script that the CSP admits; the CSP is
  `script-src 'nonce-…'` (`services.ts:116`, ADR-006, frozen). **Decision-relevant**; the parse-time gain is a
  **hypothesis** (no Chromium measurement).
- The 5 % headroom is the practical limit for a UX overhaul. Each new primitive or feature has to fit, or the
  ceiling is re-measured under the ratchet rule (`esbuild.mjs:19-23`; gotcha "Bundle ceilings are checked in CI").

## 10. Measurement and harness proposals (letter H)

| Id | Proposal | Product change | Protocol change |
|---|---|---|---|
| H1 | In the e2e and UI workspaces, set `nuiget.enablePerformanceLogging: true` (a fixture `.vscode/settings.json`) and print the `[perf]` lines into the job summary. Move `firstUsefulRender` to the **first shown list** (provisional included) or add a mark for it. | settings only; moving the mark is webview | a new mark name is a protocol change (`messages.ts:180`, the `name` union) |
| H2 | Time in the page, not by polling. Before Enter, install a `MutationObserver` that records `performance.now()` when `[data-testid^="package-row-"]` appears (`driver.executeScript` inside the webview frame), then read it back. This removes the 250 ms quantum (§6.1). | test only | no |
| H3 | Add UI-job timings for: panel open → first row (provisional) → authoritative → icons present (`img[src^="data:"]` not the default); select → details visible; click Uninstall → row gone; quick-search keystroke → suggestions; updates first `found` row → answer. Print a table in `$GITHUB_STEP_SUMMARY` beside `[P5.6]`/`[P7.2]`. | test only | no |
| H4 | A large-project perf fixture (60 direct, about 300 transitive, two target frameworks, one netstandard2.0, a `$(Prop)` version). A Vitest bench of the **sections mode** (tall viewport, comfortable rows) and of the render counts of §8 (the scratch test is the template), so that a memoization change is measured. | test only | no |
| H5 | Extend `scripts/perf-baseline.mjs` (dotnet only today, `perf-baseline.md:142-146`) with feed timings: vulnerability data-set download and parse, one `transitive/metadata` for 30 ids cold and warm, and the bytes of the answer (icons). | script only | no |
| H6 | The `Benchmark (informational)` job compares against a committed `benchmarks/baseline.json`, while the README says numbers are "single-machine signal only" (`benchmarks/README.md:13-16`), and the job summary prints only counts (`ci.yml:395-415`). Either re-record the baseline on the runner image or report deltas only within a run. Where the current baseline was recorded is **not verified**. | CI only | no |

## 11. What the UX could do: options per symptom

| Symptom | Skeleton or spinner | Optimistic or settling | Staged rendering | Streaming order | Cost | Needs |
|---|---|---|---|---|---|---|
| First list | keep the 3-row skeleton, then rows at once; one view-level bar instead of badge + spinners | — | inspection rows first (core §3.1) | provisional before the walk | core 1 d | ADR-009 wording |
| Revalidation | progress bar only | keep authoritative rows (§3.2) | — | provisional ignored when data exists | webview 0.5 d | none |
| After an operation | — | "settling" until the next answer (§4.1), never removal | — | — | webview 1 d | none |
| Icons and authors | default icon (as today) | — | rows in view first | metadata without vulnerabilities, then vulnerabilities | 0.5 d webview; 1–2 d core | protocol for the split |
| Updates stream | skeleton until the first row | — | append, sort at the end | bare row, then the icon chunk (All Projects already has `icons`, `messages.ts:130`) | webview 0.5 d | single-project icons chunk = protocol |
| Search | keep old results under a bar (§6.3) | — | rows before enrichment (MB3) | `found` before `metadata` | webview 0.5 d; MB3 1 d | MB3: protocol |
| Re-renders | — | — | memo boundaries (§8) | — | webview 1–1.5 d | none |
| Long lists | — | — | virtualize against the outer scroller (§7) | — | webview 1.5–2 d | none |

## 12. Not reachable, and gaps

Not reachable:
- The VS Code API reference page: WebFetch truncated it at 100 000 of 373 102 characters. The pinned
  `@types/vscode` 1.85.0 d.ts was cited instead.
- Any rendering in Chromium. The browser pane is reserved; VS Code is not installed locally.
- Running ExTester locally: it would package and build into the repository.
- The `[perf]` lines of any CI run: never logged (§2.2).
- The output-channel `$ dotnet … (exit, ms)` lines of CI runs (`extension.ts:120-123`): they are not in the job logs.

Gaps:
- No Chromium wall-clock for parse, mount, re-render or the vulnerability download. All milliseconds in §8 are
  jsdom with development React.
- The sidebar's render counts and All Projects were not measured. All Projects follows the same pattern by code
  reading (`allProjects.tsx:209-217`, a state update per chunk; `MainShell.tsx:174`).
- The 2323 ms local cold search at P5.6, against 581–1309 ms on CI, is unexplained.
- Windows timings (the `config paths` walk, PowerShell DPAPI cold start) are only known through N84.
- `dotnet package add/remove` durations are not in the perf baseline. Click-to-done is bounded only by UI test
  durations.
- Icon payload sizes and the effect of 256 KB icons on the 8 MB persisted budget are not measured.
- Whether a `{ viewId }` progress renders on a webview view is not verified at runtime.

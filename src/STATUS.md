# STATUS — src (the 2.0 composition root)   commit e4eea0f (parent of the P2.10 commit)   2026-10-13T17:45:00Z

Scope of this note: `src/extension.next.ts` and `src/extension.next.test.ts` (and, from P8.2, the deletion of
`src/extension.ts`). Every directory under `src/` has its own note; `.github/STATUS.md` is for items without a
`src/` directory.

git status --porcelain --untracked-files=all: ` M src/extension.next.ts`, `?? src/extension.next.test.ts`,
`?? src/STATUS.md`, ` M src/test/__mocks__/vscode.ts`, ` M docs/plans/STATUS.md`,
` M docs/plans/findings-ledger.md`, ` M CHANGELOG.md`, ` M ARCHITECTURE.md`,
` M .github/copilot-instructions.md` (all belong to the P2.10 commit)

Item: **P2.10 replace the placeholder `src/extension.next.ts` with the composition root** (stop-and-ask: the
row names modules that later items create; no contract change, no sentinel).

The quarry's root (295 lines, untracked there, no note) was copied byte-identical from its working tree before
the consultation so that the advisor could read it. The file that is committed is written from the ruling, not
edited from that copy.

## Verified by running

```text
The gates ran with DOTNET_ROOT set to the SDK directory; npm test also with NUIGET_SDK_TESTS=1 (N48).
baseline npx tsc --noEmit / npm run check-types → exit 0 / exit 0
baseline npx eslint src      → exit 0
baseline npx vitest run      → Test Files 81 passed (81) · Tests 2445 passed | 3 skipped (2448)
copy from the quarry tree    → cmp: identical to the quarry working tree
unmodified copy              → npx tsc --noEmit: 22 errors, all in src/extension.next.ts (the first three:
                               './core/cache' has no 'CachePolicy', './core/feeds' not found, './core/http'
                               has no 'NodeTransport') · npx eslint src/extension.next.ts: 1 error
                               (:263 require('fs'), no-require-imports)
npx tsc --noEmit             → exit 0
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src / npm run lint → exit 0, no output / exit 0
npx vitest run --project backend src/extension.next.test.ts --reporter=verbose
                             → Test Files 1 passed (1) · Tests 24 passed (24); the 15 titles of the ruling
                               are listed, among them `registers exactly the commands package.json
                               contributes`, `a selected-project change reconciles with the new project's
                               sources (C-state-core-5)`, `a failed source listing keeps the selected source`,
                               `resources/invalidated reaches both surfaces with keys`, `the logger handed
                               to the core redacts every message (N45)`   (item gate: test green)
npm test (NUIGET_SDK_TESTS=1) → Test Files 82 passed (82) · Tests 2472 passed (2472)
npx vitest run               → Tests 2469 passed | 3 skipped (2472)
npx vitest run --coverage    → exit 0 · from coverage/lcov.info: all files 9233 of 11620 lines, 79.46 % ·
                               src/extension.next.ts 173 of 187, 92.51 % · src/core/** 2664 of 2704,
                               98.52 % (floor 85 %) · src/host/** 402 of 576, 69.79 % (58.85 % before:
                               MainPanelHost.ts 38/52, SidebarHost.ts 56/126, services.ts 46/48)
npm run bench                → Test Files 17 passed (17) · Tests 104 passed | 1 skipped (105)
node esbuild.mjs --v2        → exit 0 · [development] Build complete · dist/: extension.js, sidebar.js,
                               webview.js and their maps   (item gate: `node esbuild.mjs --v2` builds)
node esbuild.mjs --v2 --production --analyze → exit 0 · dist/extension.js 167041 / 299921 ·
                               dist/webview.js 223600 / 600685 · dist/sidebar.js 223608 / 304097
rm -rf dist; npm run package:vsix → exit 0 · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 529.84 KB)
npm run check:vsix           → check:vsix: OK
npm run docs:protocol:check  → exit 0 · docs/protocol.md is up to date (the protocol is untouched)
negative control             → 37 single mutations of src/extension.next.ts, each run against
                               src/extension.next.test.ts: 37 failed a test. Among them: no refresh on a
                               selected-project change; an empty list after a failed listing; the last good
                               listing unused; refreshes not coalesced; requests during a run dropped; one
                               surface not told about invalidations; stopDirs not refilled; the legacy key
                               not swept; no hydration; the watcher not waiting for the queue, not
                               debouncing, not restarting its debounce; the assets watcher looking in obj/;
                               global.json not clearing the SDK cache; the network cache kept; the logger
                               not redacting messages, arguments or errors; a thirteenth command; a missing
                               command; the first or the outermost folder as the answer of
                               workspaceFolderFor; reconcile skipped. The file was restored and compared
                               (cmp) afterwards.
grep -c "REMOVAL GATE: P4.9" src/extension.next.ts → 3
grep -rn "require(\|__all_projects__\|Thenable\|process.cwd\|hosts\b\|viewPackageDetails\|prewarm\|CredentialProvider\|OutboundPolicy\|NuGetConfigReader\|NodeTransport\|proxyConfigured\|MsBuildProjectEvaluator\|ProjectMutator\|core/feeds" src/extension.next.ts → no output
grep -c "activateWith\|ActivationOverrides\|ActivatedExtension" src/extension.next.ts → 4
grep -n "onDidChangeWorkspaceFolders\|packageJSON" src/test/__mocks__/vscode.ts → :242 and :368, one line each
git diff --name-only -- src/protocol src/core docs/adr src/host → empty
ls .claude/.contract-change  → No such file or directory
npm run test:ui              → SKIPPED: no UI change (the 1.x entry points are what the UI suite builds);
                               the CI job UI runs it
CI                           → see the tracker row of P2.10
```

## Done (tested)

- `activateWith(context, overrides)` (`extension.next.ts:50`) composes, in this order: the output channel and
  `redactingLogger` (`:300`), the only `Logger` handed to the core and to `HostServices` (N45);
  `DefaultDotnetRunner` with `hydrate` under `nuiget.sdkVersionCache.v2` and the sweep of the 1.x key
  `nuiget.sdkVersionCache` (`:58-62`); `TieredCache` over `workspaceState` (`:63`); `DotnetSourceProvider`;
  `AssetsReader`; one `stopDirs` array for `StaticProjectInspector` and `ProjectContextProvider` (`:67`);
  `DefaultQueryCoordinator`; `DefaultSessionStore`; `DefaultOperationQueue`; `Catalog`; `PackageWorkflows`
  over `createWorkflowDeps`; `HostServices` (`:96`, `onOperationProgress` is `queue.onProgress`); `SidebarHost`
  and its view provider. `activate` calls it and returns nothing; it does not wait for the first refresh.
- `refreshProjectsAndSession` (`:136`) with `enabledSourceUrls` (`:119`) and `requestRefresh` (`:154`):
  projects → `projects/changed` → `nuiget.hasProjectFiles` → the enabled sources of `sourceDirectory(services)`
  → `session.reconcile`. It runs at activation (`ready`), after an invalidation of scope `workspace`, `project`
  or `sources` and when the selected project differs from the one last reconciled for (C-state-core-5). Runs
  do not overlap; requests during a run cause one more. A listing that fails yields the last list of that
  directory, or else the selected source alone, never an empty list.
- Invalidation forwarding (`:175`): the coordinator's event goes unchanged to `sidebar.notifyInvalidated` and
  to `MainPanelHost.instance?.notifyInvalidated`; a disposed panel receives nothing.
- Status bar item for the queue (`:193`), with the 1.x texts.
- Six watchers (`:207-249`): project files, `Directory.{Build,Packages}.{props,targets}`, `nuget.config`,
  `global.json` (also clears the SDK cache), `packages.lock.json` and `obj/project.assets.json` (both look the
  project file up with `projectFileIn`, `:343`). Debounced, and they wait for an idle queue; the scopes of one
  flush are computed first, so the coordinator reports them as one event.
- Workspace-folder change (`:251`): `stopDirs` refilled in place, workspace invalidated. Configuration change
  (`:255`): `config/changed` for `nuiget` and `workbench.tree.indent`.
- The 12 contributed commands (`:264-292`), `nuiget.clearHttpCache` and `nuiget.clearSdkVersionCache` as the
  ruling orders. `workspaceFolderFor` (`:328`): the deepest folder that contains the path, `undefined` for a
  path that no folder contains, the first folder without an argument.
- `extension.next.test.ts`, 24 tests: the 15 titles of the ruling and nine more (`nuiget.openManager selects
  the project of …` ×3, `a nuiget setting change is announced to the surfaces, an unrelated one is not`,
  `reports a workspace without projects through nuiget.hasProjectFiles`, `workspaceFolderFor names the deepest
  workspace folder that contains the path`, `the sidebar commands act on the shared session`, `a failed source
  listing after a good one keeps the last known sources`, `watches props, nuget.config, global.json, lock and
  assets files with their scopes`). They run the real root with a fake `spawn`; no process is started.
- `src/test/__mocks__/vscode.ts`: `workspace.onDidChangeWorkspaceFolders` and `extension` in
  `createMockExtensionContext`, the two additive entries of the ruling. The 1.x suites that share the mock
  pass.

## Done (untested)

- `nuiget.sidebar.selectSource` and `nuiget.sidebar.selectProject`: registered (the command-set test), never
  executed by a test; they open quick picks (`pickers.ts`, 11 of 71 lines run). P2.11 is their first test.
- `projectPathFromCommandArg` for an argument with a `path` or a `filePath` property (`:353`): the other three
  shapes and a `Uri` are tested.
- The `catch` branches of `refreshProjectsAndSession` and `requestRefresh` for a failing project discovery and
  the `catch` of a watcher flush: not reached by a test.
- `SidebarHost.ts` is at 56 of 126 lines: its context-menu branches remain type-checked only (as at P2.9).

## Not started

- Feeds, service index, source health and its monitor, the transport, `proxyConfigured()` and the rebuild on an
  `http.*` change, credentials and outbound policy per project context, icons through the cache: P4.9 (the
  three `// REMOVAL GATE: P4.9` comments at `:73`, `:190` and `:259`; P4.2 delivers the transport, P4.1 decides
  what the proxy predicate honours).
- The evaluator in `CatalogDeps`: P6.2. `HostServices.mutator`: P6.3.
- The two-surface harness: P2.11. The root can be driven through `activateWith`.
- Folding the sweep of `nuiget.sdkVersionCache` into the orphan-state sweep: P7.1.

## Deviations from contract/ADR (file:line each)

Omissions against the words of the row (plan line 234), all by the ruling below:

- "`MemoryIconCache` until P4", "`DefaultServiceIndexClient(feedDeps, { health })`": not composed; the modules
  are P4.3 and P4.4, the wiring P4.9 (`extension.next.ts:73`).
- "`proxyConfigured()` honouring `http.proxySupport`; `http.*` change rebuilds transport": not written; P4.9
  after P4.1 (`:259`). No source health monitor (`:190`).
- No `DefaultCredentialProvider`, `NuGetConfigReader` or `DefaultOutboundPolicy` and no `prewarm`: they are
  built per project context in P4.9 (ADR-009 decision 5).
- No evaluator and no mutator, and no comment for either (P6.2, P6.3).
- `nuiget.viewPackageDetails`, which 1.x and the quarry register without contributing it, is not registered:
  nothing in 2.0 executes it. The P5 item that needs it decides (⚑ if it is to be contributed).

Others:

- `extension.next.ts:34`: `ActivationOverrides` is a type alias, `Pick<DotnetRunnerOptions, 'spawn' |
  'resolveExecutable'>`. The ruling writes `interface ActivationOverrides extends Pick<…> {}`; that form fails
  `@typescript-eslint/no-empty-object-type` (measured: `npx eslint src/extension.next.ts` → 1 error). Name and
  shape are the ruling's.
- `extension.next.ts:67,251-254`: the root refills the `stopDirs` array in place, because
  `StaticProjectInspector` (`src/core/project/inspector.ts:70`) and `ProjectContextProvider`
  (`src/core/project/context.ts:49`) keep the reference they were given. Ordered by the ruling; the contract
  does not say that the array may change.
- `extension.next.ts:73,190`: the wording of the first two gate comments differs from the ruling's suggestion
  ("the transport and its proxy predicate", "both surfaces"), because the ruling's own VERIFY grep forbids the
  tokens `proxyConfigured` and `hosts` in the file. The VERIFY text is the operative one.
- `extension.next.ts:207-235`: one flush computes the scopes of all its paths before it invalidates; the
  quarry invalidated path by path. With an asynchronous scope (lock and assets files) the coordinator would
  otherwise emit one event per path.
- `extension.next.ts:244`: the lock-file watcher's debounce is 1500 ms; the ruling adds the glob without a
  number, and 1500 ms is what the project-file watcher has.
- `extension.next.test.ts`, `resources/invalidated reaches both surfaces with keys`: asserts
  `{ key: 'projects', generation: 2 }`. The first computation of a key is generation 1
  (`src/core/queries/QueryCoordinator.ts:272`), so its first invalidation gives 2.
- `extension.next.test.ts`, `createFakePanel`: the tests do not use the panel of the shared mock, whose
  `dispose` fires `onDidDispose` every time, so that `MainPanelHost.dispose()` recurses (N58, gotcha row
  "Mock panel disposes without end"). The ruling allows two additive entries in the mock and no more.
- `extension.next.test.ts`, `a workspace-folder change refills stopDirs and invalidates the workspace`: beyond
  the event the ruling names, it proves the refill with a scratch project below a `Directory.Packages.props`
  that lies above the new workspace folder (`isCpm` true before the change, false after it).
- `extension.next.ts:136-150`: the ruling says that setting `lastReconciledProject` first means the commit of
  `reconcile` "cannot re-trigger". That holds while `reconcile` leaves the selected project as it is. When it
  replaces the project (none persisted, or the persisted one is gone), the first run lists the sources of the
  old directory (or of the first workspace folder), the commit names another project, and a second run lists
  that project's directory and reconciles again. It converges in two runs. The first of them checks the
  selected source against a list that is not the new project's: a source that only the new project has is
  reset to `all` and the second run does not bring it back. Accepted for a project that no longer exists;
  P2.11 pins the behaviour it wants (note on its tracker row).
- `HostServices.workspaceFolderFor(projectPath)` with an argument has no caller in `src/host` yet
  (`sourceDirectory` and `sources/configFiles` call it without one); it is implemented as documented and
  tested through `services`.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-13, P2.10, stop-and-ask in the plan's §2.4 form (`architecture-advisor`). Question: what exactly does
the P2.10 composition root contain and omit, given that feeds, transport, evaluator and mutator do not exist
yet (fifteen lettered points)? The brief is summarized in `docs/plans/STATUS.md` under "Advisor decisions",
where the answer is recorded as well. Answer, verbatim:

`````text
DECISION: Option 2, sharpened: P2.10 composes exactly what P2.1 to P2.9 export, omits everything that needs `src/core/feeds`, `Transport`, the evaluator or the mutator, anchors the feed-side omissions with three `// REMOVAL GATE: P4.9` comments in `src/extension.next.ts`, and moves `proxyConfigured()` and the `http.*` rebuild to P4.9 (after the mandatory P4.1 proxy decision). Not Option 1: blocking P2.10 blocks the P2 gate (`node esbuild.mjs --v2` builds, plan line 238) and P2.11, and the P4.9 row already says "Wire feeds into `Catalog` + `extension.next.ts` (remove `REMOVAL GATE: P4.9`)", so the plan expects a root without feeds. Not Option 3: writing consumer-less pieces breaks D5 (breadth frozen until P4) and pre-empts P4.1, which decides what `proxyConfigured()` honours. Not `OWNER MUST DECIDE`: no `contributes` change is needed.

WHY: The brief is correct about the tree. I checked the raw copy at `/Users/mattias/github/nuiget/src/extension.next.ts:1-295` against the real exports: `src/core/cache/index.ts` exports `CACHE_POLICY` and `TieredCache` (options object, `TieredCache.ts:28-44`), not a `CachePolicy` class; `src/core/http/index.ts` exports only the ssrf helpers; `src/core/project/index.ts` has no evaluator or mutator; `DotnetSourceProvider` takes `{ runner, logger }` (`DotnetSourceProvider.ts:18-24`), `NuGetConfigReader` only `{ env }` (`NuGetConfigReader.ts:25-27`), `DefaultOutboundPolicy(mapping?)` (`:14`), `CredentialProviderOptions` wants `runner` and `lookupConfigCredential` (`DefaultCredentialProvider.ts:19-21`); `CatalogDeps` is `coordinator, inspector, evaluator?, contexts, sources, assets, discoverProjects, logger?` (`Catalog.ts:32-42`); `HostServices` has neither `output` nor `mutator` and its events are the core `Event<T>` (`services.ts:16-37`); `createWorkflowDeps` exists (`services.ts:54-87`); `package.json` contributes exactly the 12 commands the brief lists and one view (`nuiget.sidebarView`, when `nuiget.hasProjectFiles`). Governing texts: ADR-009 decisions 5 and 8 (credentials and policy belong to a project context, breadth frozen until P4), ADR-001:35 and `SessionStore.reconcile` JSDoc with the P1.7 ruling (`docs/plans/STATUS.md:492-533`: a selected-project change is a source-list change; the intermediate broadcast is acceptable pending the P2.11 harness), ADR-002:56-59 (the coordinator event forwarded unchanged), ADR-005 and `sourceDirectory` (`handlers.ts:27-36`: no guessed directory), RUN.md §4 (never stub), plan §2.1 (the item's files) and §2.3 (`contributes` is ⚑), ledger N45 (`findings-ledger.md:371`), C-state-core-5 (`:403`) and C-protocol-host-1 (`:425`). The P1.7 ruling's reasoning applies to the mock: an answered stop-and-ask is the mechanism for touching a file the row does not name.

DO (lettered to the brief's questions):

1. Tracker first: paste this answer verbatim under `## Advisor decisions` in `docs/plans/STATUS.md` as `### P2.10 — ⚑ composition root without feeds, transport, evaluator and mutator (2026-10-13)`, set P2.10 to `in-progress`, and add this note to the row: "composes P2.1-P2.9 only; feeds, service index, health, transport, `proxyConfigured()` and the `http.*` rebuild are P4.9 under three `// REMOVAL GATE: P4.9` comments; evaluator P6.2, mutator P6.3; `nuiget.viewPackageDetails` not registered; `src/test/__mocks__/vscode.ts` extended additively under this ruling".

2. (a) Omissions and who adds them. Feeds clients, `MemoryIconCache`/icon cache, `DefaultServiceIndexClient` and `SourceHealthTracker`, `startHealthMonitor` and `notifySourceHealth`, `NodeTransport`/`Transport`, `proxyConfigured()`, the `http.*` rebuild: all omitted, all P4.9 (P4.2 delivers `Transport.ts`, P4.3 the service index and health, P4.4 the icon adapter; the root wires them in P4.9). Exactly three `// REMOVAL GATE: P4.9` lines in `src/extension.next.ts`: (i) at the `new Catalog({...})` call ("feeds, transport with `proxyConfigured()`, credentials and outbound policy per project context, icons through `TieredCache`"); (ii) where the health monitor and both hosts' `notifySourceHealth` would be wired, next to the invalidation forwarding; (iii) in `onDidChangeConfiguration`, where the `e.affectsConfiguration('http')` branch was. `proxyConfigured()` is not written now: it reads `vscode` configuration, so it belongs in the root, and what it honours is P4.1's decision. Evaluator and mutator are absences, not placeholders: no comment; `CatalogDeps.evaluator` stays unset until P6.2; `HostServices.mutator` returns in P6.3 (both rows already carry notes; add the ones in step 16). Record every omission under "Deviations from contract/ADR" in the handoff note with the row words it leaves out.

3. (b) Do not construct `DefaultCredentialProvider`, `NuGetConfigReader`, `DefaultOutboundPolicy`, or call `prewarm`. Nothing consumes them before P4.9, and ADR-009 decision 5 plus the P4.9 tracker note say they are built per project context, so a workspace-wide instance in the root would be the wrong shape.

4. (c) Construct `const cache = new TieredCache({ store: context.workspaceState, logger })` in the root (root-local, not on `HostServices`); its consumer is `nuiget.clearHttpCache` (`cache.clear('network')`, a valid `CacheScope`, `CachePolicy.ts:52`). N45: write a local `redactingLogger(inner: Logger): Logger` in `src/extension.next.ts` over `loggerFor(output)`: every `message` string through `redact` from `./core/logging`; for `error(message: string | Error, ...)` an `Error` becomes `redact(error.stack ?? error.message)`; string args through `redact`, `Error` args likewise, other args unchanged. This one logger goes to every core constructor (`DefaultDotnetRunner`, `TieredCache`, `DotnetSourceProvider`, `ProjectContextProvider`, `DefaultQueryCoordinator`, `DefaultSessionStore`, `DefaultOperationQueue`, `createWorkflowDeps`, `Catalog`) and to `HostServices.logger`. Only `output.info('nUIget is activating' / 'is active')` touches the channel directly.

5. (d) Register exactly the 12 contributed commands; do not register `nuiget.viewPackageDetails` (no 2.0 executor: `ui/viewPackage` goes through `MainPanelHost.navigateToPackage`; a hidden command nothing calls is dead wiring; record it as a deviation and let the P5 item that needs it decide, ⚑ if it ends up contributed). `nuiget.clearHttpCache`: `await runner.clearHttpCache(); cache.clear('network'); catalog.invalidate({ kind: 'workspace' }, 'manual-refresh');` then the information message. `nuiget.clearSdkVersionCache`: `runner.clearSdkCache(); await runner.flush(); catalog.invalidate({ kind: 'workspace' }, 'manual-refresh');` then the message (cached `installed` results carry `unsupported` from the SDK probe, so a cleared cache must recompute). SDK cache: `const SDK_CACHE_KEY = 'nuiget.sdkVersionCache.v2'`, `runner.hydrate(context.globalState, SDK_CACHE_KEY, String(context.extension.packageJSON.version ?? '0.0.0'))`; `const LEGACY_SDK_CACHE_KEY = 'nuiget.sdkVersionCache'` swept at activation with `if (context.globalState.get(LEGACY_SDK_CACHE_KEY) !== undefined) { void context.globalState.update(LEGACY_SDK_CACHE_KEY, undefined); }` (1.x wrote it to `globalState`, `src/extension.ts:30`). `openManager` keeps `projectPathFromCommandArg` and `initialTab: 'installed'`; the eight `nuiget.sidebar.*` commands call the `SidebarHost` methods as the quarry does; `nuiget.refreshPackages` invalidates `workspace` with `manual-refresh`.

6. (e) `workspaceFolderFor(projectPath?)` exactly as `services.ts:35` documents: without an argument the first folder's `fsPath` or `undefined`; with an argument the deepest `vscode.workspace.workspaceFolders` entry for which `isPathInside(projectPath, folder.uri.fsPath)` (from `./core/util/paths`) holds, else `undefined` (a project no folder contains has no workspace folder, as `discovery.ts:51-59` already decides; do not fall back to the first folder for a given path). Delete `projectDirOf`, `workspaceCwd` and the literal `'__all_projects__'`; import `ALL_PROJECTS` from `./protocol` where a sentinel check is needed. `stopDirs`: one `const stopDirs: string[] = workspaceRoots()` handed to both `new StaticProjectInspector({ assets, stopDirs })` and `new ProjectContextProvider({ runner, sources, stopDirs, logger })`, refilled in place (`stopDirs.splice(0, stopDirs.length, ...workspaceRoots())`) in `onDidChangeWorkspaceFolders` before `catalog.invalidate({ kind: 'workspace' }, 'workspace-folders')`, with a one-line comment; record it as a deviation (the core keeps the array reference, `inspector.ts:70`, `context.ts:49`).

7. Composition in order: `output` + `logger` (step 4); `runner = new DefaultDotnetRunner({ logger, ...overrides })` (step 12) + hydrate + legacy sweep; `cache`; `sources = new DotnetSourceProvider({ runner, logger })`; `assets = new AssetsReader()`; `stopDirs`; `inspector`; `contexts = new ProjectContextProvider(...)`; `coordinator = new DefaultQueryCoordinator({ logger })`; `session = new DefaultSessionStore(context.workspaceState, logger)`; `queue = new DefaultOperationQueue({ maxWaiting: 5, logger })`; `catalog = new Catalog({ coordinator, inspector, contexts, sources, assets, discoverProjects, logger })` with `discoverProjects: () => findProjects(async (include, exclude, max) => (await vscode.workspace.findFiles(include, exclude, max)).map(u => u.fsPath), (vscode.workspace.workspaceFolders ?? []).map(f => ({ name: f.name, fsPath: f.uri.fsPath })))` (the `await` turns the Thenable into a Promise; no `Thenable` token); `workflows = new PackageWorkflows(createWorkflowDeps({ runner, catalog, inspector, queue, logger, onCommand }))` with the quarry's `onCommand` body writing through `logger`; `events = new HostEvents()`; `services: HostServices = { context, logger, session, catalog, queue, workflows, sources, onOperationCompleted: events.operationCompleted.event, onOperationProgress: queue.onProgress, onConfigChanged: events.configChanged.event, onProjectsChanged: events.projectsChanged.event, invalidate: (scope, reason) => catalog.invalidate(scope, reason), announceOperation: outcome => events.operationCompleted.fire(outcome), config: readExtensionConfig, workspaceFolderFor }` (no `vscode.Disposable.from` around core events). Subscriptions: `output`, `events`, `queue`, `coordinator`, `session` (`DefaultSessionStore.dispose` exists), `sidebar`, `registerWebviewViewProvider(SidebarHost.viewType, sidebar, { webviewOptions: { retainContextWhenHidden: true } })`, `{ dispose: () => MainPanelHost.instance?.dispose() }`, the status bar item, every watcher and timer.

8. (f) One `refreshProjectsAndSession()` with coalescing: a module-local `inFlight: Promise<void> | undefined` and `rerun = false`; a request while one runs sets `rerun = true`; when the run settles and `rerun` is set, it clears the flag and runs once more. Body: `lastReconciledProject = session.snapshot.selectedProject` first (so the host-origin commit that `reconcile` fires cannot re-trigger); `const projects = await catalog.projects()`; `events.projectsChanged.fire(projects)`; `await vscode.commands.executeCommand('setContext', 'nuiget.hasProjectFiles', projects.length > 0)`; `const directory = sourceDirectory(services)` (import from `./host/handlers`; wrap in try) and `const sources = await catalog.sources(directory)`; on success remember `lastListing = { directory, urls }` and `await session.reconcile(projects, enabledUrls)`. On a failed listing or a `not-found` from `sourceDirectory`: never pass `[]`; use `lastListing.urls` if `lastListing.directory === directory`, else `session.snapshot.selectedSource === 'all' ? [] : [session.snapshot.selectedSource]` (keeps the selection without claiming knowledge), log a warning, still call `reconcile` with the real `projects` (a deleted project must not stay selected). Triggers: at the end of `activateWith` (not awaited); from `coordinator.onDidInvalidate` when `event.scope.kind` is `workspace`, `project` or `sources` (not `package`, not `metadata`: they reach neither `projects` nor `sources:*`, `scopes.ts:15-17`); from `session.onDidChange` when `snapshot.selectedProject !== lastReconciledProject`. `afterSourceMutation` (`handlers.ts:307-312`) reconciles too; the duplicate is coalesced and idempotent. The intermediate broadcast between `apply` and `reconcile` stays acceptable; P2.11 proves convergence (P1.7 ruling).

9. (g) Forward at event time: `coordinator.onDidInvalidate(event => { sidebar.notifyInvalidated(event); MainPanelHost.instance?.notifyInvalidated(event); if (...) requestRefresh(); })`; delete the `hosts` array and `trackMain`; `openMain = options => MainPanelHost.createOrShow(services, options)`.

10. (h) Watchers: keep the five quarry globs, debounces and reasons; add `'**/packages.lock.json'` with project scope and reason `file-watcher` (ADR-002:62-64 names lock files; `AssetsReader` reads them). One helper `projectFileIn(directory): Promise<string | undefined>` using `fs.promises.readdir` (`import * as fs from 'fs'`), used by the assets watcher (`path.dirname(path.dirname(assetsPath))`) and the lock-file watcher (`path.dirname(lockPath)`); the timer callback becomes async; no `require`. Keep the `queue.isBusy` → `await queue.waitIdle()` re-arm. `onDidChangeConfiguration`: keep the `nuiget` / `workbench.tree.indent` branch firing `events.configChanged.fire(readExtensionConfig())`; the `http` branch is gate (iii) of step 2.

11. (i) Status bar in the root: `const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)`; `queue.onDidChange(({ active, pending }) => { if (active + pending === 0) { statusBar.hide(); return; } statusBar.text = pending > 0 ? \`$(sync~spin) nUIget: ${active} running, ${pending} queued\` : '$(sync~spin) nUIget: operation running'; statusBar.show(); })`; push the item and the listener to subscriptions.

12. (j) Test seam, exported next to `activate`: `export interface ActivationOverrides extends Pick<DotnetRunnerOptions, 'spawn' | 'resolveExecutable'> {}` (import the type from `./core/cli`), `export interface ActivatedExtension { services: HostServices; /** Settles when the first project discovery and session reconciliation are done. */ ready: Promise<void>; }`, `export async function activateWith(context: vscode.ExtensionContext, overrides: ActivationOverrides = {}): Promise<ActivatedExtension>`, and `export async function activate(context): Promise<void> { await activateWith(context); }`. `spawn` rather than `runner`, because the root calls `hydrate`, `flush` and `clearHttpCache`, which are `DefaultDotnetRunner` methods, not on the `DotnetRunner` contract; `resolveExecutable` so a machine without `dotnet` never throws at activation. No `vi.mock` of `./core/cli`: a partial barrel mock is fragile under `tsconfig.vitest.json` and would bypass the real hydrate/sweep/flush the tests check. The test writes its own small fake `SpawnFunction` (an `EventEmitter` child that answers `dotnet --version` and `dotnet nuget list source --format detailed` per `cwd`; `src/core/cli/DotnetRunner.test.ts:66-110` shows the shape, it is not exported and is not this item's file to export).

13. (k) Extend `src/test/__mocks__/vscode.ts` additively, under this ruling, in two places only: `workspace.onDidChangeWorkspaceFolders: vi.fn(() => new Disposable(() => { }))` (same shape as `onDidChangeConfiguration:241`; a test reads the listener from `.mock.calls[0][0]`), and `extension: { id: 'nuiget.nuiget', packageJSON: { version: '0.0.0-test' } }` in `createMockExtensionContext` before `...overrides` (`ExtensionContext.extension` is non-optional in `@types/vscode@1.85.0`, `index.d.ts:7851`, so the root reads it without `?.`). Condition: `npm test` stays green for the 1.x suites that share the mock. The watcher tests need no mock change: take `vi.mocked(vscode.workspace.createFileSystemWatcher).mock.results[i].value.onDidChange.mock.calls[0][0]`; the sidebar view is a local object `{ webview: <the mock webview from createWebviewPanel's factory shape>, visible: true, title: undefined, onDidChangeVisibility: vi.fn(), onDidDispose: vi.fn() }` passed to the provider from `registerWebviewViewProvider.mock.calls[0][1]`.

14. (l) `src/extension.next.test.ts` (backend project; `afterEach` disposes `context.subscriptions`, resets the mocks and uses fake timers only in the watcher test). Titles the gate reads: `registers exactly the commands package.json contributes` (read `package.json` with `fs.readFileSync(new URL('../package.json', import.meta.url))`, compare as sets: 12, no extra); `registers the sidebar view provider and nuiget.openManager creates the nugetManager panel` (`registerWebviewViewProvider` called with `'nuiget.sidebarView'`; `createWebviewPanel` called with `'nugetManager'`); `sets nuiget.hasProjectFiles, nuiget.prereleaseEnabled and nuiget.restoreEnabled at activation`; `a selected-project change reconciles with the new project's sources (C-state-core-5)` (two projects in different directories, the fake answers different source lists per `cwd`, a persisted `selectedSource` valid only for the first; after `services.session.apply({ selectedProject: second }, 'sidebar')` and settling, `spawn` saw `nuget list source` with the second directory and `snapshot.selectedSource === 'all'`); `a failed source listing keeps the selected source` (listing exits 1 → `selectedSource` unchanged, `reconcile` still ran: a persisted project that no longer exists is replaced); `overlapping refreshes are coalesced` (hold the listing with a deferred, invalidate three times, release: two listings at most); `resources/invalidated reaches both surfaces with keys` (sidebar resolved and panel open; `nuiget.refreshPackages`; both `postMessage` mocks receive an event envelope with `type 'resources/invalidated'` whose payload has `keys` containing `{ key: 'projects', generation }`); `a disposed main panel receives no further events`; `the status bar shows the queue and hides when it is idle` (`queue.submit` through `services.queue`, text `operation running`, then `hide`); `sweeps the legacy nuiget.sdkVersionCache key and hydrates nuiget.sdkVersionCache.v2`; `a workspace-folder change refills stopDirs and invalidates the workspace` (observe through the invalidation event's `scope.kind` and `reason 'workspace-folders'`); `a project-file change invalidates the project after the debounce and waits for an idle queue`; `nuiget.clearHttpCache clears the network cache and invalidates the workspace` (`spawn` saw `nuget locals http-cache --clear`); `nuiget.clearSdkVersionCache clears the runner cache and invalidates the workspace`; `the logger handed to the core redacts every message (N45)` (`services.logger.warn('https://user:secret@feed/x')` reaches the channel mock without `secret`).

15. (m) Handoff note: new `src/STATUS.md` from the §2.5 template, first line stating its scope is `src/extension.next.ts` and `src/extension.next.test.ts` (and, from P8.2, the deletion of `src/extension.ts`); `.github/STATUS.md` is for items with no `src/` directory at all and stays as P0.13 left it. `.vscodeignore` already excludes `src/**`; `check:vsix` needs nothing.

16. (n) CHANGELOG `## [Unreleased]` `### Added`: `**2.0 composition root** — src/extension.next.ts assembles the 2.0 core and both webview hosts: one dotnet runner with a persisted SDK cache, one query coordinator whose invalidations reach both surfaces unchanged, a session that is reconciled with the selected project's sources whenever projects, sources or the selection change, file watchers for project, props, nuget.config, global.json, lock and assets files, a status bar item for the operation queue, and a redacting logger for everything the core logs`. ARCHITECTURE.md 2.0 section: row 100 becomes the description of the root (composition order, the redacting logger, `activateWith` and its overrides, `refreshProjectsAndSession` triggers and the failed-listing rule, the watchers and their scopes, the status bar, the three `REMOVAL GATE: P4.9` anchors, what P4.9/P6.2/P6.3 add) with status "Present since P2.10"; status cells of rows 95 ("wired by the composition root, done in P2.10"), 96 ("forwarded by the host since P2.9 and the root since P2.10") and 99 ("composed by the root since P2.10"). copilot-instructions: extend the existing row `REMOVAL GATE comments in src/host` to "`src/extension.next.ts` carries three `// REMOVAL GATE: P4.9` lines (Catalog deps, health → `sources/health`, `http.*` → transport)"; no new row. Ledger: C-state-core-5 → `closed (P2.10: refreshProjectsAndSession on session.onDidChange; test a selected-project change reconciles with the new project's sources (C-state-core-5))`; C-protocol-host-1 → `closed (P2.10: root compiles against the real APIs; extension.next.test.ts)`; N45 → `closed (P2.10: redactingLogger in extension.next.ts is the only Logger handed to the core; test the logger handed to the core redacts every message (N45))`. Tracker notes: P4.2 "`Transport` takes an injected proxy predicate; `proxyConfigured()` and its `http.*` rebuild live in the root and land in P4.9 after P4.1"; P4.9 "the root has three `REMOVAL GATE: P4.9` anchors (Catalog deps incl. transport, credentials, policy and icon cache per ADR-009 d.5; health monitor → both hosts' `notifySourceHealth`; `http.*` → rebuild transport); `proxyConfigured()` honouring `http.proxySupport` per ADR-005 as amended by P4.1"; P6.2 "pass the evaluator in `CatalogDeps` from `extension.next.ts`"; P6.3 "restore `HostServices.mutator` in `extension.next.ts` with the `isDirty` adapter over `vscode.workspace.textDocuments`"; P7.1 "the `nuiget.sdkVersionCache` sweep exists in `extension.next.ts` since P2.10 (`LEGACY_SDK_CACHE_KEY`); fold it into the orphan sweep so the key is swept in one place".

17. (o) No frozen-path edit; no sentinel. Gates in §2.2 order, plus `node esbuild.mjs --v2` (the row's gate) and, because the item touches the extension entry, `npm run package:vsix`; delete `dist/` between the `--v2` build and packaging (gotcha "Stale files in dist/"). Commit with the `git-commit` skill citing P2.10, ADR-001, ADR-002, ADR-003, ADR-005, ADR-007, ADR-009, C-state-core-5, C-protocol-host-1, N45; push to `labs/2.0`; wait for green CI.

DO NOT:
- Do not stub `src/core/feeds`, `src/core/http/Transport`, an evaluator or a mutator, and do not write `proxyConfigured()`, a credential provider, a config reader or an outbound policy that nothing consumes.
- Do not pass `[]` to `session.reconcile` when a listing failed or no directory could be resolved; an unknown list is not an empty one.
- Do not let two `refreshProjectsAndSession` runs overlap, and do not compare the new `selectedProject` with the previous snapshot instead of the project last reconciled for.
- Do not keep the `hosts` array, `trackMain`, `projectDirOf`, `workspaceCwd`, the literal `'__all_projects__'`, `require('fs')`, `vscode.Disposable.from` around core events, or any `Thenable`.
- Do not hand `catalog.sources` a workspace folder or `process.cwd()`; use `sourceDirectory(services)`.
- Do not register `nuiget.viewPackageDetails` or change `package.json` `contributes` (⚑).
- Do not add `// REMOVAL GATE` comments for the evaluator or the mutator; only the three P4.9 anchors.
- Do not edit `src/host/**` (`loggerFor` stays as it is; the redacting wrapper is local to the root), `src/core/**`, `src/protocol/**`, `src/core/contracts.ts` or `docs/adr/**`.
- Do not edit the mock beyond the two additive entries of step 13, and do not change `createMockExtensionContext`'s existing fields.
- Do not use `vi.mock` for `./core/cli`, a JSON import for `package.json`, or a hard-coded command list in the test.
- Do not make `activate` await the first refresh or return anything.
- Do not run `npm run watch` and `npm run watch:v2` together, and do not package without deleting `dist/` after a `--v2` build.

CONTRACT CHANGE: none. No file under `src/protocol/**`, `src/core/contracts.ts` or `docs/adr/**` changes; no sentinel. Non-frozen files of the item: `src/extension.next.ts`, `src/extension.next.test.ts`, `src/STATUS.md` (new), `src/test/__mocks__/vscode.ts` (two additive entries under this ruling), `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`, `CHANGELOG.md`, `ARCHITECTURE.md` (2.0 section), `.github/copilot-instructions.md` (one existing gotcha row extended).

VERIFY:
- `npx tsc --noEmit` → exit 0; `npm run check-types` → exit 0; `npx eslint src` → exit 0, no output.
- `node esbuild.mjs --v2` → three bundles in `dist/`; then `rm -rf dist` before `npm run package:vsix` → exit 0; `npm run check:vsix` → OK.
- `npx vitest run --project backend src/extension.next.test.ts --reporter=verbose` → green; the output lists the 15 titles of step 14, among them `registers exactly the commands package.json contributes`, `a selected-project change reconciles with the new project's sources (C-state-core-5)`, `a failed source listing keeps the selected source`, `resources/invalidated reaches both surfaces with keys`, `the logger handed to the core redacts every message (N45)`.
- `grep -c "REMOVAL GATE: P4.9" src/extension.next.ts` → 3; `grep -rn "require(\|__all_projects__\|Thenable\|process.cwd\|hosts\b\|viewPackageDetails\|prewarm\|CredentialProvider\|OutboundPolicy\|NuGetConfigReader\|NodeTransport\|proxyConfigured\|MsBuildProjectEvaluator\|ProjectMutator\|core/feeds" src/extension.next.ts` → no output; `grep -c "activateWith\|ActivationOverrides\|ActivatedExtension" src/extension.next.ts` → ≥ 3; `grep -n "onDidChangeWorkspaceFolders\|packageJSON" src/test/__mocks__/vscode.ts` → one line each.
- `git diff --name-only -- src/protocol src/core docs/adr src/host` → empty (the mock is under `src/test`); `ls .claude/.contract-change` → No such file or directory.
- `grep -n "C-state-core-5\|C-protocol-host-1\|N45" docs/plans/findings-ledger.md` → each `closed (P2.10 …)`; `npm test` green including the 1.x suites that share the mock; `npm run bench` green; CI green on all required jobs before P2.11.

Files checked: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; `/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` lines 41-159 (D1-D13, §2, §3, §4), 222-238 (P2 rows and gate), 254-268 (P4 rows), 295-296, 306; `/Users/mattias/github/nuiget/docs/plans/RUN.md:64-84,128-137`; `/Users/mattias/github/nuiget/docs/plans/STATUS.md` rows P0.2, P0.11, P1.7, P1.8, P2.8, P2.9, P2.10, P2.11, P4.2, P4.3, P4.9, P6.2, P6.3, P7.1 and the P1.7 (484-543) and P2.9 (880-1005) rulings; `/Users/mattias/github/nuiget/docs/plans/findings-ledger.md:145-148,369-372,401-404,423-426`; `/Users/mattias/github/nuiget/docs/adr/001-session-store.md:14-35`, `002-query-coordinator.md:48-66`, `003-operation-queue-and-dotnet-runner.md:29`, `005-execution-context-and-outbound-policy.md:6-24`, `009-catalog.md:9-18`; `/Users/mattias/github/nuiget/src/extension.next.ts:1-295` (the raw quarry copy; `git status --short` shows it as the only modification); `/Users/mattias/github/nuiget/src/host/services.ts` (whole), `SidebarHost.ts` (whole), `MainPanelHost.ts` (whole), `handlers.ts:1-60,290-330`, `STATUS.md:1-30,342-348`; `/Users/mattias/github/nuiget/src/core/contracts.ts:24-60,86-115,136-150,186-200`; `/Users/mattias/github/nuiget/src/core/*/index.ts` (all 13); `src/core/cache/TieredCache.ts:15-120,355-375`, `CachePolicy.ts:8-32,52`; `src/core/cli/DotnetRunner.ts:30-60,140-185,330-415`, `DotnetRunner.test.ts:66-110`; `src/core/session/SessionStore.ts` (whole); `src/core/catalog/Catalog.ts:1-115,280-305`; `src/core/project/context.ts:1-70`, `inspector.ts:15-75`, `discovery.ts:1-70`; `src/core/sources/DotnetSourceProvider.ts:1-60`, `DefaultOutboundPolicy.ts:13-14`, `NuGetConfigReader.ts:25-45`; `src/core/credentials/DefaultCredentialProvider.ts:15-84`; `src/core/ops/OperationQueue.ts:15-65,140-144,223-227`; `src/core/queries/QueryCoordinator.ts:95-150`, `scopes.ts:8-79`; `src/core/util/events.ts:1-40`, `paths.ts:10-32`, `fs.ts` exports; `src/protocol/domain.ts:9,220-262`; `src/extension.ts:20-48,118-180,255-284`; `src/services/OperationQueue.ts:60-95`; `src/test/__mocks__/vscode.ts:1-120,160-270,272-385` and `git log -- src/test/__mocks__/vscode.ts` (last touched by 1.x PRs, no 2.0 item); `vitest.config.mts` (whole); `tsconfig.vitest.json:31-57`; `tsconfig.json:33-36`; `esbuild.mjs:7-18,60,80`; `eslint.config.mjs:10-84`; `.github/instructions/core-boundaries.instructions.md:3,16,46`; `package.json` `contributes`, `activationEvents`, `main`, `version`, `@types/vscode` pin; `node_modules/@types/vscode/index.d.ts:7851`; `.vscodeignore` (whole); `scripts/check-vsix-contents.mjs:10,42,104-108`; `.github/STATUS.md:1-30`; `ARCHITECTURE.md:85-120` (rows 95, 96, 99, 100); `.github/copilot-instructions.md:175`; `CHANGELOG.md:1-30`; `src/core/session/STATUS.md:68-74`, `src/core/catalog/STATUS.md:111`, `src/core/cache/STATUS.md:81-88`; `.claude/settings.json:15-18,47`.
`````

The ambient advisor (`/advisor`) was consulted before the brief was written; it asked for this consultation
and for the copy-then-brief order, and named the test hazards that the tests above cover.

## Exact next step (one item ID)

P2.11 (two-surface harness on the new protocol, `src/test/harness/`). Its tracker row carries two notes from
this item: do not use the shared mock's panel (N58), and `activateWith` returns `{ services, ready }` for a
harness that wants the real root. The scenario "A→B→A ordering" is where the P1.7 ruling wants the proof that
both surfaces converge after the intermediate broadcast between `apply` and `reconcile`.

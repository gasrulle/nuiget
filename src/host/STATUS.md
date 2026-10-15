# STATUS — src/host   commit 93bfd17 (P6 tagged; parent of the P7.1 commit)   2026-10-16T05:30:00Z

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`,
`docs/plans/{STATUS,findings-ledger}.md`, `src/core/cache/{TieredCache,cache.test,index}.ts`, `src/extension.next{,.test}.ts`,
the STATUS notes of `src/host` and `src/core/cache`; new `src/host/{legacyState,legacyState.test}.ts`

Item: **P7.1** — the orphan-state sweep and the `**Breaking:**` wording. This note replaces this directory's previous note
(in its history).

## Verified by running

```text
baseline (on 93bfd17, tag labs/2.0-P6-done, CI run 38810252486): npm run check-types → exit 0 · npx eslint src → exit 0 ·
                               npx vitest run → Test Files 166 passed (166) · Tests 3396 passed | 6 skipped (3402)
npx tsc --noEmit             → exit 0
npm run check-types          → exit 0
npx eslint src               → exit 0
npx vitest run --project backend src/host/legacyState.test.ts src/core/cache src/extension.next.test.ts → Tests 89 passed (89)
npm test                     → Tests 3402 passed | 6 skipped (3408)
npm run bench                → Tests 119 passed | 1 skipped (120)
rm -rf dist && NUIGET_V2=1 npm run package:vsix → exit 0 · npm run check:vsix → check:vsix: OK
node esbuild.mjs --v2 --production --analyze → extension 292128 / 299921 (+974), webview 523296, sidebar 318803
grep "__index__|'nuiget.cache.'" src (tests excluded) → TieredCache.ts:46-47, and the 1.x `src/services/WorkspaceCache.ts:18`
                               (legacy code, deleted at P8.2); the host holds neither constant
git grep of 1.x `nuget.*` memento keys (tests excluded, nuget.config/nuget.org aside) → 8 (N78)
npm run test:ui              → SKIPPED: no UI change
CI                           → see the tracker row of P7.1
```

## Done (tested)

- `legacyState.ts`: `LEGACY_WORKSPACE_KEYS` (7), `LEGACY_GLOBAL_KEYS` (`nuget.splitPosition`, `nuiget.sdkVersionCache`), `sweepLegacyState(context, logger)`: the literal keys that exist plus `orphanedStoreKeys(workspaceState)`, removed with `Promise.allSettled`, one warn per rejection, one info line; never throws; migrates nothing. `legacyState.test.ts`: the five titles of the ruling. `src/extension.next.ts` calls it right after the logger, before the runner, the cache and the session; `LEGACY_SDK_CACHE_KEY` is gone. `src/extension.next.test.ts`: `sweeps the legacy nuiget.sdkVersionCache key and hydrates nuiget.sdkVersionCache.v2` → `sweeps the 1.x state before the cache and the session hydrate, migrates nothing, and hydrates nuiget.sdkVersionCache.v2` (rewritten by title, as ruled).
- CHANGELOG `## [Unreleased]` `### Changed`: two `**Breaking:**` lines (storage reset; `nuiget.noRestore` no longer
  migrated and the recent-searches list gone) beside the SDK-floor line, three in all.

## Done (untested)

- README.md:60 still says the legacy `nuiget.noRestore` setting is migrated; README 2.0 is P7.5's (named there).

## Not started

- P7.2 onwards.

## Deviations from contract/ADR (file:line each)

- None. The plan's "9 legacy `nuget.*` keys" is 8 in the tree (N78); the sweep removes 8 + `nuiget.sdkVersionCache` +
  the unindexed `nuiget.cache.*` entries.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.1 (stop-and-ask: the key list, the shared prefix, migration, the wording):

`````text
DECISION: A2 + B1 + C1 + no migration (D) + two new `**Breaking:**` lines (E). Sweep nine literal keys (seven workspaceState `nuget.*`, two globalState: `nuget.splitPosition`, `nuiget.sdkVersionCache`) plus every workspaceState key under `nuiget.cache.` that `nuiget.cache.__index__` does not list, from a new `src/host/legacyState.ts` called once per activation before `TieredCache` and `DefaultSessionStore` are constructed; the orphan discriminator is a pure helper exported from `src/core/cache` so the index key and prefix stay private to `TieredCache.ts`. The brief is wrong on two points, corrected below. Plan count: 8 literal `nuget.*` keys, not 9.

WHY: The brief's reading of the tree is wrong in two places. (1) 2.0 does persist layout in mementos: `src/host/handlers.ts:241-255` reads and writes `nuiget.layout.splitPosition` (globalState) and `nuiget.layout.sidebarSectionSplit` (workspaceState) for `layout/get`/`layout/set` (ADR-001:29 "the host only persists layout preferences (`layout/*`)"); `vscode.setState` holds only the webview-side state. These two keys are live 2.0 state and never swept. (2) The count: `git grep -ohE "['\"]nuget\.[A-Za-z]+['\"]" main -- src ':!src/**/*.test.*'` and the same on `labs/2.0` both list exactly eight memento keys (`includePrerelease`, `recentSearches`, `restoreEnabled`, `restoreEnabledMigrated`, `selectedProject`, `selectedSource`, `sidebarSectionSplit`, `splitPosition`); the plan's "9" is supported by neither tree (`nuiget.noRestore` is a configuration setting, `nuiget.layout.*` is 2.0's own); read "9 legacy keys + sdkVersionCache" as 8 + 1 and record it as a finding. Seven of the eight live in workspaceState; `nuget.splitPosition` is globalState (`src/webview/NuGetPanel.ts:1266,1277`), as is `nuiget.sdkVersionCache` (`src/extension.ts:31`). A3's premise is false: `TieredCache.clear()` (`src/core/cache/TieredCache.ts:146-153`) iterates `this.persisted.keys()`, `loadPersistedIndex` (`:239-268`) reads only the keys named in `nuiget.cache.__index__`, and `evictPersistedIfNeeded` budgets only tracked entries; nothing in `TieredCache` ever calls the store's `keys()`, so a 1.x `WorkspaceCache` entry (`src/services/WorkspaceCache.ts:18`, up to 500 entries including search results, version lists and READMEs, `src/services/NuGetPackageService.ts:1069,2272,2426`) is never read, evicted or cleared by 2.0 for the life of the workspace. That is the orphan state the item is named for; the index is the safe discriminator (a 2.0 entry whose index flush never landed is equally unreadable, so deleting it loses nothing). ADR-000:21-22 ("replaced without migration shims … Users re-select project/source once") and the item's own "removed migration" settle D: migrate nothing. A marker key (C2) is itself a shim and breaks a developer who alternates `watch` and `watch:v2` on one workspace; the every-activation sweep is nine `get`s and one `keys()` walk, and writes only for keys that exist. `KeyValueStore` (`src/core/contracts.ts:31-35`) has no `keys()` and is frozen (D6), so the sweep takes the VS Code mementos in host code (`src/host/**` may import `vscode`, §3 fences); `Memento.keys()` is in the pinned `@types/vscode` and already used at `src/services/WorkspaceCache.ts:220`, and `createMockExtensionContext` implements it (`src/test/__mocks__/vscode.ts:356,366`). Tracker row P7.1 (from P2.10) asks that `LEGACY_SDK_CACHE_KEY` (`src/extension.next.ts:31,76-78`) be folded in so the key is swept in one place.

DO:
1. `src/core/cache/TieredCache.ts`: add and export a pure function `orphanedStoreKeys(store: { get<T>(key: string): T | undefined; keys(): readonly string[] }, storePrefix = DEFAULT_STORE_PREFIX): string[]` returning every key of `store.keys()` that starts with `storePrefix`, is not `storePrefix + INDEX_KEY`, and is not `storePrefix + k` for a string `k` in the index array (no index, or a non-array index → every prefixed key). Re-export it from `src/core/cache/index.ts`. No `vscode` import, no change to `KeyValueStore`.
2. `src/core/cache/cache.test.ts`, under `TieredCache (with persistent tier)`: new test `orphanedStoreKeys lists the prefixed keys the index does not name, never the index itself, and nothing under another prefix`: write survivors through a real `TieredCache` over the mock memento (as `:256` does, let the index microtask flush), add two hand-written prefixed entries (one 1.x-shaped `{ value, expiresAt, storedAt }`, one arbitrary) and one `other.` key; assert exactly the two orphans are returned. A second case with no index at all returns every prefixed key.
3. New `src/host/legacyState.ts`: `export const LEGACY_WORKSPACE_KEYS = ['nuget.includePrerelease', 'nuget.recentSearches', 'nuget.restoreEnabled', 'nuget.restoreEnabledMigrated', 'nuget.selectedProject', 'nuget.selectedSource', 'nuget.sidebarSectionSplit'] as const`, `export const LEGACY_GLOBAL_KEYS = ['nuget.splitPosition', 'nuiget.sdkVersionCache'] as const`, and `export async function sweepLegacyState(context: Pick<vscode.ExtensionContext, 'workspaceState' | 'globalState'>, logger: Logger): Promise<{ removed: string[] }>` that collects the literal keys whose `get` is not `undefined` plus `orphanedStoreKeys(context.workspaceState)`, issues `update(key, undefined)` for each, awaits `Promise.allSettled`, logs one `warn` per rejection with the key and one `info` line with the count when anything was removed, and never throws. The one-line doc comment states that the list is the 1.x storage removed per ADR-000 and that `nuiget.layout.*`, `nuiget.selectedProject`-family and `nuiget.sdkVersionCache.v2` are 2.0's own.
4. `src/extension.next.ts`: delete `LEGACY_SDK_CACHE_KEY` (`:31`) and the `if` block at `:76-78`; insert `await sweepLegacyState(context, logger);` directly after `const logger = redactingLogger(loggerFor(output));` and before `new DefaultDotnetRunner`/`runner.hydrate`, `new TieredCache(...)` and `new DefaultSessionStore(...)`, so the index the sweep reads is the previous session's final one by structure, not by timing.
5. New `src/host/legacyState.test.ts` (backend project, mock context from `src/test/__mocks__/vscode.ts`, a logger spy), titles: `removes the seven workspaceState and two globalState keys of 1.x and reports them`; `removes nuiget.cache.* entries the TieredCache index does not list and keeps the index and what it lists` (survivors written through a real `TieredCache`, not a hand-built index array); `keeps nuiget.selectedProject, nuiget.layout.splitPosition, nuiget.layout.sidebarSectionSplit and nuiget.sdkVersionCache.v2, and migrates nothing` (seed legacy `nuget.selectedProject` next to them; assert `update` was never called with a `nuiget.` key); `writes nothing when there is nothing to sweep` (`update` not called); `a rejected update is logged and the other keys are still removed`.
6. `src/extension.next.test.ts:618`: rewrite the test named `sweeps the legacy nuiget.sdkVersionCache key and hydrates nuiget.sdkVersionCache.v2` by title to `sweeps the 1.x state before the cache and the session hydrate, migrates nothing, and hydrates nuiget.sdkVersionCache.v2`: seed workspaceState `nuget.selectedProject: libPath` (not `appPath`: `firstProject` picks App, so seeding App proves nothing), `nuget.includePrerelease: true`, an orphan `nuiget.cache.versions:x` entry and no index; globalState `nuget.splitPosition: 40`, the legacy SDK key and the `.v2` key as today; after `start`, assert every seeded legacy and orphan key is `undefined`, `services.session.snapshot.selectedProject` is `appPath` and `includePrerelease` is `false`, and keep the existing probe assertions. Import the key constants from `./host/legacyState` and drop the test file's local `LEGACY_SDK_CACHE_KEY`.
7. CHANGELOG `## [Unreleased]` `### Changed`, two new lines in the shape of the existing SDK line (one sentence after the bold, no sub-bullets, and do not duplicate the SDK-floor line): `- **Breaking:** 2.0 resets the persisted 1.x state: the selected project and source, the prerelease and restore toggles and the split positions are chosen once more, the cached feed data and the SDK cache are rebuilt, and the 1.x entries are removed from workspace and global storage at the first activation` and `- **Breaking:** the `nuiget.noRestore` setting is no longer migrated to the restore toggle (set the toggle once if it was `true`), and the recent-searches list is gone`. Say the list is gone, not the setting: `nuiget.recentSearchesLimit` is deprecated at P5.13 and removed at P8.2 (tracker:86).
8. ARCHITECTURE.md, `## 2.0 Architecture (in progress)` only: in the `src/extension.next.ts` row (`:107`) replace "(the 1.x key `nuiget.sdkVersionCache` is removed at activation)" with one sentence that `sweepLegacyState` (`src/host/legacyState.ts`) runs first and removes the eight 1.x `nuget.*` keys, `nuiget.sdkVersionCache` and the `nuiget.cache.*` entries the `TieredCache` index does not list, migrating nothing (ADR-000); add one clause to the `src/core/cache/**` row (`:86`) for `orphanedStoreKeys`; mention the module in the `src/host/**` row.
9. `docs/plans/findings-ledger.md`: add N78: the plan's "9 legacy `nuget.*` keys" is 8 on `main` and `labs/2.0` (the `git grep` above), and `TieredCache` never reads the store's `keys()`, so pre-2.0 `nuiget.cache.*` entries were unreachable until this sweep. Cite P7.1, ADR-000, N78 in the commit.
10. Handoffs in the STATUS notes: README.md:60 ("The legacy `nuiget.noRestore` setting is migrated automatically on first activation") becomes false with this item; README 2.0 is P7.5's, leave it and name it there. Rewrite `src/host/STATUS.md` and `src/core/cache/STATUS.md` (§2.5), paste this ruling under Advisor decisions in `src/host/STATUS.md`, list the rewritten test of step 6 by old and new title, and close the P7.1 row with the 8-vs-9 note.

DO NOT:
Do not add `keys()` to `KeyValueStore` in `src/core/contracts.ts` or any other contract file (D6); type the store structurally in the helper.
Do not write `'nuiget.cache.'` or `'__index__'` anywhere outside `src/core/cache/TieredCache.ts`; a copy in the host is the "deletes live 2.0 state" failure the moment either constant changes.
Do not delete by the prefix `nuiget.cache.` alone, and do not run the orphan step after `new TieredCache(...)`.
Do not sweep `nuiget.layout.splitPosition`, `nuiget.layout.sidebarSectionSplit`, `nuiget.selectedProject`, `nuiget.selectedSource`, `nuiget.includePrerelease`, `nuiget.restoreEnabled` or `nuiget.sdkVersionCache.v2`.
Do not migrate `nuget.selectedProject`, `nuget.selectedSource`, `nuget.includePrerelease` or `nuget.restoreEnabled` into their `nuiget.*` successors (ADR-000:21).
Do not add a `nuiget.legacySwept` marker key or any once-only guard.
Do not invent a ninth `nuget.*` key to match the plan, and do not count `nuiget.noRestore` (a setting) or `nuiget.layout.*` (2.0's) as one.
Do not add a second SDK-floor `**Breaking:**` line, and do not say `nuiget.recentSearchesLimit` is removed.
Do not touch README.md, `package.json` `contributes`, `src/extension.ts` or anything under `src/services/**`.
Do not let `sweepLegacyState` throw or leave activation hanging on a rejected `update`: `allSettled` and a warn log.

CONTRACT CHANGE: none. `src/core/contracts.ts`, `src/protocol/**` and `docs/adr/**` stay as they are; the helper's store type is a local structural type in `src/core/cache/TieredCache.ts`.

VERIFY: `grep -rn "LEGACY_SDK_CACHE_KEY\|'nuiget.sdkVersionCache'" src/extension.next.ts` → nothing; `grep -rn "__index__\|'nuiget.cache.'" src --include='*.ts' | grep -v "\.test\."` → lines in `src/core/cache/TieredCache.ts` only; `grep -n "keys()" src/core/contracts.ts` → nothing; `grep -c "nuget\." src/host/legacyState.ts` lists the eight `nuget.*` keys and `nuiget.sdkVersionCache` once each; `npx vitest run --project backend src/host/legacyState.test.ts src/core/cache src/extension.next.test.ts` → green with the five new host tests, the new cache test and the rewritten root test present by title, exit code 0; then `npx tsc --noEmit` → 0, `npm run check-types` → 0, `npx eslint src` → 0/0, `npm test` → green (≥ 3396 + 6 new), `npm run bench` → green, `NUIGET_V2=1 npm run package:vsix` and `npm run check:vsix` → green, `node esbuild.mjs --v2 --production --analyze` → extension bundle ≤ 299921 bytes (expected within about 1 KB of 291154; a crossing is a stop-and-ask with the delta); `grep -c "^- \*\*Breaking:\*\*" CHANGELOG.md` under `## [Unreleased]` → 3 (SDK floor, storage reset, removed migration); `git grep -ohE "['\"]nuget\.[A-Za-z]+['\"]" HEAD -- src ':!src/**/*.test.*' | sort -u | grep -v "nuget.config\|nuget.org" | wc -l` → 8, matching N78.

Files checked: docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:41-160,300-325 (D6, D12, D13, §2.1-2.6, §3, P7.1 row); docs/plans/STATUS.md rows P7.1:100, P5.13:86, P6.5:98, P2.10:49; docs/adr/000-release-and-compatibility-policy.md (whole file, :19-22 and the Consequences on `**Breaking:**`); docs/adr/001-session-store.md:7-29; src/extension.next.ts:1-120; src/extension.next.test.ts:1-148,618-634 and the title list; src/core/session/SessionStore.ts:1-70; src/core/cache/TieredCache.ts:30-70,140-160,232-300,340-370; src/core/cache/CachePolicy.ts:50-95; src/core/cache/index.ts; src/core/cache/cache.test.ts titles 242-391; src/core/contracts.ts:31-35; src/host/handlers.ts:235-256; src/host/services.ts imports; src/host/STATUS.md:145-147; src/services/WorkspaceCache.ts:1-60,160-245; src/services/NuGetCliService.ts:60-180; src/services/NuGetPackageService.ts (workspaceCache.set sites); src/extension.ts:31,70-100; src/webview/NuGetPanel.ts and NuGetSidebarPanel.ts key sites (grep); src/test/__mocks__/vscode.ts:335-375; src/test/harness/harness.ts:140-156; CHANGELOG.md `## [Unreleased]`; README.md:56,60; ARCHITECTURE.md:10,86,107,195; package.json:272; docs/plans/findings-ledger.md (last id N77); `git grep` of `nuget.*` keys on `main` and `labs/2.0`.
`````

## Exact next step (one item ID)

P7.2.

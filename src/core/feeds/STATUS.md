# STATUS — src/core/feeds   commit 8a15d81 (parent of the P4.3 commit)   2026-10-15T02:30:00Z

git status --porcelain --untracked-files=all src/core/feeds: `?? src/core/feeds/` (`types.ts`, `wire.ts`, `relevance.ts`,
`health.ts`, `serviceIndex.ts`, `flatContainer.ts`, `index.ts`, `testSupport.ts`, the five `*.test.ts`, `__fixtures__/` with
two JSON files, this note), with ` M CHANGELOG.md`, ` M ARCHITECTURE.md`, ` M docs/plans/STATUS.md`,
` M docs/plans/findings-ledger.md` (all belong to the P4.3 commit)

Item: **P4.3 Feeds A**: `wire`, `relevance`, `health`, `serviceIndex`, `flatContainer` + tests on tracked fixtures; `icon()`
distinguishes missing vs failed. A salvage item (plan §3 gate): the six files (`types.ts` is the module's type surface, which
the five import) were copied from the quarry working tree, `cmp` identical, and compiled and linted clean against the real
`contracts.ts`, `cache`, `versioning` and `protocol` as copied. The quarry has two notes in its `src/core/feeds/STATUS.md`
("feed clients A" and "B"); checked against its tree they are stale: `relevance.ts`, `health.ts`, `serviceIndex.ts` and
`flatContainer.ts` exist although note A lists them as not started; no test exists for any of the five; the only fixtures are in
the gitignored `__fixtures__/.scratch` (no decision may rest on them, plan §2.6). Not ⚑; no contract change, no sentinel.

## Verified by running

```text
baseline (at 8a15d81) npx tsc --noEmit / npx eslint src / npx vitest run → exit 0 / exit 0 / green (122 files)
raw copy                     → cmp identical (6 files) · npx tsc --noEmit exit 0 · npx eslint src/core/feeds exit 0
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each
npx vitest run --project backend src/core/feeds → Test Files 5 passed (5) · Tests 33 passed (33): wire 7, relevance 2,
                               health 5, serviceIndex 13, flatContainer 6
src/core/feeds, 40 times in a row → 40 of 40 green
negative control             → 5 mutations of the item's changes (the icon's missing/failed split twice, the caller's own
                               abort, a pre-aborted first caller emptying the shared discovery, a cancelled transport
                               answer counted as a failure): first run 3 caught; tests added for the two survivors; 5 of 5
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 127 passed (127) · Tests 2864 passed (2864)
npm run bench               → Test Files 19 passed (19) · Tests 114 passed | 1 skipped (115) (no bench is the row's)
npx vitest run --coverage    → exit 0 · src/core/** 3338 of 3447 lines, 96.84 % (floor 85) · lines/branches: wire 91.17/87.5,
                               relevance 100/85.71, health 94.44/81.57, serviceIndex 96.55/90.69, flatContainer 87.95/79.78
npm run package:vsix, check:vsix, docs:protocol:check, test:ui, test:ui:v2 → SKIPPED: no host, extension, packaging, protocol
                               or webview file changed; nothing outside src/core/feeds imports the feeds before P4.9
```

## Done (tested)

- `serviceIndex.ts`: `selectEndpoints` on the tracked fixtures (nuget.org's real index: `registration5-semver1`, never a `-gz-`
  hive; a private feed with versionless types and only a gzip registration besides the plain one), `serviceIndexUrl`,
  `hasUsableEndpoint`; `DefaultServiceIndexClient`: one discovery per source for concurrent callers, 10 min success cache,
  failures into `SourceHealth` for the failure TTL (`resolve` leaves the source out meanwhile), a non-V3 document is a failure,
  credentials attached and a throwing provider ignored, `probe` past the caches, `clearCaches`; **changed**: the shared
  discovery runs without any caller's signal (its own 5 s timeout bounds it) and each caller races only its own abort, so a
  caller that cancels, or comes with an aborted signal, does not empty the answer for the others; a cancelled transport answer
  records no failure.
- `flatContainer.ts`: URLs with the lower-cased id and the lower-cased normalized version; `versionIndex` (`[]` for 404,
  `undefined` on failure or a malformed index), `nuspec` (BOM stripped), `packageSize` (HEAD, Content-Length), `downloadPackage`
  (temp file under the cap); **changed**: `icon()` returns `IconFetch`: `found` with the body, `missing` for 404, 410, too large,
  an empty or non-image body or no flat container, `failed` with a reason for network, timeout, 5xx, 429 and cancellation.
- `health.ts`: `SourceHealthTracker` (TTL, `failed()`, `markHealthy`, `reset`) and `startHealthMonitor` (enabled remote sources
  only, failed and healthy intervals, `restart` aborts the pass in flight and keeps one schedule, `dispose`, a pass whose source
  list cannot be read is logged and retried) with fake timers.
- `relevance.ts`: the five tiers and the stable sort by tier, then downloads. `wire.ts`: the camel- and Pascal-case readers,
  authors, icon URLs, request helpers, `redactUrl`, `mapWithConcurrency`.
- `index.ts` barrel; `testSupport.ts` with `FakeTransport` (not exported).

## Done (untested)

- `consoleFallbackLogger` (used only when no logger is passed; the composition root passes one at P4.9).
- `downloadPackage`'s write failure branch (a temp directory that refuses the file).

## Not started

- `icons.ts`, `readme.ts` (P4.4), `nuspec.ts`, `offline.ts` (P4.5), `search.ts` (P4.6), `registration.ts`,
  `vulnerability.ts` (P4.7), `updates.ts` (P4.8); wiring into the Catalog and the composition root (P4.9). The quarry's
  `icons.ts` consumes the old `icon()` shape; P4.4 adapts it to `IconFetch` and caches `missing` only (C-feeds-2).

## Deviations from contract/ADR (file:line each)

- `types.ts` is copied although the row names five files: it is the module's own type surface, which all five import; it is not
  a frozen contract. One change in it: `FlatContainerClient.icon` returns the new `IconFetch` union.
- `index.ts` (barrel) and `testSupport.ts` are new, as for `src/core/http` and `src/webview/shared/bus`.
- `serviceIndex.ts`: the in-flight change is not in the row; it fixes the shared-query cancellation defect found while
  reading the copy (the harness's `shared query with one subscriber cancelling` is the same rule for the coordinator).
- Fixtures: `__fixtures__/nuget-org-service-index.json` is the quarry's gitignored capture of nuget.org's public service index,
  promoted unchanged (public data, nothing to redact); `private-feed-service-index.json` is written for the tests.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-15, P4.3: no L1 consultation (the item is not ⚑ and no stop-and-ask trigger fired).

## Exact next step (one item ID)

P4.4 (Feeds B: `icons`, `readme` through the gate; `TieredCacheIconCache` adapter; no 24 h miss on a transient outage, which
`IconFetch` now makes possible; the `readme/image` fetch).

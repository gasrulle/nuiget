# STATUS — src/core/cache   commit 25e9a82 (parent of the P1.4 commit)   2026-10-12T12:54:23Z

git status --short src/core/cache src/test/benchmarks: `?? src/core/cache/`,
`?? src/test/benchmarks/core-cache.bench.ts` (both belong to the P1.4 commit, together with ` M CHANGELOG.md`,
` M ARCHITECTURE.md`, ` M docs/plans/STATUS.md` and ` M docs/plans/findings-ledger.md`)

Item: **P1.4 `src/core/cache/**`** with `deleteByPrefix`, `clearPackages`, `invalidationToCacheScopes`, the
byte budget for persisted entries, and a bench. The quarry has no `STATUS.md` for this directory; its tree was
read instead: `CachePolicy.ts`, `LruMap.ts`, `TieredCache.ts`, `index.ts` and `cache.test.ts`, committed in
`f837f34` and unchanged since. They import `../contracts` (types) and each other only.

## Verified by running

```text
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0, no output
baseline npx vitest run      → Test Files 51 passed (51) · Tests 1713 passed (1713)
copy from the quarry tree    → cmp: all five files identical to the quarry working tree
unmodified copy              → npm run check-types exit 0 · npx eslint src/core/cache exit 0 ·
                               Test Files 1 passed (1) · Tests 32 passed (32) ·
                               grep Thenable: cache.test.ts:18 (the test helper)
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output
npm run lint                 → exit 0
npx vitest run --project backend src/core/cache → Test Files 1 passed (1) · Tests 47 passed (47)   (item gate)
npm test                     → Test Files 52 passed (52) · Tests 1760 passed (1760)
npx vitest run --coverage    → exit 0 · All files 73.51 % statements, 62.72 % branches, 67.96 % functions,
                               75.09 % lines · src/core/cache 98.63 / 93.28 / 100 / 98.63 ·
                               src/core/util 99.28 / 92 / 100 / 99.27 · src/core/versioning 96.38 / 92.97 /
                               100 / 96.15 (floor for src/core/**: 85 % lines)
npm run bench                → Test Files 16 passed (16) · Tests 101 passed | 1 skipped (102); the output lists
                               "✓ |backend (bench)| src/test/benchmarks/core-cache.bench.ts (8 tests)"
bench type check             → npx tsc --ignoreConfig --noEmit --strict --noImplicitReturns --module esnext
                               --moduleResolution bundler --target ES2022 --lib ES2022,DOM --jsx react-jsx
                               --esModuleInterop --skipLibCheck --resolveJsonModule
                               --types node,vitest/globals src/test/benchmarks/core-cache.bench.ts
                               src/global.d.ts → exit 0
git status --short benchmarks/baseline.json → empty
npm run package:vsix         → exit 0 · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 528.32 KB)
npm run check:vsix           → check:vsix: OK
grep Thenable, vscode, child_process in src/core/cache → no match
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P1.4
```

## Done (tested)

- Salvaged unchanged: `LruMap.ts`; the lifetimes, key builders and scopes of `CachePolicy.ts`; the two-tier
  behaviour of `TieredCache.ts`. The quarry's 32 tests pass as written.
- `TieredCache.deleteByPrefix(prefix)`: removes the matching keys from both tiers and returns how many keys
  that were; an empty prefix removes nothing. `clear(scope)` uses it.
- `TieredCache.clearPackages(packageIds)`: removes the `versions:`, `lite:` and `metadata:` entries of the given
  ids for every source, case-insensitively; blank ids are skipped. The prefixes come from
  `packageKeyPrefixes(packageId)` in `CachePolicy.ts`.
- `invalidationToCacheScopes(scope)` in `CachePolicy.ts`: returns `{ scopes, packageIds }` for an
  `InvalidationScope` of the protocol.
- Byte budget: `TieredCacheOptions.maxStoreBytes`, default 8 MiB, over the whole persistent tier. The size of an
  entry is the UTF-8 length of its JSON text. Writes and the load of an existing store enforce it with the
  eviction order the module already had. `TieredCache.persistedBytes` reports the total.
- 15 new tests in `cache.test.ts`:
  - `packageKeyPrefixes covers versions, lite and metadata of one id and stops at its delimiter`
  - `invalidationToCacheScopes maps every invalidation scope`
  - `invalidationToCacheScopes never selects icons or readmes`
  - `deleteByPrefix removes matching keys from both tiers and reports the count`
  - `deleteByPrefix counts a key once, finds entries that are only persisted, and ignores an empty prefix`
  - `clearPackages drops versions, lite and metadata of the given ids for every source`
  - `clearPackages keeps icons and readmes of the package and ignores blank ids`
  - `accounts for the persistent tier in UTF-8 bytes of the stored JSON`
  - `keeps the persistent tier within the byte budget, evicting the soonest-expiring entries first`
  - `evicts the oldest permanent entry when permanent entries exceed the byte budget`
  - `does not persist an entry that is larger than the whole budget and evicts nothing for it`
  - `removes the stored copy when a persisted key is overwritten by an entry over the budget`
  - `keeps a value without a JSON form in memory only`
  - `counts the entries it finds in the store on load and trims a store that exceeds the budget`
  - `defaults to a budget of 8 MiB, so 256 KB icons cannot fill the store entry by entry`
- `src/test/benchmarks/core-cache.bench.ts`: 8 benchmarks (memory tier, written-through writes, invalidation).

## Done (untested)

- Nothing imports the module yet. Its first consumers are the feeds (P4.3, P4.4) and the composition root
  (P2.10, `new TieredCache({ store, logger })`).
- Three lines of the quarry's own code have no test (`TieredCache.ts:275-276` and `:365`, the guard for an entry
  that changed in the store after load and the guard for a missing store).

## Not started

- Nothing calls `invalidationToCacheScopes` or `clearPackages` yet. The host that applies an invalidation to the
  cache arrives with P2.9 and P2.10; the function only says what to drop.
- `benchmarks/baseline.json` has no entries for the new bench file (P2.12). The informational CI job fails on
  its keys until then, as for P1.3.
- Icons do not go through this cache yet: `MemoryIconCache` until P4.4 (`TieredCacheIconCache`).

## Deviations from contract/ADR (file:line each)

The four additions are new code: the quarry has none of them and no call site names them
(`grep -rn 'deleteByPrefix\|clearPackages\|invalidationToCacheScopes'` over the quarry's `src` finds nothing).
The choices and what each rests on:

- "8 MB byte budget for persisted entries" is read as a limit on the total of the persistent tier, not per
  entry. Plan Appendix B names the defect as "icon data URIs persisted up to ~128 MB", which is the quarry's
  limit of 500 entries times the 256 KB cap for an icon (ADR-006); only a total bounds that. The number is
  8 × 1024 × 1024 bytes, binary like the "10 MiB" in `src/core/contracts.ts` (`TransportRequest.maxBytes`).
- The size is measured on the JSON text of the stored entry (`TieredCache.ts:56-66`), because the store behind
  `KeyValueStore` is VS Code's `Memento`, which keeps JSON. A value without a JSON form is kept in memory only.
- An entry larger than the whole budget is not persisted, and nothing is evicted for it
  (`TieredCache.ts:286-295`): evicting everything else would still not make room.
- `invalidationToCacheScopes` (`CachePolicy.ts:158-180`): `workspace` and `sources` map to the cache scopes
  `network` and `sources`, `package` and `metadata` to the named packages, `project` to nothing. ADR-002's
  table lists resource keys; this is the corresponding statement for feed data. `sources` drops all feed
  data, not only versions and metadata, because a changed feed list or credential can change search results
  and vulnerability data as well. No mapping drops icons or READMEs: their keys carry an exact version, and
  dropping them on every refresh would refetch every icon. The cache scope `all` is therefore never returned.
  A consequence for later items: a manual refresh leaves a cached `iconMissing` entry in place for its 24
  hours. The host that wires the refresh (P4.9) either calls `clear('icons')` itself, or relies on P4.4 never
  caching a transient miss.
- `clearPackages` does not drop `search:` entries. A search key carries the query, not a package id; search
  entries live 2 minutes.
- `TieredCache.stats()` is unchanged, because a quarry test asserts its exact shape; the byte total has its
  own property.
- `src/core/cache/cache.test.ts:26`: the test helper returns `PromiseLike<void>` instead of `Thenable<void>`
  (plan §3, salvage gate 5). It is the only line of the quarry's tests that changed.
- `TieredCache.ts:293`: the debug line for an entry that is not persisted names the kind of the key only. A
  key carries a source URL, and redaction arrives with P1.5. The quarry's existing warning for a failed store
  write (`:369-372`) logs the whole key; P1.5 decides about it.
- The bench file is under `src/test/benchmarks/` (N40) and binds the functions once, as in P1.3; it prints no
  module-getter warning.

## Advisor decisions (date, item, question, answer verbatim)

The item is not ⚑ and no stop-and-ask trigger fired: no frozen file is involved, no test of the quarry had to
change beyond the gate-mandated `PromiseLike`, and no call site contradicts the shapes chosen above. No
consultation of the `architecture-advisor` took place for it.

## Exact next step (one item ID)

P1.5 (`src/core/logging/**` with `redact.test.ts`).

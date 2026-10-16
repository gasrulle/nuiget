# STATUS — src/core/feeds   commit 1d76a1a (P9.0; parent of the P9.1 commit)   2026-10-16T19:20:00Z

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `docs/plans/STATUS.md`,
`src/core/catalog/{feedClients,feedClients.test}.ts`, `src/core/feeds/{flatContainer,flatContainer.test,icons,icons.test,search,types}.ts`,
`src/core/feeds/STATUS.md`, `src/test/ui/v2/STATUS.md` (P9.0's `viewed:` lines); new
`src/webview/shared/{packageIcon,packageIcon.test}.ts`

Item: **P9.1** — icon pipeline (parity audit DP3 in part, DP4, DP5 and MB2 for the helper). This note replaces the
folded notes of this directory (history at `756dcd1`).

## Verified by running

```text
baseline (1d76a1a)          → npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npx vitest run exit 0
npx tsc --noEmit            → exit 0
npm run check-types         → exit 0
npx eslint src              → exit 0
npm run lint                → exit 0
npx vitest run --project backend src/core/feeds → Tests 176 passed | 1 skipped (177)
npx vitest run --project backend src/core/catalog/feedClients.test.ts → Tests 2 passed (2)
npx vitest run --project frontend src/webview/shared/packageIcon.test.ts → Tests 1 passed (1)
npm test                    → exit 0 · Test Files 130 passed (130) · Tests 1914 passed | 9 skipped (1923)
npm run bench               → exit 0
rm -rf dist out/esbuild && node esbuild.mjs --production --analyze → exit 0 · dist/extension.js 293359 / 322502 ·
                              dist/webview.js 525241 / 577766 · dist/sidebar.js 319313 / 351245 (webview and sidebar
                              unchanged: the helper is imported by no entry yet)
npm run package:vsix        → exit 0 · Packaged: nuiget-v2.0.0.vsix (17 files, 564.88 KB)
npm run check:vsix          → check:vsix: OK
npm run docs:check          → exit 0 · docs:protocol:check — docs/protocol.md is up to date.
NUIGET_SDK_TESTS=1 run of src/core/cli → SKIPPED: nothing under src/core/cli changed and no code that runs dotnet
```

## Done (tested)

- `types.ts`: `IconFetch` `missing` may carry `unusable: true`. Bare `missing` still means "404/410, or no flat
  container"; the shape keeps every existing fake and assertion meaning what it meant.
- `flatContainer.ts`: `too-large`, an empty body, an oversized body and a body that is not an image answer
  `{ kind: 'missing', unusable: true }`; 404 and 410 answer bare `missing`; everything else stays `failed`.
- `icons.ts`: the breaker counts only bare `missing`. `failed`, a thrown error and an unusable answer never count; a
  found icon and an unusable answer clear the count (the feed answered); `reset()` (the `sources`/`workspace`
  invalidation through `FeedContexts.clear()`) is unchanged. Caching is unchanged: a found icon kept, any answered miss
  24 h, a failure nothing.
- `search.ts`: `toLiteMetadata(row)` (the lite fields of a search row), used by `lookup` and by `liteLookup`.
- `src/core/catalog/feedClients.ts` `liteLookup` (the function the plan row names): asks `searchById`; `found` and
  `missing` are cached under `lite` as before, `failed` returns `undefined` and stores nothing, so no failure is
  persisted.
- `src/webview/shared/packageIcon.ts`: `defaultPackageIcon()` reads `data-package-icon` from the element that carries
  it (`root` or `sidebar-root`) once it is found; `packageIconSrc(iconUrl)` is `iconUrl` when it is a `data:` URI and
  the default otherwise. The row says `iconUrl ?? default`; the `data:` check is the reading under the CSP
  (`img-src ${cspSource} data:`, ADR-006) and matches `BrowseList.tsx`. Nothing imports it yet: P9.3 and P9.4 wire it.
- Tests: `icons.test.ts` "breaker ignores transport failures and answers that are no usable icon: only "not found"
  counts (P9.1)" and "breaker resets on success: an icon or any answer other than "not found" clears the count
  (P9.1)"; `flatContainer.test.ts` asserts `unusable` for huge, empty and HTML and its absence for 404 and 410;
  `feedClients.test.ts` "transient lookup failure is not cached: a source that could not answer is asked again, and
  nothing is persisted (P9.1)"; `packageIcon.test.ts` "default icon used when no iconUrl: the root's
  data-package-icon, read once".
- Test fake adapted, assertions unchanged: `feedClients.test.ts` "liteLookup caches a lookup answer and a miss per
  source under the lite kind and asks again after the lifetime" now fakes `searchById` (`found`/`missing`) instead of
  `lookup`.

## Done (untested)

- None.

## Not started

- Rows that use the helper: P9.3 (Installed), P9.4 (Updates), P9.6 (Browse).

## Deviations from contract/ADR (file:line each)

- None against a contract (`types.ts` is the module's own surface; nothing under `src/protocol`, `contracts.ts` or
  `docs/adr`). The row's inputs say `core/feeds`; `liteLookup` lives in `src/core/catalog/feedClients.ts` and is
  edited because the row names it.
- Residue of DP3: five consecutive real 404s from one source (private package ids asked of nuget.org in a workspace
  without package source mapping) still skip that source until a Refresh or a source change. The row specifies this
  breaker; the audit's time window or "never suppress a source that has found an icon" is not in it.

## Advisor decisions (date, item, question, answer verbatim)

- 2026-10-16, P9.1: the ambient advisor before the edits (shape of the marker on `missing`, `liteLookup` as a named
  source, the `data:` reading, the memoized read). Not ⚑, no stop-and-ask trigger.

## Exact next step (one item ID)

P9.2 (⚑: consult the `architecture-advisor` before coding).

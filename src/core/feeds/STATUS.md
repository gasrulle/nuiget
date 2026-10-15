# STATUS — src/core/feeds   commit b0b0046 (parent of the P4.7 commit)   2026-10-16T01:40:00Z

git status --porcelain --untracked-files=all (before the commit): `?? src/core/feeds/{registration,vulnerability}.ts` and their two
`*.test.ts`, ` M src/core/feeds/types.ts`, ` M src/core/feeds/index.ts`, ` M src/core/feeds/STATUS.md`, ` M CHANGELOG.md`,
` M ARCHITECTURE.md`, ` M .github/copilot-instructions.md`, ` M docs/plans/STATUS.md` (all belong to the P4.7 commit)

Item: **P4.7** `registration.ts` (listed-only) + `vulnerability.ts` + tests. Source "legacy → core/feeds": new code after the
1.x paths (`src/services/NuGetPackageService.ts:203-284` versions, `:322-410` vulnerabilities, `:1749-1860` registration
metadata); the quarry has neither file. Not ⚑, no stop-and-ask trigger. No contract change, no sentinel (`types.ts` is the
module's own surface).

## Verified by running

```text
baseline at b0b0046         → CI run 38659077468 green on all 11 jobs · npm run check-types 0 · npx eslint src 0 · npx vitest run
                               green (133 files, 2957 passed, 4 skipped: the real-SDK tests without NUIGET_SDK_TESTS)
npx tsc --noEmit → exit 0 · npm run check-types → exit 0 (root, test and vitest configs; N69) · npx eslint src → exit 0
npx vitest run --project backend src/core/feeds → Tests 145 passed | 1 skipped (146); the item's: registration 9, vulnerability 7
registration and vulnerability tests, 40 times in a row → 40 of 40 green
negative control             → 26 mutations (registration: prerelease filter, dedupe, sort, policy in versions and in metadata,
                               failed is undefined, version fallback, listed filter, leaf listed flag, index failure, page
                               failure, catalog-entry failure, summary fallback, dependency version, leaf first, normalized
                               version match; vulnerability: clamp, dedupe, TTL, shared download, partial page, page without
                               URL, compressed, unavailable flag, record validation, no cache on failure): 25 caught; the last
                               is equivalent (a failed load stored as `undefined` is read as absent: `cached && …`)
coverage (feeds only)        → registration.ts 98.09/89.74, vulnerability.ts 100/93.1 (lines/branches)
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 135 passed (135) · Tests 2977 passed (2977)
npm run bench               → Test Files 19 passed (19) · Tests 114 passed | 1 skipped (115) (no bench is the row's; P4.10)
git diff --name-only -- src/protocol src/core/contracts.ts docs/adr → empty
npm run package:vsix, check:vsix, docs:protocol:check, test:ui, test:ui:v2 → SKIPPED: no host, extension, packaging, protocol
                               or webview file changed; nothing outside src/core/feeds imports these clients before P4.9
```

## Done (tested)

- `registration.ts`: `DefaultRegistrationClient.versions` — listed-only from `searchById` (`failed` → `undefined`, `missing` → `[]`,
  `found` → its versions or its one version), or, without a search service, from the registration index without leaves marked
  `listed: false` on the leaf or the catalog entry (inline pages, pages behind a URL, catalog entries behind a URL; any part that
  fails makes the answer `undefined`, an unknown package `[]`); every version (unlisted included) from the flat-container index
  when `listedOnly` is false; distinct by normalized version, prereleases only when asked, newest first; the policy asked before
  any request (`[]` when refused). `metadata` — the registration leaf (`<id>/<normalized version>.json`) and its catalog entry,
  else the index matched by normalized version; `registrationToMetadata` (summary as description fallback, authors joined,
  license expression, dependency ranges with `version` and `*` fallbacks, `Any` framework, `published`, `sourceUrl`).
- `vulnerability.ts`: `DefaultVulnerabilityClient.forPackage` answers `{ vulnerabilities, sourcesUnavailable }`; one download per
  source shared by concurrent callers and run without any caller's signal (a caller that gives up gets an unavailable answer at
  once, the others the data); data kept for `ttlFor('vulnerability')` only when the index and every page loaded; `clear()`;
  `acceptCompressed`, `MAX_VULNERABILITY_BYTES` (64 MiB) and a 60 s timeout; advisories matched with `satisfiesText`, deduplicated
  by URL across sources; invalid records dropped; `vulnerabilitySeverity` clamps numbers outside 0-3 (decision: an advisory with a
  severity this client does not know is shown, never ranked below what it says; 1.x mapped every unknown number to Low).
- `types.ts`: `VulnerabilityOutcome`, the new return type of `forPackage`.

## Done (untested)

- `registration.ts:172-174` (a defensive guard; both callers check the registration endpoint first) and `:211` (a leaf without a
  catalog entry that carries its own version).

## Not started

- `updates.ts`, `enricher.ts`, `metadataResolver.ts` (P4.8: also the ⚑ questions whether free-text search rows and the local
  vulnerability lookup honour the package source mapping); wiring through the coordinator and the composition root (P4.9).

## Deviations from contract/ADR (file:line each)

- `types.ts:118-132`: `VulnerabilityClient.forPackage` answers `VulnerabilityOutcome` instead of `PackageVulnerability[]`, the same
  "empty is not unknown" step the P4.6 ruling took for search (no implementer or consumer existed).

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P4.7: no L1 consultation (not ⚑, no stop-and-ask trigger). Ambient advisor before writing: the vulnerability return
shape → `{ vulnerabilities, sourcesUnavailable }` (the protocol's `vulnerabilities?` is optional, so the enricher must tell unknown
from none); listed-only versions branch on the search endpoint before calling `searchById`; cache a source's vulnerability data
only when the index and every page loaded; an explicit size cap above the transport's 10 MiB default; no policy filter on the
download (no id is sent), the lookup question recorded for P4.8. The P4.4 and P4.6 rulings of this directory are in
`docs/plans/STATUS.md` under "Advisor decisions".

## Exact next step (one item ID)

P4.8 (⚑ on policy edge cases: `updates.ts`, `enricher.ts`, `metadataResolver.ts`, `index.ts`; test `private-only configuration
never contacts nuget.org`).

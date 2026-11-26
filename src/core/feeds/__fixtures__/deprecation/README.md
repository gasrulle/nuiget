# Deprecation fixtures

Fixtures of UX-P5.2a (architecture-advisor ruling of 2026-11-26, DO 10) for the `deprecation` object NuGet sends on a search
entry and on a catalog entry: `reasons` (required), `message` and `alternatePackage { id, range }`.

- `search-entry.json`, `registration-leaf.json` and `catalog.json` are hand-minimised from the documented shapes, read on
  2026-11-26: "Search result" and "Package deprecation" of
  <https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource>, and "Package deprecation" and "Alternate
  package" of <https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource>.
- `real/` holds one capture of nuget.org for `WindowsAzure.Storage` 9.3.3 (deprecated as `Legacy`, alternate
  `Azure.Storage.Common`), written by `node scripts/capture-feed-fixture.mjs WindowsAzure.Storage 9.3.3` on 2026-11-26 and
  trimmed to the fields nUIget reads. It is evidence that the wire names hold on nuget.org's leaf path: the leaf names the
  catalog document by URL, and the catalog document and the search entry carry the same `deprecation` shape and reason word.

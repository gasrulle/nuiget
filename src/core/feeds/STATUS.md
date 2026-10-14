# STATUS — src/core/feeds   commit aa42f07 (parent of the P4.5 commit)   2026-10-15T23:50:00Z

git status --porcelain --untracked-files=all (before the commit): `?? src/core/feeds/{nuspec,offline}.ts` and their two
`*.test.ts`, `?? src/core/feeds/__fixtures__/newtonsoft.json.13.0.3.nuspec`, ` M src/core/feeds/index.ts`,
` M src/core/feeds/STATUS.md`, ` M CHANGELOG.md`, ` M ARCHITECTURE.md`, ` M .github/copilot-instructions.md`,
` M docs/plans/STATUS.md`, ` M docs/plans/findings-ledger.md` (all belong to the P4.5 commit)

Item: **P4.5** `nuspec.ts` + `offline.ts` + tests. Source `—`: new code. The quarry has neither file (its feeds note B lists
`offline.ts` as not started and says `nuspec.ts` did not exist). Not ⚑, no stop-and-ask trigger; the ambient advisor was asked
about the entity policy and the path guard before writing. No contract change, no sentinel.

## Verified by running

```text
baseline at aa42f07         → CI run 38653195633 green on all 11 jobs · npx tsc --noEmit 0 · npx eslint src 0 · npx vitest run
                               green (130 files, 2916 passed, 3 skipped: the real-SDK tests without NUIGET_SDK_TESTS)
npx tsc --noEmit → exit 0 · npx eslint src → exit 0, no output
npx vitest run --project backend src/core/feeds → Test Files 10 passed (10) · Tests 105 passed (105); the item's: nuspec 9,
                               offline 8
src/core/feeds, 40 times in a row → 40 of 40 green (offline.test.ts does real file I/O in a scratch directory)
negative control             → 16 mutations: nuspec (DOCTYPE refusal, size cap, validation, license from an expression only,
                               groups preferred over ungrouped, `*` for a missing version, `Any` for a missing framework,
                               numeric entities, version required, BOM strip), offline (validators, path under the folder,
                               is-a-file, byte cap, offline flag, normalized version folder): 13 caught at once; two tests
                               strengthened (malformed XML the parser alone accepts; nothing read for a directory or an
                               oversized file); 15 of 16. The BOM strip survives as an equivalent mutant: the validator and
                               the parser both accept a BOM, the strip only keeps the size cap and the DOCTYPE test exact
coverage (feeds only)        → nuspec.ts 98.27/98.55, offline.ts 97.05/84.37 (lines/branches)
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 132 passed (132) · Tests 2936 passed (2936)
npm run bench               → Test Files 19 passed (19) · Tests 114 passed | 1 skipped (115) (no bench is the row's; P4.10)
npm run package:vsix, check:vsix, docs:protocol:check, test:ui, test:ui:v2 → SKIPPED: no host, extension, packaging,
                               protocol or webview file changed; nothing outside src/core/feeds imports the feeds before P4.9
git diff --name-only -- src/protocol src/core/contracts.ts docs/adr → empty
```

## Done (tested)

- `nuspec.ts`: `parseNuspec` refuses a document with a DOCTYPE (no entity a package declares is ever expanded; an entity bomb
  is a test), one over `MAX_NUSPEC_CHARS` (1 MiB), and one `XMLValidator` rejects (the parser alone reads a mismatched closing
  tag as a valid package); strips a BOM; ignores namespaces; decodes the XML entities and numeric references; requires an id and
  a version; reads title, description, authors, the license from `<license type="expression">` only, licenseUrl, projectUrl,
  iconUrl, readme; keeps every dependency group as declared, an empty one included, with `Any` for a group without a framework;
  reads dependencies outside any group as one `Any` group only when there is no group; a dependency without `version` is `*`
  and one without `id` is dropped (1.x parity, `NuGetPackageService.ts:1631-1670`). `nuspecToMetadata` maps to
  `PackageMetadata` with only the fields present, plus `sourceUrl` or `offline` as given.
- `offline.ts`: `offlineNuspecPath` (`<id>/<normalized version>/<id>.nuspec`, lower case, as the global-packages folder stores
  them) validates with `isValidPackageId`/`isValidVersion`, requires a version that parses, and checks the resolved path stays
  one level per segment under the folder (`isValidPackageId('..')` is true, so the check is load-bearing);
  `OfflineMetadataReader.metadata` with an injected `globalPackagesFolder` (`undefined`, empty or a rejection answers
  `undefined`), `stat` before reading, a byte cap, no read for a directory, `offline: true`, no `sourceUrl`, no cache.
- Fixture `__fixtures__/newtonsoft.json.13.0.3.nuspec`: the public nuspec of Newtonsoft.Json 13.0.3, copied from the local
  global-packages folder unchanged (BOM, the 2013/05 namespace, eight groups, four of them empty; public data, nothing to
  redact). Edge cases are inline in the tests.
- `index.ts` exports both modules.

## Done (untested)

- `nuspec.ts:119`: the parser throwing after the validator accepted the document (not reached with fast-xml-parser 5.11.2).
- `offline.ts:86`: the debug log for a read error other than `ENOENT` (permissions).

## Not started

- `search.ts` (P4.6), `registration.ts`, `vulnerability.ts` (P4.7), `updates.ts`, `enricher.ts`, `metadataResolver.ts` (P4.8,
  which composes `flat.nuspec()` with `parseNuspec` and falls back to `OfflineMetadataReader`); wiring into the Catalog and the
  composition root (P4.9: the root passes `DefaultDotnetRunner.globalPackagesFolder` to the reader).

## Deviations from contract/ADR (file:line each)

- `offline.ts:15-22`: the global-packages folder is an injected function, not `FeedsDeps.runner`: the `DotnetRunner` contract
  (`src/core/contracts.ts:188-194`) has no `globalPackagesFolder`, and widening a frozen contract is not this item's.
- `readme.ts:60` keeps its own `declaredReadmePath` (P4.4's file); `parseNuspec` reads the same `<readme>` element.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-15, P4.5: no L1 consultation (not ⚑, no stop-and-ask trigger). Ambient advisor before writing: entity policy for package
XML and the offline path guard → refuse a DOCTYPE before parsing; inject the folder resolver instead of widening `DotnetRunner`;
validators before the join and a resolved-path check after it; no cache for offline metadata.

Earlier in this directory, kept for the P4 phase review:

2026-10-15, P4.4, stop-and-ask: where the `readme/image` fetch lives while the root has no `Transport` (P2.9 put the handler in
P4.4, P2.10 put the transport in P4.9). Answer, verbatim (its note on the brief: GATE STATUS is "tsc 0 after the IconFetch
adaptation", and the quarry tests are 24 + 21 = 45):

`````text
DECISION: Option A, sharpened. P4.4 writes the README-image fetch as core code in `src/core/feeds` (`readmeImage.ts` + `readmeImage.test.ts`, exported from the barrel), with its own first-hop URL policy because the `Transport` has none; the `readme/image` handler is wired at P4.9 through a new `Catalog.readmeImage` method, so the `REMOVAL GATE: P4.4` comment at `src/host/handlers.ts:303` is re-labelled `REMOVAL GATE: P4.9` and S6 closes at P4.9, not P4.4. Nothing here is OWNER MUST DECIDE.

Brief vs tree, first: the brief is stale in one place. `npx tsc --noEmit` exits 0 at the current working tree; `src/core/feeds/icons.ts:199-209` already consumes `IconFetch` (`failed` → `continue` with no cache entry and no breaker count; `missing` → `null` for `ICON_MISS_TTL_MS`), `TieredCacheIconCache` exists at `icons.ts:85-96` over the `iconFound`/`iconMissing` kinds of `src/core/cache/CachePolicy.ts:37-38`, and `icons.test.ts:300` already carries the C-feeds-2 test. The quarry copies hold 24 (`icons.test.ts`) + 21 (`readme.test.ts`) = 45 `it(` blocks, so the row's "≥ 41" is met before any new test. Correct GATE STATUS in the STATUS record to "tsc 0 after the IconFetch adaptation" when pasting this.

WHY: The P2.9 ruling (tracker row P4.4 note, `docs/plans/STATUS.md:66` and `:1223`) put the handler replacement in P4.4, but the later P2.10 ruling (`docs/plans/STATUS.md:1299-1346`) anchored the transport, its proxy predicate, credentials and the outbound policy in the root at P4.9 (`src/extension.next.ts:72`, `:205`, `:274`), and ADR-009 d.5 (`docs/adr/009-catalog.md:15`) says the feed consumers of policy and credentials "arrive with P4.9"; P2.10 supersedes P2.9 on timing, since a handler cannot fetch without a `Transport`. Option B fails ADR-009 d.1 ("Hosts read through the `Catalog` and nowhere else", `009-catalog.md:11`): a `HostServices.readmeImages?` member is a second read path, and an optional member the root leaves undefined is a stub that hides the gate the plan's gotcha table forbids replacing with a guess. Option C fails ADR-005 (`005-execution-context-and-outbound-policy.md:33-50`): a `NodeTransport` without `proxyConfigured()` and without the `http.*` reset is exactly what P4.1 and P2.10 placed at P4.9, and it would leave two transports. Option D is not a tracker state (RUN.md blocks whole items) and is unnecessary: the row's "`readme/image` fetch (data URI, cap, policy)" names core output (`quarry → core/feeds`), and the fetch is fully testable now with `FakeTransport` (`src/core/feeds/testSupport.ts:21`). One fact the brief did not have and that shapes the fetch: `NodeTransport.fetch` validates the scheme only (`src/core/http/Transport.ts:365-367`) and re-validates addresses for redirect targets only (`:694-709`); the first hop is never checked because configured feeds may legitimately sit on private addresses. An icon URL comes from a configured source's service index; a README image URL comes from untrusted package content, so the image fetch must refuse non-public first hops itself, using the ssrf helpers `src/core/http/index.ts` exports (`classifyAddress`, `isLocalhostName`); core → core is inside the ESLint fence (`eslint.config.mjs:31-32`), and nothing in core imports `../http` yet, so this is the first such import and it is legal. ADR-006 (`docs/adr/006-icons-and-csp.md:18-24`) fixes the cap ("same ... size cap ... as icons" = `MAX_ICON_BYTES`, 256 KiB) and says "fetch in plan item P4.4", which stays true when the fetch is core code.

DO:
1. Keep `icons.ts` and `readme.ts` as they are in the tree (the IconFetch adaptation is done). In `icons.ts`, export the image guard the resolver already has so the image fetch reuses it instead of duplicating `IMAGE_SIGNATURES`: `export function toImageDataUri(contentType: string | undefined, body: Buffer, maxBytes = MAX_ICON_BYTES): string | undefined` (today's `toDataUri` + `imageContentType`, `icons.ts:98-121,264-273`); `toDataUri` becomes a one-line caller. No test of `icons.test.ts` changes.
2. New `src/core/feeds/readmeImage.ts`: `export const MAX_README_IMAGE_BYTES = MAX_ICON_BYTES;` and `export class ReadmeImageFetcher { constructor(transport: Transport, options?: { getAuthHeader?: (sourceUrl: string) => Promise<string | undefined>; cacheCapacity?: number; timeoutMs?: number; logger?: Logger }); fetch(url: string, sourceUrl?: string, signal?: AbortSignal): Promise<string | null>; clear(): void }`. Rules, each one a test in step 4: (a) `null` without a request unless `new URL(url).protocol === 'https:'` (an invalid URL is `null` too); (b) `null` without a request when `bareHostname` is an IP literal whose `classifyAddress` is not `'public'`, or `isLocalhostName(host)`; (c) the `Authorization` header is attached only when `sourceUrl` is given, `getAuthHeader(sourceUrl)` answers, and `new URL(url).origin === new URL(sourceUrl).origin`; otherwise no auth header at all (the transport's same-origin rule covers redirects); (d) the request carries `maxBytes: MAX_README_IMAGE_BYTES` and `timeoutMs`; a `too-large` failure, a non-2xx status, a non-image or empty body, and every transport failure (`network`, `timeout`, `cancelled`, `redirect-blocked`, `too-many-redirects`, `http-error`) answer `null`; (e) only a found data URI is cached, in an `LruMap<string, string>` (`../cache/LruMap`, default capacity 64) keyed by the URL as given; `null` is never cached (a transient outage must not pin a broken image, same rule as C-feeds-2); (f) `signal?.aborted` before the request → `null` without a request; the signal is passed to the transport. Log refusals at `debug` through `redactUrl` of `./wire`; never log the auth header.
3. `src/core/feeds/index.ts`: add `export * from './icons'; export * from './readme'; export * from './readmeImage';` (`testSupport.ts` stays unexported).
4. `src/core/feeds/readmeImage.test.ts` with `FakeTransport`, `describe('ReadmeImageFetcher')`, these exact titles:
   - `it('returns a data URI for an https image under the cap, using the declared image type')`
   - `it('sniffs the image type when the server declares an octet stream')`
   - `it('answers null without a request for an http:, data: or malformed URL')`
   - `it('answers null without a request for a loopback, private or link-local IP literal and for localhost names')`
   - `it('sends the source credential only to the source\'s own origin')`
   - `it('sends no credential to another origin, and none without a sourceUrl')`
   - `it('answers null for an oversized, empty or non-image body such as an HTML login page')`
   - `it('answers null on a transport failure or redirect-blocked and caches nothing, so the next call asks again')`
   - `it('serves a cached data URI without touching the network and evicts beyond the capacity')`
   - `it('answers null without a request when the signal is already aborted')`
   Assert "without a request" through `transport.urls()` being empty; assert the credential through the `headers` the fake received.
5. `src/host/handlers.ts:303`: change only the trailing comment to `// REMOVAL GATE: P4.9 (readme/image answers through Catalog.readmeImage)`. No other host file changes; `handlers.test.ts:245-250` stays true as written.
6. Check N7 (plan Appendix A `:412`, ledger `:109`) against the tree and record the result in the STATUS note with path:line: auth on the README download (`readme.ts:139` `authHeaders(source)`; `flatContainer.ts:149` on the nupkg), entry reads bounded by `header.size` (`readme.ts:191,203`), temp path owned by `flatContainer.downloadPackage` (P4.3). Run `grep -n "authHeaders\|header.size\|unlink" src/core/feeds/readme.ts src/core/feeds/flatContainer.ts` and close N7 only if all three clauses are covered; otherwise mark it partial with the open clause.
7. Docs duties: ledger row S6 (`docs/plans/findings-ledger.md:42`) status cell → "fix landed at P4.4 (`DefaultIconResolver`, `TieredCacheIconCache`, `ReadmeImageFetcher`); closes at P4.9 when the Catalog delivers icons and `readme/image`"; the `.github/copilot-instructions.md` gotcha row "`REMOVAL GATE` comments in `src/host` and the root" → "`handlers.ts` carries five `// REMOVAL GATE: P4.9` lines" (no P4.4), "P4.9 removes them"; tracker row P4.4 note replaced by this ruling's summary; tracker row P4.9 note gains: "`Catalog.readmeImage(url, sourceUrl?, signal)` (ADR-009 d.1 requires one method per read request; P2.8 declared no method for `readme/image` and d.8's list omits it — a one-item list amendment of ADR-009 d.8 is decided at the P4 phase review, under the sentinel if done) built on `ReadmeImageFetcher` with `getAuthHeader` from the project context's credential provider; `handlers.ts:303` becomes `({ url, sourceUrl }, ctx) => ({ url, dataUri: await catalog.readmeImage(url, sourceUrl, ctx.signal) })`; `IconResolver.reset()` and `ReadmeImageFetcher.clear()` in `invalidate`"; P5.7 note gains: "the rewriter keeps 1.x's `upgradeHttpToHttps` (`src/webview/app/markdownSetup.ts:151`) before asking `readme/image`: the host answers `null` for `http:`". CHANGELOG `[Unreleased]` `### Added` one line for the icon resolver, tiered icon cache and README-image fetch; ARCHITECTURE.md 2.0 section row for `src/core/feeds` updated. Do not edit `src/host/STATUS.md` (its grep counts are a historical record of P2.9); the feeds `STATUS.md` records the relabel.
8. Gates in the plan's §2.2 order, then `src/core/feeds/STATUS.md` from the §2.5 template with this answer verbatim, commit citing P4.4, ADR-005, ADR-006, ADR-009, C-feeds-2, S6 (progressed), N7 (as found).

DO NOT:
- Do not add a `readmeImages` or `transport` member to `HostServices` (`src/host/services.ts`), optional or not.
- Do not construct a `NodeTransport` in `src/extension.next.ts` or touch its three P4.9 anchors.
- Do not add a method to `src/core/catalog/Catalog.ts` in this item; `readmeImage` is P4.9's.
- Do not delete the placeholder at `handlers.ts:303` or change its behaviour; relabel the comment only.
- Do not pick a larger cap than `MAX_ICON_BYTES` for README images; that is an ADR-006 amendment, not P4.4's.
- Do not attach a source credential to an image URL on another origin, and do not rely on the Transport for first-hop address checks.
- Do not cache a `null` answer of the image fetch, and do not add a `readmeImage` kind to `CachePolicy.ts` (not the item's file; the LRU is in memory).
- Do not duplicate `IMAGE_SIGNATURES` or the ssrf address classification in `readmeImage.ts`.
- Do not edit `src/protocol/**`, `src/core/contracts.ts` or `docs/adr/**`.

CONTRACT CHANGE: none. `src/protocol/messages.ts:140` already has `readme/image`; ADR-006's "fetch in plan item P4.4" stays true. The one frozen-file question raised for later (ADR-009 d.8's method list lacking `readmeImage`) belongs to P4.9 or the P4 phase review under the sentinel, not to P4.4.

VERIFY: `npx tsc --noEmit` → exit 0; `npx eslint src` → 0; `npx vitest run --project backend src/core/feeds` → all green, ≥ 55 tests (45 quarry + 10 new), and `grep -c "^\s*it(" src/core/feeds/readmeImage.test.ts` → 10 with the titles above present by name; `grep -rn 'REMOVAL GATE: P4.4' src` → no output; `grep -c 'REMOVAL GATE: P4.9' src/host/handlers.ts` → 5; `grep -rn "IMAGE_SIGNATURES\|classifyAddress" src/core/feeds --include='*.ts'` → `IMAGE_SIGNATURES` in `icons.ts` only, `classifyAddress` imported in `readmeImage.ts` only; `git diff --name-only -- src/protocol src/core/contracts.ts docs/adr` → empty; `git status --porcelain --untracked-files=all` after the commit → clean.

FILES CHECKED: /Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md; /Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md (§1 D1-D13, §2.1-2.4, §3, rows P4.1-P4.10 at :255-266, P5.7 at :280, Appendix A N7 at :412); /Users/mattias/github/nuiget/docs/plans/STATUS.md (rows P2.9 :48, P4.3 :65, P4.4 :66, P4.9 :71; P1.1b ruling :557-757; P2.9 ruling :1170-1256; P2.10 ruling :1299-1346); /Users/mattias/github/nuiget/docs/plans/RUN.md (:62-133 blocked semantics); /Users/mattias/github/nuiget/docs/plans/findings-ledger.md (:42, :109, :195, :338); /Users/mattias/github/nuiget/docs/adr/006-icons-and-csp.md (whole); /Users/mattias/github/nuiget/docs/adr/005-execution-context-and-outbound-policy.md (:1-80); /Users/mattias/github/nuiget/docs/adr/009-catalog.md (:11, :15, :18); /Users/mattias/github/nuiget/src/core/feeds/STATUS.md (whole); /Users/mattias/github/nuiget/src/core/feeds/icons.ts (whole, 273 lines); /Users/mattias/github/nuiget/src/core/feeds/readme.ts (whole, 212 lines); /Users/mattias/github/nuiget/src/core/feeds/icons.test.ts and readme.test.ts (titles and `it(` counts); /Users/mattias/github/nuiget/src/core/feeds/types.ts (whole); /Users/mattias/github/nuiget/src/core/feeds/index.ts; /Users/mattias/github/nuiget/src/core/feeds/testSupport.ts (:7-57); /Users/mattias/github/nuiget/src/core/feeds/wire.ts (exports); /Users/mattias/github/nuiget/src/core/feeds/flatContainer.ts (:92-175); /Users/mattias/github/nuiget/src/core/cache/CachePolicy.ts (:14-61, :108-122), LruMap.ts (API), TieredCache.ts (:105, :122); /Users/mattias/github/nuiget/src/core/contracts.ts (:205-300); /Users/mattias/github/nuiget/src/core/http/Transport.ts (:355-380, :685-725, allowLoopback sites), ssrf.ts (exports), index.ts; /Users/mattias/github/nuiget/src/core/catalog/Catalog.ts (:32-43 CatalogDeps, :294-298, REMOVAL GATE lines); /Users/mattias/github/nuiget/src/core/sources/DefaultOutboundPolicy.ts:13, /Users/mattias/github/nuiget/src/core/credentials/DefaultCredentialProvider.ts:54 (exist); /Users/mattias/github/nuiget/src/host/handlers.ts (:270-320), handlers.test.ts (:133-136, :244-250), services.ts (:1-70), SidebarHost.ts:110; /Users/mattias/github/nuiget/src/extension.next.ts (:40-110, :198-210, :268-282); /Users/mattias/github/nuiget/src/protocol/messages.ts (:130-150); /Users/mattias/github/nuiget/src/test/harness/harness.ts (:2, :17, :167: uses `activateWith`, so no HostServices construction of its own); /Users/mattias/github/nuiget/eslint.config.mjs (LAYERS :31-45); /Users/mattias/github/nuiget/src/webview/app/markdownSetup.ts (:131, :151); commands: `git status --porcelain --untracked-files=all`, `git log --oneline -3`, `npx tsc --noEmit` (exit 0), `grep -rn "REMOVAL GATE" src/host src/extension.next.ts src/core/catalog`, `grep -rn "readme/image" src -l`, `grep -rn "HostServices" src -l`, `grep -c "^\s*it(" src/core/feeds/{icons,readme}.test.ts` (24, 21).
`````

## Exact next step (one item ID)

P4.6 (`search.ts`: API multi-source, CLI JSON extraction after `warn :` lines, exact-match grouping, relevance only
multi-origin, `searchById`, `quickSearch`, + tests).

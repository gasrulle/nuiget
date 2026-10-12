# STATUS — src/protocol (and src/core/contracts.ts)   commit ac64e72 (parent of the P1.1b commit)   2026-10-12T11:45:20Z

git status --short src/protocol src/core/contracts.ts docs/adr docs/protocol.md: ` M` for
`src/core/contracts.ts`, `src/protocol/{STATUS.md,domain.ts,envelope.ts,guards.ts,messages.ts,protocol.test.ts}`,
`docs/adr/002` to `008` (seven files) and `docs/protocol.md` (all belong to the P1.1b commit, together with
` M ARCHITECTURE.md`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md` and ` M docs/plans/findings-ledger.md`)

Item: **P1.1b The contract-change item**. This note also covers `src/core/contracts.ts`, which has no directory
of its own. The note of P1.1a (the salvage itself) is in commit `ac64e72`.

## Verified by running

```text
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0, no output
baseline npx vitest run      → Test Files 45 passed (45) · Tests 1598 passed (1598)
npx tsc --noEmit             → exit 0 (first program of check-types)
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output
npm run lint                 → exit 0
npx vitest run --project backend src/protocol → Test Files 1 passed (1) · Tests 11 passed (11)    (item gate)
npm test                     → Test Files 45 passed (45) · Tests 1602 passed (1602)                 (item gate)
npx vitest run --coverage    → exit 0 · All files 71.92 % statements, 60.53 % branches, 65.71 % functions,
                               73.5 % lines (src/protocol/** and src/core/contracts.ts are excluded, P0.11)
npm run bench                → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npm run docs:protocol        → wrote docs/protocol.md: ## Requests (43), ## Events (11)
npm run docs:protocol:check  → docs:protocol:check — docs/protocol.md is up to date. exit 0        (item gate)
npm run package:vsix         → exit 0 · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 528.09 KB)
npm run check:vsix           → check:vsix: OK
checkpoint VERIFY greps      → nounFirstSyntax in contracts.ts: 0 · `source?: string` in messages.ts: 0 ·
                               `sourceUrls?: string[]`: 1 · `sources: (projectDir: string)`: 1 ·
                               'sdk-too-old': 1 · `rejected: (reason: string, opId: string)`: 1 ·
                               `onProgress: Event<OperationProgress>`: 1 · `interface ProjectMutator`: 1 ·
                               `## Requests (43)`: 1 · "43 requests" in ARCHITECTURE.md: 1 ·
                               "Amended: 2026-10-12 (plan item P1.1b" once in each of the seven ADRs
                               `generation?: number` in envelope.ts: 2, not 1 (the field and the parameter
                               of makeOk that the checkpoint itself specifies)
                               superseded check: the checkpoint expected `grep undici` on ADR-005 to find nothing while
                               its own text contains "`undici` is not a dependency"; the review ruled
                               that grep -c undici → 2 (header and that sentence, both negations) is right
after the review fixes       → npm run check-types exit 0 · npm run lint exit 0 · npm test 45 files,
                               1602 tests passed · npm run docs:protocol:check up to date
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P1.1b
```

## Done (tested)

- `src/protocol/messages.ts`: request `readme/image` (the 43rd), `sourcesUnavailable?` on the result of
  `search/query`, and the naming rule: `sourceUrl?` in `package/versions`, `package/metadata` and
  `package/readme`, `sourceUrls?` in `search/query`. Test `accepts the readme/image request`.
- `src/protocol/guards.ts`: `'readme/image'` in the request record; `tsc` enforces it.
- `src/protocol/envelope.ts`: `generation?` on the ok variant of `ResponseEnvelope`; `makeOk` takes it as an
  optional fourth argument and leaves the key out when none is given. Test
  `makeOk carries a generation only when one is given`.
- `src/protocol/domain.ts`: `resourceKeys.sources(projectDir)` → `sources:<projectDir>`; the `versions` and
  `metadata` builders take `sourceUrl`. Tests `keys the sources of a project directory by that directory` and
  `keys versions and metadata by lower-cased id and source URL`.
- `docs/protocol.md` regenerated: 43 requests, 11 events.

## Done (untested)

Type-only changes; `tsc` is their check, and their first consumers are named:

- `src/protocol/domain.ts`: `'sdk-too-old'` in `UnsupportedProjectReason` (consumer P2.5).
- `src/core/contracts.ts`: `OperationQueue.onProgress` and `rejected(reason, opId)` (P2.1); the `env` comment
  of `DotnetRunOptions` and the new `SdkInfo` with `supported`, `cpmAwareAddProvenance` and the exported
  `CapabilityProvenance`, without `nounFirstSyntax` (P1.6); `MutationKind`, `MutationRequest`,
  `MutationDecision` and `ProjectMutator` (P6.3).
- ADR-002 to ADR-008, amended inline in the form of ADR-000: header `Amended: 2026-10-12 (plan item P1.1b: …)`,
  one Context paragraph, rewritten bullets.

## Not started

- `AddPackageOptions.isCpm`: the type is in `src/core/cli/commands.ts`, which P1.6 salvages. The checkpoint
  ruled that it is not a contract change; the entry of the P1.1b row is satisfied by P1.6.
- `InvalidationEvent.keys` with per-key generations (`src/core/contracts.ts`, `InvalidationEvent`): P1.8, under
  its own approval and sentinel. The tracker row of P1.8 says so.
- ADR-005's supported proxy configurations and the decision on a vendored proxy agent: P4.1
  (`docs/adr/005-proxy-matrix.md`).
- ADR-009 (`Catalog`): P2.8.

## Deviations from contract/ADR (file:line each)

- None from the checkpoint's declarations: the contract edits were typed from its answer.
- `src/protocol/protocol.test.ts`: the checkpoint's cases (a) to (c) are four tests, not three, with three
  assertions beyond its list (generation 0 is kept; a URL source in `versions` and a `metadata` key; an ok
  response for `readme/image`).
- `docs/adr/002-query-coordinator.md`: the scope and merge tables are fenced text blocks, and the two merge
  rows for `metadata` with `project` or `package` are one line.
- `docs/adr/004-project-model.md`, tier 2: the command text of the two evaluation runs is composed from the
  wording of plan item P6.1 and has not been probed (P6.2).
- `src/protocol/guards.ts`: the line with the `package/*` keys is about 125 characters long.
- Guidance that is loose since P1.1a and not edited here: "`Thenable` appears only in `contracts.ts`" in
  `.github/copilot-instructions.md` and `.github/instructions/core-boundaries.instructions.md`; it appears
  nowhere under `src/core` or `src/protocol`. P7.5 reviews the rows.
- This note lies in a frozen path (N42): the approval was recorded in `docs/plans/STATUS.md` first, the
  sentinel created after it, and this note written while the sentinel existed.
- Two ADR sentences were corrected on review; both came from the wording of the checkpoint answer:
  `docs/adr/004-project-model.md:49-51` (the `--no-restore` rule of D7 holds in any phase; only the refusal
  of CPM `add` and `update` ends with the mutator) and `docs/adr/003-operation-queue-and-dotnet-runner.md:42-44`
  (the SDK floor concerns the package reference commands, not every `dotnet` command).
- `CHANGELOG.md`: the headline is the one the review suggested (non-blocking 5).

## Advisor decisions (date, item, question, answer verbatim)

2026-10-12, P1.1b, checkpoint before starting (recorded first in `docs/plans/STATUS.md`, N42). Question: for
each of the twelve changes and the seven ADR amendments of the plan row, what exactly is to be declared in
P1.1b, and is anything to be left to a later item? Answer, verbatim:

```text
DECISION: Option 1. Every OPEN point is ruled below; nothing in the row is the owner's. Rulings on the open points: 3 = `ProjectMutator` with the two query members P6.3 names (`canMutate`, `previewCpmImpact`) over named request/decision types, no `apply`; 4 = `resourceKeys.sources(projectDir)` with a required argument; 5 = literal request name `'readme/image'` placed in the Package details group, payload `{ url: string; sourceUrl?: string }`, result `{ url: string; dataUri: string | null }`; 7 = `generation?: number` on the ok variant of `ResponseEnvelope` only (not on result types, not on `StreamEnvelope`), with an optional fourth parameter on `makeOk`; 8 = the naming rule is recorded in ADR-007 and its consequences are exactly: the three `source?: string` payload fields → `sourceUrl?`, the two `resourceKeys` parameters → `sourceUrl`, `search/query.sources?: string[]` → `sourceUrls?`; `selectedSource`, `search/autocomplete.sources`, `removedUrl`, `disabledUrl`, `NuGetSource.url`, `FailedSource.url` keep their names; 9 = export the union as `CapabilityProvenance`; 11 = no contract edit in P1.1b, the P1.6 row carries `AddPackageOptions.isCpm`; ADR-005 = strike `undici`, make the proxy sentence equal to the `Transport` comment at `src/core/contracts.ts:238-242`, name `ProjectExecutionContext` as the context contract, leave the configuration matrix and the vendoring decision to P4.1; amendments are written inline in the form ADR-000 used in P0.9, not as appended sections; the N42 order (tracker, sentinel, protocol note) is right.

WHY: I verified every path:line in the brief against `labs/2.0` @ ac64e72 and all hold: `src/core/contracts.ts:98` has `rejected: (reason: string) => T`, `:173-174` says "merged over the sanitized base env", `:185-192` still declares `nounFirstSyntax`, `:307-314` declares `CpmImpactPreview`; `src/protocol/domain.ts:69` lacks `sdk-too-old` and `:225` is `sources: (): ResourceKey => 'sources'`; `src/protocol/messages.ts:131` lacks `sourcesUnavailable` while `:121` and `:127` already carry it as optional; `src/protocol/envelope.ts:48-50` is the two-variant union; ADR-005 says "via `https.Agent`/`undici` proxy agent" and ADR-006 says "`readme/image` lazily". Three facts the brief did not carry decide the open points: (i) ADR-000's amendment of P0.9 (commit 583ef41) is inline, a header line `Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P0.9: …)`, a Context paragraph and rewritten bullets, so appended sections would give the ADR set two forms and force readers to compute the effective decision from two texts; (ii) `tseslint.configs.recommended` is on (`eslint.config.mjs:92`) and includes `no-empty-object-type`, so option (c) for the mutator (an empty interface) is lint-red, and P6.3's row names core/project and host but not `contracts.ts`, so deferring members guarantees an unplanned contract-change item later; (iii) `domain.ts:260` already has `OperationKind = 'install' | 'update' | 'remove' | 'restore'` and the house shape for a failed result is `{ ok: false; error }` (`contracts.ts:257` `SourceMutationResult`, `domain.ts:272` `StepOutcome`, P1.10's refusal `{ ok:false, error:'…' }`), so the mutator reuses both instead of inventing `add` and `reason`. For 4, ADR-005 resolves sources per project directory and `SourceProvider.listSources(projectDir)` (`contracts.ts:264`) is per directory, so a bare `'sources'` key has no meaning and an optional argument would create two keys for one resource. For 5, the name `readme/image` appears in ADR-006 and in three plan rows (P1.1b, P4.4, P5.7) that are executed literally and that P7.5's drift script may grep; results echoing a request field is the house pattern (`package/versions` echoes `packageId`, `updates/get` echoes `projectPath`, `search/query` echoes `query`); `sourceUrl?` lets the host confine credentials to the README's own feed (ADR-006 "same host-side fetch … auth"), and a `null` data URI is ADR-006's "shown as links when the fetch fails". For 7, ADR-002 says "Request ids correlate RPC; generations establish freshness", which is a transport-level property, one declaration on the envelope serves every resource request without enumerating which results are resources, the guard `isResponseEnvelope` needs no change for an optional field, and streams need no generation because ADR-002 invariant 2 terminates a request whose generation is superseded with `StaleQueryError`, so a chunk never outlives its generation and chunks are dropped by request id alone. For 8, ADR-007's Context already names "the same concept had different field names per surface" as the problem it solves, so that is where the rule belongs; `ProjectExecutionContext.sourceUrls` (`contracts.ts:290`) and `BulkPackageRef.sourceUrl` (`messages.ts:42`) are the precedent. For 11, `AddPackageOptions` is an argv-builder option type internal to `src/core/cli`, not a cross-module contract, and moving it would make P1.6's copy of `commands.ts` collide with a declaration in `contracts.ts`, forcing a delete-and-reimport; that loses work if P1.6 is interrupted. For ADR-005, the P4.1 row (plan line 257) owns "supported configuration and matrix; decide on vendoring a proxy agent" and D6 lists P4.1 as the ADR-005 contract item, so P1.1b writes only what is already decided and already stated in `contracts.ts:238-242`.

DO:
1. Paste this answer under a new `## Advisor decisions` section in `docs/plans/STATUS.md` (date 2026-10-12, item P1.1b) and set the P1.1b tracker row to `in-progress`. Then create `.claude/.contract-change` with content exactly `P1.1b`. Then copy this answer verbatim into `src/protocol/STATUS.md` under "Advisor decisions" (N42 order: tracker first, sentinel second, frozen note third).
2. `src/core/contracts.ts`, import block at lines 10-23: add `OperationKind` to the type import from `'../protocol/domain'` (it is not imported today; `check-types` fails without it).
3. `src/core/contracts.ts:86-102`, `OperationQueue`: add after `onDidChange`:

        /** Fires for every `report()` of a running workflow with `opId` stamped; the host forwards it as the `ops/progress` event. */
        readonly onProgress: Event<OperationProgress>;

   and change the third parameter of `submit` to:

        /** Builds the terminal outcome when the queue refuses the work. `opId` is the ticket's id, so a rejected outcome is correlated like any other (C-ops-5). */
        rejected: (reason: string, opId: string) => T,

4. `src/core/contracts.ts:173-174`: replace the `env` comment with:

        /** Extra environment variables, merged under the fixed CLI environment (ADR-003): a caller can add variables but cannot override `DOTNET_CLI_UI_LANGUAGE`, `DOTNET_NOLOGO`, `DOTNET_CLI_TELEMETRY_OPTOUT`, `NO_COLOR` or `TERM`. */

   (plain "under"; the bold in the plan row is emphasis, not text).
5. `src/core/contracts.ts:185-192`: replace `SdkInfo` with:

        /** Where a capability value comes from. `'verified'` is used only when a tracked probe fixture proves it (`src/core/cli/__fixtures__/sdk-probes/`). */
        export type CapabilityProvenance = 'verified' | 'documented' | 'assumed' | 'unverified';

        export interface SdkInfo {
            version: string;
            major: number;
            /** `major >= 10` (D13). A project that resolves an unsupported SDK is `unsupported: 'sdk-too-old'` and read-only. */
            supported: boolean;
            /** `dotnet package add` writes the central version of a Central Package Management project (ADR-004 supplement). */
            cpmAwareAdd: boolean;
            /** P1.6 produces `'verified'` for SDK 10 from the P0.0 fixture and `'unverified'` otherwise; the other two values are reserved by the plan row. */
            cpmAwareAddProvenance: CapabilityProvenance;
        }

6. `src/core/contracts.ts`, after `CpmImpactPreview` (line 314), add:

        /** The three reference edits the mutator decides on; a restore is not a mutation of the project file. */
        export type MutationKind = Exclude<OperationKind, 'restore'>;

        export interface MutationRequest {
            kind: MutationKind;
            packageId: string;
            /** Target version for `install`/`update`; absent for `remove` and for `install` of the latest version. */
            version?: string;
        }

        /** `ok: false` carries the explanation the UI shows (D7 refusal, SDK below 10, dirty props file, unverified CPM capability). */
        export type MutationDecision = { ok: true } | { ok: false; error: string };

        /**
         * ADR-004 tier 3. Decides whether a reference edit may run in `context` and previews its Central Package
         * Management impact. Provenance checks (`cpmAwareAddProvenance === 'verified'`, D7) live here and nowhere else.
         * Implemented in P6.3; `HostServices.mutator` is absent until then (P2.9). Any further member is a contract change of its own.
         */
        export interface ProjectMutator {
            canMutate(context: ProjectExecutionContext, request: MutationRequest): Promise<MutationDecision>;
            /** `undefined` when the project is not CPM or the package has no central entry. */
            previewCpmImpact(context: ProjectExecutionContext, packageId: string, toVersion: string): Promise<CpmImpactPreview | undefined>;
        }

7. `src/protocol/domain.ts:69`: replace with:

        /** `sdk-too-old`: the SDK the project resolves is below 10 (D13); the message is "requires .NET SDK 10 or newer". */
        export type UnsupportedProjectReason = 'packages-config' | 'non-sdk-style' | 'parse-failed' | 'not-found' | 'sdk-too-old';

8. `src/protocol/domain.ts:225`: replace with:

        /** Sources effective for one project directory (ADR-005 resolves sources per `projectDir`; the plan row's `cwd` is that directory). */
        sources: (projectDir: string): ResourceKey => `sources:${projectDir}`,

   and `:232-235`: rename the parameter `source` to `sourceUrl` in both `versions` and `metadata` (the key text `… ?? 'all'` is unchanged):

        versions: (packageId: string, sourceUrl: string | undefined, includePrerelease: boolean): ResourceKey =>
            `versions:${packageId.toLowerCase()}|${sourceUrl ?? 'all'}|${includePrerelease ? 'pre' : 'stable'}`,
        metadata: (packageId: string, version: string, sourceUrl: string | undefined): ResourceKey =>
            `metadata:${packageId.toLowerCase()}@${version.toLowerCase()}|${sourceUrl ?? 'all'}`,

9. `src/protocol/messages.ts:131`: replace with:

        'search/query': { payload: { query: string; sourceUrls?: string[]; includePrerelease: boolean; take?: number; exactMatch?: boolean }; result: { query: string; results: PackageSearchResult[]; sourcesUnavailable?: boolean }; chunk: { kind: 'metadata'; packages: PackageMetadataLite[] } };

   `:135-137`: change `source?: string` to `sourceUrl?: string` in the payloads of `package/versions`, `package/metadata` and `package/readme` (nothing else on those lines changes). Insert between `package/readme` (line 137) and `package/prewarm` (line 138), so it inherits the "Package details" group:

        /** Lazily fetches one README image host-side with the icon fetch's auth, size cap and policy (ADR-006). `dataUri` is `null` when the fetch failed or policy blocked it; the webview then renders a link. */
        'readme/image': { payload: { url: string; sourceUrl?: string }; result: { url: string; dataUri: string | null } }; // main

10. `src/protocol/guards.ts:23`: add `'readme/image': true,` to the line that holds the `package/*` entries. `tsc` enforces the rest.
11. `src/protocol/envelope.ts:48-50`: replace with:

        export type ResponseEnvelope<T extends RequestType = RequestType> =
            | {
                kind: 'response'; id: string; type: T; ok: true; result: RequestResult<T>;
                /** Generation of the `QueryCoordinator` resource the result was computed for (ADR-002); present only when the handler read a resource. A webview discards a result whose generation is below the last `resources/invalidated` generation it saw for that key (ADR-008). */
                generation?: number;
            }
            | { kind: 'response'; id: string; type: T; ok: false; error: ProtocolError };

   and `:84-86`: replace `makeOk` with:

        export function makeOk<T extends RequestType>(id: string, type: T, result: RequestResult<T>, generation?: number): ResponseEnvelope<T> {
            return generation === undefined
                ? { kind: 'response', id, type, ok: true, result }
                : { kind: 'response', id, type, ok: true, result, generation };
        }

   The key is omitted when undefined, so `protocol.test.ts:38` and any future `toStrictEqual` hold. `isResponseEnvelope`, `StreamEnvelope`, `makeStream` and `isStreamEnvelope` are unchanged.
12. `src/protocol/protocol.test.ts`: add cases (a) `REQUEST_TYPES` contains `'readme/image'` and `isRequestEnvelope(makeRequest('readme/image', { url: 'https://example.test/a.png' }))` is true; (b) `resourceKeys.sources('/w/App')` equals `'sources:/w/App'` and `resourceKeys.versions('Pkg', undefined, false)` equals `'versions:pkg|all|stable'`; (c) `makeOk('a', 'installed/get', <InstalledResult>, 3)` has `generation` 3 and passes `isResponseEnvelope`, and `'generation' in makeOk('a', 'projects/list', { projects: [] })` is false. No other test changes; `src/protocol/index.ts` is `export *`, so no barrel edit.
13. ADR amendments, inline in ADR-000's form: change each header to `Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: <topics>)`, add one Context sentence that the amendment records the P1.1b contract changes and plan decisions D7 and D13, and rewrite the affected bullets; git holds the history. Content per ADR:
    - 002: replace the sentence "Scopes merge: `workspace ⊇ project ⊇ package`; a `sources` scope invalidates search/updates/metadata keys." with the scope table and the merge table exactly as in the brief's `scopes.ts:11-17` and `:128-141` excerpts (workspace → every key; project{paths} → `projects`, `allProjects:*`, `installed:<p>`, `updates:<p>|*`, `transitive:<p>`; package{paths, ids} → everything project matches plus `versions:<id>|*`, `metadata:<id>@*`; sources → `sources`, `updates:*`, `allProjects:updates*`, `versions:*`, `metadata:*`; metadata{ids} → `versions:<id>|*`, `metadata:<id>@*`; merge: workspace + any → workspace; project + project → project (paths ∪); project + package → package; package + package → package (paths ∪, ids ∪); metadata + metadata → metadata; metadata + project|package → package; sources + sources → sources; sources + metadata → sources; sources + project|package → workspace). Add: keys are `sources:<projectDir>`; `parseKey` splits at the first `:` so their kind is `sources`; `search/query` is not a cached resource, so the old word "search" named nothing and no row was lost; the generation a webview compares against travels on the ok response envelope (ADR-007/008). State that `src/core/queries/scopes.ts` (P1.7) must equal these tables (C-state-core-3).
    - 003: queue bullet: `submit(label, run, rejected)` where `rejected(reason, opId)` stamps the ticket's `opId` on refused outcomes; `onProgress: Event<OperationProgress>` is forwarded by the host as `ops/progress`. Runner bullet: environment list becomes `DOTNET_CLI_UI_LANGUAGE=en`, `DOTNET_NOLOGO=1`, `DOTNET_CLI_TELEMETRY_OPTOUT=1`, `NO_COLOR=1`, `TERM=dumb` (the P1.6 row asserts `TERM === 'dumb'`), applied last: `{ ...process.env, ...options.env, ...FIXED_ENV }`, so a caller's `env` adds variables and never overrides the fixed ones (C-cli-logging-6). New bullet "SDK floor (D13)": only noun-first `dotnet package add/remove/list --project` is issued; `sdkVersion()` returns `SdkInfo` with `supported = major >= 10` and `undefined` only when `dotnet` is missing or its output unparseable; workflows refuse edits when `!sdk.supported` with "requires .NET SDK 10 or newer". Replace the Consequences line 38 with: "`dotnet package list` is issued only with `--no-restore` (D13 closes M3); without it the command restores implicitly and is never used." Do not describe `package list` as the project-model read path (ADR-004 tiers 1 and 2 are).
    - 004-project-model: tier 1 gains the `props` declaration (`PackageReference` declared in an imported props file such as `Directory.Build.props`) and `InstalledPackage.definedIn` (absolute path of the declaring file when it is not the project); tier 2 becomes a properties run followed by per-target-framework runs that return `PackageReference` and `PackageVersion` items and the override-enabled flag (P6.2); tier 3: "verified per SDK major" becomes "SDK 10 only (D13); `cpmAwareAdd` and `cpmAwareAddProvenance` come from the tracked probe fixture (004-sdk-probes), `'verified'` only from a fixture", the mutator is the `ProjectMutator` interface in `src/core/contracts.ts` (`canMutate`, `previewCpmImpact`), and "until it lands (P6.3) 2.0 refuses `add`/`update` on CPM projects unconditionally and never passes `--no-restore` to `package add` on a CPM project; `remove` stays allowed (D7)". Extend the closing sentence so unsupported formats include "a project whose resolved SDK is below 10 (`sdk-too-old`, read-only, D13)". Reference finding 2 of 004-sdk-probes (props file rewritten by every `add --version`) as an input to the mutator; do not edit 004-sdk-probes.md.
    - 005: replace the `Transport` bullet with the `contracts.ts:238-242` wording: "`Transport` honours VS Code `http.proxy`, `http.proxyStrictSSL`, `http.proxySupport` and `http.systemCertificates` by routing HTTP/1.1 through Node's `https` module (which the extension host patches for proxies); HTTP/2 is used only when no proxy is configured. One redirect/SSRF implementation; same-origin-only auth forwarding; redirect targets are re-validated by resolved address when the hostname is not an IP literal. `undici` is not a dependency. P4.1 records the supported configuration matrix and decides whether a proxy agent is vendored (`docs/adr/005-proxy-matrix.md`)." Add to the first bullet: "The context is `ProjectExecutionContext` in `src/core/contracts.ts` (`projectPath`, `projectDir`, `workspaceFolder`, `sdk`, `configFiles`, `sourceUrls`, `revision`); `sdk.supported === false` marks the project `unsupported: 'sdk-too-old'` and read-only (D13, P2.5); `revision` keys the evaluator cache (ADR-004)."
    - 006: replace "README images are rewritten through the same host-side fetch (`readme/image` lazily) or shown as links when the fetch fails." with "README images are fetched lazily through the `readme/image` request (`{ url, sourceUrl? }` → `{ url, dataUri | null }`) with the same host-side fetch, auth, size cap and policy as icons; `dataUri: null` means the webview renders the image as a link (fetch in P4.4, rewriter in P5.7)."
    - 007: record the 43rd request `readme/image`; `generation?` on the ok response variant (not on streams; streams are dropped by request id); and the naming rule: "A string or string-array field that holds a source URL is `sourceUrl`/`sourceUrls`; a field that holds a source name is `sourceName`; a field holding `NuGetSource` or `{ name; url }` objects is `sources`; `SessionSnapshot.selectedSource` keeps its name because its value is a selection (`'all'` or a URL)." List the renames of step 8 and 9 as its consequences.
    - 008: "stale resources by generation" means `useMessageBus.request` exposes the ok response's `generation` so `useResource` can discard a result older than the last `resources/invalidated` generation for its key; chunks are discarded by id only.
    `docs/adr/README.md` needs no change (it lists titles and statuses, not dates).
14. Run `npm run docs:protocol` after the last `messages.ts` edit; `docs/protocol.md` must say `## Requests (43)`. Update `ARCHITECTURE.md:43` from "42 requests" to "43 requests" and add one sentence in the 2.0 section that an ok response may carry `generation`. CHANGELOG `## [Unreleased]` `### Changed`: one headline-only bullet for the 2.0 contract changes (a `**Breaking:**` entry is not needed; the 2.0 protocol is unreleased). No new gotcha row unless one surfaces.
15. Ledger: do not close any C-id. Add "contract side done in P1.1b" to C-cli-logging-5 and -6 (close at P1.6), C-state-core-3 (ADR side; close at P1.7), C-cache-http-5 (ADR side; close at P4.1), C-ops-5 (close at P2.1), C-protocol-host-1 (close at P2.10). Record under N42 that the order of step 1 was used and P7.5 still decides the fix. Add a tracker note to the P1.8 row: `InvalidationEvent.keys` "carries per-key generations" is a change to `src/core/contracts.ts:128-134`, so P1.8 needs its own sentinel and recorded approval (not P1.1b's to do; the row does not name it).
16. Gates: `npm run check-types`, `npx eslint src`, `npx vitest run --project backend src/protocol`, `npm test`, `npm run bench`, `npm run docs:protocol:check`. Then rewrite `src/protocol/STATUS.md` per plan §2.5 while the sentinel is still present.
17. Second brief, as the row requires ("Advisor reviews the diff before merge"): send `git diff -- src/core/contracts.ts src/protocol docs/adr docs/protocol.md` to the `architecture-advisor`, paste the answer into both STATUS files, act on it. Only then delete `.claude/.contract-change` (`guard.mjs:159-165` denies `git commit` while it exists), commit with the `git-commit` skill citing P1.1b, D7, D13, ADR-002..008, C-ops-5, C-cli-logging-5/-6, C-state-core-3, C-cache-http-5, C-protocol-host-1, N42; push to `labs/2.0`; wait for green CI.
18. Two sessions: the row allows ending a session with the sentinel present and frozen-path edits uncommitted (the row overrides §2.2 step 8 for this item). Record that state in `docs/plans/STATUS.md` (the sentinel is gitignored and invisible to `git status`); on resuming, this answer remains the recorded approval and the sentinel is recreated if missing. Never move modifications of tracked files to `src/_wip/`.

DO NOT:
- Do not add an `apply`/`execute` member to `ProjectMutator`, and do not use `kind: 'add'` or `{ ok: false; reason }`; reuse `OperationKind` and `{ ok; error }`.
- Do not make the `sources()` argument optional or keep a bare `'sources'` key.
- Do not name the request `package/readmeImage`, and do not add a `// README` group comment above it (it would start a new group in `docs/protocol.md`).
- Do not put `generation?` on result types or on `StreamEnvelope`, and do not change `isResponseEnvelope`.
- Do not make `sourcesUnavailable` required; its siblings at `messages.ts:121,127` are optional.
- Do not rename `selectedSource`, `search/autocomplete.sources`, `removedUrl`, `disabledUrl`, `NuGetSource.url` or `FailedSource.url`.
- Do not move `AddPackageOptions` or `RemovePackageOptions` into `contracts.ts`.
- Do not change the four-value `CapabilityProvenance` union; the row fixes it even though P1.6 produces only two values.
- Do not edit the plan: the P2.9 gate reads "≥ 42 request cases", which 43 satisfies.
- Do not append "Amendments" sections to ADRs or leave superseded sentences standing; rewrite inline as ADR-000 did.
- Do not edit `docs/adr/000`, `001`, `004-sdk-probes.md` or `docs/adr/README.md`; do not create ADR-009 (P2.8).
- Do not touch `InvalidationEvent` (`contracts.ts:128-134`); that is P1.8's change under its own approval.
- Do not write `src/protocol/STATUS.md` before the sentinel exists, and do not commit while it exists.
- Do not skip the diff-review brief of step 17.

CONTRACT CHANGE: item P1.1b, sentinel `.claude/.contract-change` with content `P1.1b`. Frozen files: `src/core/contracts.ts`; `src/protocol/domain.ts`, `src/protocol/messages.ts`, `src/protocol/envelope.ts`, `src/protocol/guards.ts`, `src/protocol/protocol.test.ts`, `src/protocol/STATUS.md`; `docs/adr/002-query-coordinator.md`, `003-operation-queue-and-dotnet-runner.md`, `004-project-model.md`, `005-execution-context-and-outbound-policy.md`, `006-icons-and-csp.md`, `007-protocol.md`, `008-webview-architecture.md`. Generated: `docs/protocol.md`. Non-frozen docs duties: `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`. `AddPackageOptions.isCpm` is not a contract change and is executed by P1.6 in `src/core/cli/commands.ts`; the P1.1b note records that the row entry is satisfied there.

VERIFY:
- `npm run check-types` → exit 0; `npx eslint src` → 0 errors, 0 warnings.
- `npx vitest run --project backend src/protocol` → Tests 10 passed (7 existing + 3 new), or more if (a)-(c) are split; `npm test` → all files passed; `npm run bench` → passed.
- `npm run docs:protocol:check` → "docs/protocol.md is up to date", exit 0; `grep -c '## Requests (43)' docs/protocol.md` → 1; `grep -c "readme/image" docs/protocol.md` → ≥ 1.
- `grep -n nounFirstSyntax src/core/contracts.ts` → no match; `grep -n "source?: string" src/protocol/messages.ts` → no match; `grep -n "sourceUrls?: string\[\]" src/protocol/messages.ts` → 1 match; `grep -n "sources: (projectDir: string)" src/protocol/domain.ts` → 1 match; `grep -n "'sdk-too-old'" src/protocol/domain.ts` → 1 match; `grep -n "rejected: (reason: string, opId: string)" src/core/contracts.ts` → 1 match; `grep -n "onProgress: Event<OperationProgress>" src/core/contracts.ts` → 1 match; `grep -n "interface ProjectMutator" src/core/contracts.ts` → 1 match; `grep -n "generation?: number" src/protocol/envelope.ts` → 1 match.
- `grep -n undici docs/adr/005-execution-context-and-outbound-policy.md` → no match; `grep -c "Amended: 2026-10-12 (plan item P1.1b" docs/adr/00{2,3,4-project-model,5,6,7,8}*.md` → 1 per file; `grep -n "43 requests" ARCHITECTURE.md` → 1 match.
- `ls .claude/.contract-change` → "No such file or directory" at commit time; `git status --short` → clean after the commit; the diff-review answer is present in both STATUS files; CI run on `labs/2.0` green.
```

2026-10-12, P1.1b, review of the diff before the commit (plan row: "Advisor reviews the diff before merge").
Question: is the diff of the frozen files exactly what the checkpoint ruled, and is there a defect that must
be fixed before the commit? The brief listed eight points where the answer had to be interpreted. Answer,
verbatim:

```text
VERDICT: PASS WITH FIXES

BLOCKING:
1. `docs/adr/004-project-model.md:49-51` misstates the scope of plan decision D7. The paragraph "Until the mutator lands (plan item P6.3), 2.0 refuses `add` and `update` on CPM projects unconditionally and never passes `--no-restore` to `package add` on a CPM project; `remove` stays allowed, because it edits only the project's own reference (plan decision D7)." puts both rules under one expiry. D7 (plan line 51) says the `--no-restore` prohibition holds "in any phase"; only the refusal lifts at P6.3. A literal P6.3 implementer reads the current text as permission to pass `--no-restore` once the mutator exists, which is the N1 hazard D7 exists to prevent, and the 2.0 gotcha row ("CPM and `--no-restore`") states the rule without expiry, so the ADR now contradicts both. My checkpoint DO text for 004 bundled the two clauses the same way; the defect is in my wording, not in the session's transcription. Replace lines 49-51 with:

       2.0 never passes `--no-restore` to `package add` on a CPM project, in any phase (plan decision D7).
       Until the mutator lands (plan item P6.3), it also refuses `add` and `update` on CPM projects
       unconditionally; `remove` stays allowed, because it edits only the project's own reference.

2. `docs/adr/003-operation-queue-and-dotnet-runner.md:42-43` is internally inconsistent. "only the noun-first commands `dotnet package add/remove/list --project` are issued" contradicts lines 38-39 of the same ADR (`restore`, `nuget list source`), ADR-004 tier 2 (`dotnet msbuild … -getProperty`), ADR-005 line 17-18 (`dotnet nuget list source`) and the P2.5 row (`dotnet nuget config paths`). P1.6 copies `commands.ts` with those builders and would hit the ADR-mismatch stop-and-ask trigger on its first day; fixing the sentence then needs another sentinel. My checkpoint wording ("only noun-first … is issued") was too broad. Replace the first sentence of the bullet (lines 42-43, up to "are issued.") with:

       - SDK floor (plan decision D13): package references are added, removed and listed only with the
         noun-first commands `dotnet package add/remove/list --project`; the verb-first forms
         `dotnet add/remove/list <proj> package` are never issued.

   The rest of the bullet (`sdkVersion()` … "requires .NET SDK 10 or newer") stays.

After both edits: `npm run check-types`, `npm run lint`, `npm test`, `npm run docs:protocol:check` again (the ADRs are not inputs to any of them, so the results will not change, but the §2.5 note must quote a run made on the final tree); then rewrite `src/protocol/STATUS.md` per §2.5 while the sentinel is still present (N42), listing under "Deviations": 11 tests instead of 10, the superseded `undici` VERIFY line (ruling 1 below), and the two ADR sentences corrected on review; paste this answer into both STATUS files; delete `.claude/.contract-change`; commit; push; wait for CI.

NON-BLOCKING:
1. `docs/adr/004-project-model.md:45-47`: "the mutator treats the file as modified after any add" is stricter than the evidence. `docs/adr/004-sdk-probes.md:109-113` (finding 2) and its row `add-no-version` → "unchanged (not even reformatted)" show that only `add --version` rewrites the props file; the probe's own Consequences (line 125-126) say "after any `add --version`". Stricter is safe, so it stands; P6.3 decides whether to keep the conservative rule or align the sentence with the fixture.
2. `docs/adr/004-project-model.md:24-29` (tier 2): the sentence assigns "whether version overrides are enabled" to the per-target-framework run. That is an MSBuild property (`CentralPackageVersionOverrideEnabled`), so P6.2 may move it to the properties run; the ADR states intent, and P6.2's row ("properties run, per-TFM runs, `PackageVersion` items, override-enabled flag") owns the exact argv. No change now.
3. `docs/protocol.md:36`: the Notes cell of `readme/image` renders the JSDoc text and the trailing `// main` surface marker as one string ("… renders a link. main"). `scripts/gen-protocol-docs.mjs:49-59` joins every comment of a member; the generator is not in P1.1b's files and the output is exactly what the generator produces, so `docs:protocol:check` is right to pass. P7.5 (docs drift script) should give surface markers their own column.
4. `docs/adr/005-execution-context-and-outbound-policy.md:29-35`: aligning the `Transport` sentence to `src/core/contracts.ts:248-251` dropped the previous clause "and falls back to HTTP/1.1". P4.1 owns ADR-005 (plan line 257, D6) and decides whether the fallback is restated in the configuration matrix.
5. `CHANGELOG.md:32`: "Completed the 2.0 protocol and core contracts" overstates; P1.8 (`InvalidationEvent.keys`, tracker note already added) and P2.8 (ADR-009) change the frozen files again. A more exact headline is "**Applied the P1.1b contract changes and amended ADR-002 to ADR-008 to match**". CHANGELOG is P1.1b's file, so this may be done now or left; it is not a defect of the contracts.
6. `src/core/contracts.ts:341` names `HostServices.mutator`, a type that lives in the quarry's `src/host/services.ts` and reaches this tree in P2.9. The forward reference is prose and matches the P2.9 row ("drop `mutator` until P6") and the P6.3 row ("`HostServices.mutator` restored"); P2.9 should confirm the name when `services.ts` lands.

RULINGS:
1. (a): keep both `undici` mentions (header and the sentence "`undici` is not a dependency."). The VERIFY line `grep -n undici … → no match` was written to prove the old phrase "via `https.Agent`/`undici` proxy agent" is gone and is superseded by the DO text; its replacement check is `grep -c undici docs/adr/005-execution-context-and-outbound-policy.md` → 2, both negations. Record it in the §2.5 note as a superseded check, not a deviation.
2. Accepted: 11 tests. The VERIFY text allowed "or more if (a)-(c) are split"; the `generation: 0` case pins the `=== undefined` guard (a falsy check would drop it) and the `toStrictEqual` on the whole envelope proves the key is absent rather than `undefined`; the readme/image ok response through `isResponseEnvelope` costs nothing and covers the guard's `'result' in value` branch for the new type.
3. Accepted: `text` fences inside the list item satisfy the markdown instruction (language identifier present); the one-line merge row "metadata + project | package" is unambiguous; ledger ids belong in commits, the tracker and the ledger, not ADR prose (ADR-000's amendment cites plan items and decisions only), so "`src/core/queries/scopes.ts` (plan item P1.7) implements both tables and must equal them" is the right sentence.
4. Accepted, same reasoning; placing the fixed-environment and SDK-floor text in the "Dotnet runner" list is correct, subject to blocking defect 2.
5. Keep the tier-2 text (the `-getProperty` list was already in the ADR before this item; the per-TFM `-getItem:PackageReference;PackageVersion` is the P6.1 row verbatim); see non-blocking 2 for the override flag. The second tier-3 paragraph is where D7 lives and must be corrected as in blocking defect 1; the props-file sentence stands (non-blocking 1).
6. Accepted: `eslint.config.mjs` has no `max-len` rule, the record line is a data table, and `tsc` enforces exhaustiveness through `satisfies Record<RequestType, true>`; keep `'readme/image': true` between `package/readme` and `package/prewarm` so it stays in the "Package details" group of the generated docs.
7. Accepted: the file header (`src/core/contracts.ts:1-8`) is not named by the row and is consistent with `core-boundaries` (types from `vscode` are allowed, values are not); `InvalidationEvent` (`:132-138`) untouched is correct and the P1.8 tracker row now carries the note; `OperationKind` in the import is required by `MutationKind`.
8. Accepted: `ARCHITECTURE.md` "43 requests" (`:43`), the `generation` sentence (`:49-51`), `ProjectMutator` in the contracts paragraph (`:59-61`) and the module-map rows are correct and stay inside the 2.0 section. CHANGELOG bullet is headline-only under `### Changed` as required; see non-blocking 5 for its wording.

CHECKED:
- `.github/agents/architecture-advisor.agent.md`; plan §1-§3 (lines 30-159) and rows P1.1a, P1.1b, P1.6, P1.7, P1.8, P2.5, P2.9, P4.1, P4.4, P5.7, P6.1, P6.2, P6.3, P7.5; `docs/plans/STATUS.md:158-323` (the checkpoint answer, compared step by step with the diff) and the P1.1b / P1.8 tracker rows.
- `git status --short`; `cat .claude/.contract-change` → `P1.1b`; `git diff --stat` (19 files); `git diff -- src/core/contracts.ts src/protocol/{domain,envelope,guards,messages}.ts src/protocol/protocol.test.ts docs/adr docs/protocol.md ARCHITECTURE.md CHANGELOG.md docs/plans/STATUS.md docs/plans/findings-ledger.md src/protocol/STATUS.md`; `git diff -- docs/adr/README.md docs/adr/000-*.md docs/adr/001-*.md docs/adr/004-sdk-probes.md` → empty.
- Every contract edit against the checkpoint's declarations: `OperationQueue.onProgress`, `rejected(reason, opId)`, `DotnetRunOptions.env` comment, `CapabilityProvenance` + `SdkInfo` (no `nounFirstSyntax`), `MutationKind`/`MutationRequest`/`MutationDecision`/`ProjectMutator` (`canMutate`, `previewCpmImpact`, no `apply`), `UnsupportedProjectReason` with `'sdk-too-old'`, `resourceKeys.sources(projectDir)` required argument, `sourceUrl` parameters, `search/query` `sourceUrls?` and optional `sourcesUnavailable` (siblings at `messages.ts:121,127` optional), three `sourceUrl?` payloads, `readme/image` in the Package details group with `// main`, `generation?` on the ok variant only, `makeOk` fourth parameter omitting the key when `undefined`, `isResponseEnvelope`/`StreamEnvelope`/`makeStream` unchanged (`guards.ts:80-88`), `index.ts` is `export *`.
- `src/protocol/domain.ts:42,56,58` (`'props'` in `VersionDeclaration`, `definedIn?`) and `:298-306` (`OperationProgress.opId`) back the ADR-004 and ADR-003 sentences; `src/core/contracts.ts:248-251` (the `Transport` comment ADR-005 now equals), `:291-302` (`ProjectExecutionContext` fields named in ADR-005), `:132-138` (`InvalidationEvent` unchanged).
- `docs/adr/000-release-and-compatibility-policy.md:1-12` (amendment form matched by all seven headers), `docs/adr/004-sdk-probes.md:57-69,103-126` (finding 2 and the `add-no-version` row), `docs/adr/003:30-51` and `docs/adr/004:36-55` with line numbers for the fixes, `docs/adr/005:14-35`.
- `eslint.config.mjs` and `package.json` (`grep max-len|markdownlint` → none), `.editorconfig` (no line limit), `scripts/gen-protocol-docs.mjs:49-59,151-165` (Notes rendering), `.github/instructions/markdown.instructions.md` (fenced blocks need a language identifier).
- Not run by me: the gates; the brief's results (check-types 0, eslint 0, 11 protocol tests, `## Requests (43)`) are consistent with the diff and I ran only inspection commands.
```

Acted on: both blocking defects fixed with the given text, the gates run again on the final tree, the
CHANGELOG headline of non-blocking 5 applied. Non-blocking 1 to 4 and 6 are left to the items the review
names (P6.3, P6.2, P7.5, P4.1, P2.9); the tracker row of P1.1b lists them.

## Exact next step (one item ID)

P1.2 (`src/core/util/**`).

# ADR-007: Typed envelope protocol for webview ↔ host

Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: the `readme/image` request, generation on responses, naming rule for sources) · Amended: 2026-10-15 (plan item P6.4a: the cpm/preview request)

## Context

The webview edge used `{ type: string } & Record<string, any>`; the host had two partially typed
unions; the same concept had different field names per surface; some handlers never answered on
failure; legacy handlers were kept for a client that ships with its server.

The amendment of 2026-10-12 records the contract changes of plan item P1.1b and plan decisions D7 and
D13 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`, §1).

## Decision

- `src/protocol/` is the single contract shared by host and both webviews: `domain.ts` (types),
  `messages.ts` (`RequestMap`, `EventMap`), `envelope.ts` (request / cancel / stream / response /
  event), `guards.ts` (runtime validation both directions).
- Every request has an `id`; the host sends **exactly one** terminal response (ok or error) per
  id, optionally preceded by `stream` chunks. `WebviewHost` enforces this: handler throw → error
  response; queue rejection → `rejected` outcome; webview dispose → `disposed` error; cancel →
  `cancelled`.
- Events are uncorrelated host → webview notifications.
- Both surfaces use the same request/event types; surface-specific requests return `unsupported`
  on the wrong surface.
- A generated protocol reference (`docs/protocol.md`, produced by `scripts/gen-protocol-docs.mjs`
  from `messages.ts`) is checked in CI for drift.
- `readme/image` is the 43rd request: it fetches one README image host-side (ADR-006).
- `cpm/preview` is the 44th request: the mutator's affected-projects preview (`ProjectMutator.previewCpmImpact`) for the dialog of interaction model §5. The preview carries every project the central entry applies to, the asking one included; an outcome's `affectedProjects` lists the other projects. The edit itself still goes through `ops/update` or `ops/install`, whose gate decides.
- An ok response may carry `generation`, the generation of the resource its result was computed for
  (ADR-002). Only the ok variant of the response envelope has the field; result types and stream
  envelopes do not. A webview drops a stale result by generation and a late chunk by request id.
- Naming rule for sources. A string or string-array field that holds a source URL is `sourceUrl` /
  `sourceUrls`; a field that holds a source name is `sourceName`; a field holding `NuGetSource` or
  `{ name; url }` objects is `sources`; `SessionSnapshot.selectedSource` keeps its name because its
  value is a selection (`'all'` or a URL). Its consequences: the payloads of `package/versions`,
  `package/metadata` and `package/readme` take `sourceUrl?`, `search/query` takes `sourceUrls?`,
  and the `versions` and `metadata` builders of `resourceKeys` take `sourceUrl`.

## Consequences

- No `any` at the boundary; exhaustive switches on `type`.
- Old message names are deleted, not aliased.

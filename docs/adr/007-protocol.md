# ADR-007: Typed envelope protocol for webview ↔ host

Status: accepted · Date: 2026-10-10

## Context

The webview edge used `{ type: string } & Record<string, any>`; the host had two partially typed
unions; the same concept had different field names per surface; some handlers never answered on
failure; legacy handlers were kept for a client that ships with its server.

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

## Consequences

- No `any` at the boundary; exhaustive switches on `type`.
- Old message names are deleted, not aliased.

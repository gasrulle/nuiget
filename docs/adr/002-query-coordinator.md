# ADR-002: Resource queries, generations and invalidation (`QueryCoordinator`)

Status: accepted · Date: 2026-10-10

## Context

Five refresh verbs (`refresh`, `refreshScoped`, `revalidate`, `forceRefresh`, `fullRefresh`) with
overlapping semantics, a shared debounce timer, and both surfaces independently computing updates
for the same project.

## Decision

- Cacheable results are **resources** identified by `ResourceKey` (see `protocol/domain.ts`
  `resourceKeys`). Each key has a monotonically increasing **generation**.
- `QueryCoordinator.query(key, compute)` dedups computation per `(key, generation)`; concurrent
  subscribers join the running computation; a cached fresh value resolves immediately.
- `invalidate(scope, reason)` bumps the generation of every key the scope matches. Scopes merge:
  `workspace ⊇ project ⊇ package`; a `sources` scope invalidates search/updates/metadata keys.
- Invariants (each a unit test):
  1. one computation per key/generation;
  2. invalidation during a computation marks its result stale — the stale result is never cached
     and subscribers receive `StaleQueryError`, after which the coordinator recomputes if any
     subscriber remains;
  3. an old completion cannot repopulate an invalidated entry;
  4. a subscriber releasing does not cancel work another subscriber still awaits;
  5. after inputs settle, all subscribers converge to the same `(key, generation)` value.
- The host broadcasts `resources/invalidated { scope, reason, generation }`; each webview
  re-requests only the resources it currently displays. Both surfaces requesting the same key
  share one computation.
- Request ids correlate RPC; generations establish freshness; operation ids protect operation
  outcomes from being discarded by "newer query wins".
- Invalidation sources: operations (package scope → project scope when restore ran), file watchers
  (project files, imported props/targets, `nuget.config`, `global.json`, lock/assets files),
  manual refresh (workspace), source mutations (sources), workspace-folder changes (workspace).

## Consequences

- "Each operation refreshes both surfaces" is replaced by the convergence invariant above.
- Webviews contain no refresh logic beyond "re-request what I show when its key is invalidated".

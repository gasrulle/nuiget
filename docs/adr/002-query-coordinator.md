# ADR-002: Resource queries, generations and invalidation (`QueryCoordinator`)

Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: scope and merge tables, source keys per project directory, generation on responses)

## Context

Five refresh verbs (`refresh`, `refreshScoped`, `revalidate`, `forceRefresh`, `fullRefresh`) with
overlapping semantics, a shared debounce timer, and both surfaces independently computing updates
for the same project.

The amendment of 2026-10-12 records the contract changes of plan item P1.1b and plan decisions D7 and
D13 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`, §1).

## Decision

- Cacheable results are **resources** identified by `ResourceKey` (see `protocol/domain.ts`
  `resourceKeys`). Each key has a monotonically increasing **generation**.
- `QueryCoordinator.query(key, compute)` dedups computation per `(key, generation)`; concurrent
  subscribers join the running computation; a cached fresh value resolves immediately.
- `invalidate(scope, reason)` bumps the generation of every key the scope matches:

  ```text
  workspace            → every key
  project{paths}       → projects, allProjects:*, installed:<p>, updates:<p>|*, transitive:<p>
  package{paths, ids}  → everything project{paths} matches, plus versions:<id>|*, metadata:<id>@*
  sources              → sources, updates:*, allProjects:updates*, versions:*, metadata:*
  metadata{ids}        → versions:<id>|*, metadata:<id>@*
  ```

  Source keys are `sources:<projectDir>`, one per project directory (ADR-005). A key's kind is the text
  before its first `:`, so the `sources` scope reaches all of them. `search/query` is not a cached resource
  and has no key.
- Pending invalidations merge into one scope that reaches at least every key either input reaches:

  ```text
  workspace + any               → workspace
  project + project             → project   (paths ∪)
  project + package             → package   (paths ∪, ids of the package scope)
  package + package             → package   (paths ∪, ids ∪)
  metadata + metadata           → metadata  (ids ∪)
  metadata + project | package  → package   (paths of the other scope, ids ∪)
  sources + sources             → sources
  sources + metadata            → sources   (sources already reaches every versions and metadata key)
  sources + project | package   → workspace (no narrower scope spans both)
  ```

  `src/core/queries/scopes.ts` (plan item P1.7) implements both tables and must equal them.
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
  share one computation. The generation a webview compares against travels on the ok response
  envelope (ADR-007, ADR-008).
- Request ids correlate RPC; generations establish freshness; operation ids protect operation
  outcomes from being discarded by "newer query wins".
- Invalidation sources: operations (package scope → project scope when restore ran), file watchers
  (project files, imported props/targets, `nuget.config`, `global.json`, lock/assets files),
  manual refresh (workspace), source mutations (sources), workspace-folder changes (workspace).

## Consequences

- "Each operation refreshes both surfaces" is replaced by the convergence invariant above.
- Webviews contain no refresh logic beyond "re-request what I show when its key is invalidated".

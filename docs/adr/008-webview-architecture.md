# ADR-008: Webview architecture — shared slices, primitives, two entry points

Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: generation on responses; plan item P2.9: per-key generations on `resources/invalidated`) · Amended: 2026-10-30 (UX plan item UX-P1.2: ADR-011 replaces the typography bullet, type in px since UX-P1.1; the `ErrorBoundary` of both entries, 2.0 plan item P9.9)

## Context

`App.tsx` (3,220 lines, 63 `useState`, 50 `useRef`) owned routing, persistence, search, streaming
aggregation and sync; `InstalledTab` took 57 props; the sidebar re-implemented the same logic;
4,200 lines of CSS with 71 hard-coded colours and no shared tokens; no dialog semantics.

The amendment of 2026-10-12 records the contract changes of plan item P1.1b and plan decisions D7 and
D13 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`, §1).

## Decision

- Two entry points (`webview/main`, `webview/sidebar`) over **shared source modules**
  (`webview/shared`). Separate bundles stay (two JS environments); shared chunks only if a
  metafile shows a win.
- `shared/bus/useMessageBus` wraps the protocol: `request(type, payload, { signal, onChunk })`,
  `onEvent(type, handler)`; stale responses are discarded by id, stale resources by generation:
  `request` exposes the `generation` of the ok response, so `useResource` can discard a result whose
  generation is below the one listed for its key in the latest `resources/invalidated` event
  (`keys[].generation`; the event's own `generation` is a sequence number and is never compared with
  a response). A key absent from `keys` has nothing to discard. Chunks are discarded by id only.
- `shared/store`: reducer slices with narrow contexts — `session` (committed + pending),
  `projects`, `installed`, `updates`, `transitive`, `search`, `details`, `allProjects`, `sources`,
  `ops`. A `useResource(key, requester)` hook subscribes to `resources/invalidated` and re-requests.
  No store library unless measured rerender fan-out demands it.
- `shared/primitives`: `IconButton`, `Badge`, `Row`, `SectionHeader`, `Dialog` (focus trap,
  restore, Escape, `role="dialog"`/`aria-modal`), `Popover` (portal, collision), `Tabs`
  (`tablist`/`tab`/`aria-selected`), `LiveStatus` (`role="status"`), `EmptyState`, `Sash`,
  `Skeleton`. Each has RTL + axe tests.
- `shared/tokens.css`: spacing, radius, row heights, icon sizes, z-index scale, motion durations,
  `em`-based typography on `--vscode-font-size`. No hex colours outside tokens; theme coverage for
  light, dark, high-contrast, `forced-colors`, reduced motion in one place.
- Feature folders (`features/search`, `installed`, `updates`, `details`, `sources`,
  `all-projects`, `transitive`) own their view + hooks; the shell is < 300 lines.
- Interaction model is documented in `docs/ux/interaction-model.md` before features migrate.
- `data-testid` hooks are stable, documented in the interaction model, and used by ExTester tests.
- Both entries (`src/webview/main/index.tsx`, `src/webview/sidebar/index.tsx`) wrap `StoreProvider`
  in the `ErrorBoundary` primitive, outside it, so Reload remounts the store; its `onError` is the
  one sender of `ui/reportError` and never throws (plan item P9.9).

## Consequences

- Sidebar and main panel share list rows, selection, filtering and optimistic reconciliation.
- Accessibility is a property of primitives, not of each feature.

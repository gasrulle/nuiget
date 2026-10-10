---
title: React 19 Suspense Pattern Reference
---

# React 19 Suspense

React 19 is released. Suspense works with lazy component loading and supported
Suspense-enabled data sources. It does not detect ordinary fetches in effects or
event handlers, and a React version upgrade does not require migrating data flows.

## Code splitting

Preserve existing lazy loading and boundaries where the build supports them:

```tsx
import { lazy, Suspense } from 'react';

const Details = lazy(() => import('./Details'));

function DetailsRegion() {
  return (
    <Suspense fallback={<p role="status">Loading details...</p>}>
      <Details />
    </Suspense>
  );
}
```

The example is illustrative, not a request to change nUIget's esbuild bundles.

## Promise-based data

Use only a stable Promise supplied from outside the suspending render or a
supported Suspense-enabled data source. Do not implement data suspension by
throwing a newly created Promise or treating `useMemo` as a durable cache.
See [the use reference](./react19-use.md) for a stable-Promise example.

Suspense provides a loading fallback, not an error UI. Pair it with an existing
Error Boundary where rejection is possible. Choose boundary placement so that
loading one region does not unnecessarily hide the whole interface.

## nUIget

Keep extension/webview messaging, existing caches, explicit loading state,
progressive enrichment, and stale-response guards. This is a client-only webview,
not an SSR or Server Component application. Adopt a new boundary only for a
demonstrated UX need and verify focus, visible content, and failure behavior.

See [React Suspense](https://react.dev/reference/react/Suspense) and
[React use](https://react.dev/reference/react/use).

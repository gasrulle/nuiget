---
description: 'Performance guidance for nUIget services and React webviews'
applyTo: 'src/**/*.ts,src/**/*.tsx,src/webview/**/*.css,esbuild.mjs'
---

# Performance

Read the caching, messaging, and rendering sections of `ARCHITECTURE.md`.
Optimize a measured bottleneck without changing the documented behavior.

## Extension services

- Reuse source resolution, HTTP session pooling, request deduplication, bounded
  caches, and batch helpers. Do not add per-package or per-project source discovery
  inside an already pre-resolved loop.
- Preserve progressive responses and background enrichment; do not block initial
  package rows on metadata or icons.
- Keep post-operation refreshes scoped and prevent redundant cross-panel reloads.
- Avoid synchronous filesystem work on hot paths and unbounded concurrency,
  response buffers, caches, or retries.
- Dispose listeners, timers, connections, and pending work through existing
  lifecycle paths.
- Update performance-sensitive benchmarks and their baseline as required by
  `.github/copilot-instructions.md`.

## React webviews

- Preserve memoized boundaries, stable callbacks, ref mirrors, and existing
  virtualization. Use stable row identities, not array indexes for reorderable data.
- React Compiler is not configured. Do not remove manual memoization or add a
  compiler/build migration without an explicit requirement and measurements.
- Use transitions or deferred values for non-urgent rendering where appropriate;
  they do not make expensive synchronous computation disappear.
- Batch DOM reads before writes. Avoid layout-thrashing loops and animations of
  layout properties; prefer transforms and respect reduced-motion preferences.
- Reserve image/placeholder dimensions and avoid clearing visible rows during a
  background revalidation.
- Use the existing esbuild bundles and VS Code message bridge. This project has
  no SSR, hydration, server routes, or Server Components; do not introduce them
  to satisfy generic web performance advice.

## Verification

Measure the actual flow being improved and distinguish UI latency, network
latency, and rendering cost. Follow the existing test and benchmark requirements;
do not reduce required validation as a performance optimization.

Adapted for this repository from [Awesome Copilot's performance instructions](https://github.com/github/awesome-copilot/blob/82701c24b99488536ca399ff4789a458b7a05db7/instructions/performance-optimization.instructions.md).

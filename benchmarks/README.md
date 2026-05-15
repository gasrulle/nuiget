# nUIget Benchmarks

Vitest-based microbenchmarks for performance-sensitive code paths (caching, HTTP, parsing, update checks, rendering).

## Running

```bash
npm run bench           # run all benchmarks
npm run bench:save      # regenerate benchmarks/baseline.json
npm run bench:compare   # compare current run vs baseline (vitest --compare)
```

## Scope and tolerance

- **Single-machine signal only.** Numbers are reproducible only on the *same* machine, OS, and Node version. Do **not** treat baseline.json as a cross-machine ground truth — CI runners and developer laptops will differ by 2–10x for the same code.
- **Tolerance: ±15 %.** Treat any regression smaller than ~15 % as noise. Genuine regressions almost always show up as >25 % slowdowns on hot paths.
- **Regenerate after performance-affecting changes.** Run `npm run bench:save` and commit the updated `benchmarks/baseline.json`. CI compares PRs against this baseline.

## What's measured

Benchmarks live in `src/test/benchmarks/*.bench.ts`:

- `cache.bench.ts` — LRUMap and WorkspaceCache hit/miss/eviction
- `csproj-parsing.bench.ts` — .csproj XML parsing
- `http.bench.ts` — fetchJson / HTTP/2 client overhead (mocked)
- `markdown.bench.ts` — README rendering pipeline (DOMPurify + marked)
- `metadata.bench.ts` — package metadata fetch (mocked)
- `project-parsing.bench.ts` — project.assets.json / lock-file parsing
- `react-rendering.bench.ts` — App / sidebar render passes (jsdom)
- `search.bench.ts` — search merging + relevance sorting
- `source-health.bench.ts` — failedEndpointCache and source health monitor
- `update-checking.bench.ts` — checkPackageUpdates and checkPackageUpdatesMinimal
- `utils.bench.ts` — validators, version-spec parsing, topological sort

## Adding a benchmark

1. Add a `*.bench.ts` file under `src/test/benchmarks/`.
2. Import `bench, describe` from `vitest`.
3. For service benchmarks, use `mockServiceHttp(service)` from `setup.ts` — never use MSW (it cannot intercept HTTP/2).
4. Run `npm run bench:save` and commit the updated baseline.

## End-to-end timings

Microbenchmarks don't capture user-perceived latency (panel open → first paint, install → UI updated). For those, enable `nuiget.enablePerformanceLogging` in VS Code settings and inspect the `nUIget` output channel for `[perf]` lines.

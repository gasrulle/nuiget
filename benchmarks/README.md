# nUIget Benchmarks

Vitest-based microbenchmarks for performance-sensitive code paths (caching, HTTP, parsing, update checks, rendering).

## Running

```bash
npm run bench           # run all benchmarks
npm run bench:save      # regenerate benchmarks/baseline.json
npm run bench:compare   # compare current measurements with the stored baseline
```

## Scope and tolerance

- **Single-machine signal only.** Numbers are reproducible only on the *same* machine, OS, and Node version. Do **not** treat baseline.json as a cross-machine ground truth — CI runners and developer laptops will differ by 2–10x for the same code.
- **Tolerance: ±15 %.** Treat any regression smaller than ~15 % as noise. Genuine regressions almost always show up as >25 % slowdowns on hot paths.
- **Regenerate after performance-affecting changes.** Run `npm run bench:save` and commit the updated `benchmarks/baseline.json`.
- **Informational in CI.** The `Benchmark (informational)` job compares every run against the baseline and reports the result, but it never fails the pipeline: runner hardware varies too much for a hard gate.

## What's measured

The benchmarks of 2.0 sit next to the module they measure, as `<module>.bench.ts` (plan decision D8, item P8.2a):

- `src/core/versioning/versioning.bench.ts` — NuGet version parsing, comparison and version specs
- `src/core/cache/cache.bench.ts` — the two-tier cache and its persistent tier
- `src/core/ops/ops.bench.ts` — what the operation queue adds to a workflow
- `src/core/queries/queries.bench.ts` — which resource keys an invalidation scope reaches, and merging scopes
- `src/core/http/transport.bench.ts` — `NodeTransport` over HTTP/1.1 from a local server, plain and gzip
- `src/core/catalog/catalog.bench.ts` — `Catalog.updates`, `versions`, `search`, `metadata`, `quickSearch` and
  `allProjectsTransitive` through the real feed clients over a fake transport, nuspec parsing and relevance ranking
- `src/core/project/project.bench.ts` — static inspection of the fixture projects, the assets file, project references
- `src/core/feeds/health.bench.ts` — the source health tracker
- `src/core/cli/validate.bench.ts` — the argument validators of the dotnet runner
- `src/core/util/topo.bench.ts` — dependency ordering of multi-project operations
- `src/webview/shared/primitives/Listbox.bench.ts` — mounting a virtualized list of 1 000 rows (jsdom)
- `src/webview/shared/search/parseSearchQuery.bench.ts` — the parser of the unified search box
- `src/webview/main/features/details/markdown.bench.ts` — README rendering (jsdom)

The 1.x benchmarks were deleted with the 1.x code at P8.2; `src/test/benchmarks` keeps only the runner helper
`benchmark.ts`, its test and `run.mjs`. Every `src/**/*.bench.ts` is run; `tsconfig.json` leaves the benches out of the
extension build and `tsconfig.vitest.json` type-checks all of them.

## Adding a benchmark

1. Add `<module>.bench.ts` next to the module it measures. Put `// @vitest-environment jsdom` on its first line when it
   needs a DOM.
2. Import `test, describe` from `vitest` and `runBenchmark` from `src/test/benchmarks/benchmark.ts` (relative path).
   Define `test('name', async (context) => { await runBenchmark(context, 'name', callback); })`.
3. Never reach the network: feed reads use `FakeTransport` from `src/core/feeds/testSupport.ts`, project reads the
   tracked `__fixtures__`.
4. Run `npm run bench:save` and commit the updated baseline.

Vitest 5 benchmarks run in the derived `backend (bench)` project. The runner
consolidates JSON reporter measurements into one versioned baseline keyed by
file, suite, test, and benchmark name. `bench:compare` uses `bench.from()` to
replay those results alongside current measurements; missing baselines or failed
callbacks fail the command. Removed Vitest 4 flags such as `--compare` and
`--outputJson` are not used.

## End-to-end timings

Microbenchmarks don't capture user-perceived latency (panel open → first paint, install → UI updated). For those, enable `nuiget.enablePerformanceLogging` in VS Code settings and inspect the `nUIget` output channel for `[perf]` lines.

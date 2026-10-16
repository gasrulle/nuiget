# nUIget 2.0 performance baseline

The baseline that the acceptance cut (plan item P7.6) checks the 2.0 extension against. It was written once by plan
item P7.2a, from one CI run. Every number below comes from that run's jobs and artifacts. None comes from a local
machine or from an untracked capture.

## Source

| | |
|---|---|
| CI run | 38818381022 (all 13 jobs green) |
| Commit | `758241c` on `labs/2.0` |
| Date | 2026-10-15 (UTC) |
| Runner image | GitHub-hosted `ubuntu-24.04`, image version 20261012.334 |
| .NET SDK | 10.0.402 (`setup-dotnet` with `10.0.x`) |
| Node.js | 24 (`.nvmrc`) |
| VS Code | 1.140.0 for the `UI 2.0` job (the ExTester default on that day; ChromeDriver 150.0.7871.124) |

## Baseline and tolerances

| Metric | Baseline | Tolerance for P7.6 | Source |
|---|---:|---|---|
| `sdk-probe`: `dotnet --version`, the job's first dotnet call | 89 ms | ≤ 133 ms | `Perf baseline (informational)` job, artifact `perf-baseline` |
| `config-paths`: `dotnet nuget config paths` in the e2e project | 411 ms | ≤ 616 ms | same |
| `restore-cold-single`: `dotnet restore`, e2e project, empty caches | 1628 ms | ≤ 2442 ms | same |
| `restore-cold-multi`: `dotnet restore`, `perf-multitfm`, empty caches | 1848 ms | ≤ 2772 ms | same |
| `restore-warm-multi`: the same restore again, `obj/` deleted | 1154 ms | ≤ 1731 ms | same |
| `evaluate-properties-multi`: the evaluator's properties run, `perf-multitfm` | 339 ms | ≤ 508 ms | same |
| `evaluate-items-multi-net8.0`: item run, `TargetFramework=net8.0` | 454 ms | ≤ 681 ms | same |
| `evaluate-items-multi-netstandard2.0`: item run, `TargetFramework=netstandard2.0` | 453 ms | ≤ 679 ms | same |
| `evaluate-properties-single`: the properties run, e2e project | 450 ms | ≤ 675 ms | same |
| `evaluate-items-single`: the item run, e2e project | 447 ms | ≤ 670 ms | same |
| `evaluate-combined-single`: properties and items in one run (timing only) | 448 ms | ≤ 672 ms | same |
| Cold search: Enter to the first row, main panel | 1086 ms | target 1700 ms | `UI 2.0` job log, line `[P5.6] cold search` |
| Warm search: the same search again | 541 ms | target 900 ms | `UI 2.0` job log, line `[P7.2] warm search` |
| `dist/extension.js` (2.0, minified) | 292 128 bytes | ≤ 321 341 bytes | `E2E 2.0` build step summary |
| `dist/webview.js` (2.0, minified) | 523 296 bytes | ≤ 575 626 bytes | same |
| `dist/sidebar.js` (2.0, minified) | 318 803 bytes | ≤ 350 684 bytes | same |

Rules for the tolerances:

- A dotnet timing passes when it is at most 1.5 × its baseline on the same runner image. On another image, measure
  the baseline again first; the numbers are not comparable across images.
- A bundle passes when it is at or under its ceiling in `esbuild.mjs`. CI enforces this on every push.
- A search target is `Math.ceil(measured × 1.5 / 100) × 100` ms: 1700 ms cold and 900 ms warm.
- When a cold search goes over its target on two consecutive runs, open a ⚑ row P7.2d for a lite `found` chunk on
  `search/query`. That is a contract change (decision D6) with its own ruling. Do not open the row before then.

## Definitions

- **Cold restore**: the first `dotnet restore` into empty folders for `NUGET_PACKAGES` and `NUGET_HTTP_CACHE_PATH`.
  Every package is downloaded from nuget.org.
- **Warm restore**: the same restore again, in the same folders, after `obj/` was deleted. The packages are in the
  global packages folder, so only the restore graph is computed again.
- **Evaluation**: the `dotnet msbuild -getProperty` and `-getItem` runs of `MsBuildProjectEvaluator`, with the argv
  that `scripts/probe-sdk.mjs` writes. They run on a restored project, as in the extension. The combined run asks
  for both in one process. Since P7.2c it is the evaluator's first run (without the global property the script
  passes; same cost). Its output in the script is still no evidence; the probe rows are.
- **Cold search**: the first search of a session. The host connects to the feeds and enriches the rows before it
  answers.
- **Warm search**: the same text searched again in the same session. The feeds are connected and the metadata is
  cached.

## The `perf-multitfm` fixture

`src/test/e2e/fixtures/perf-multitfm/` is derived from `src/test/e2e/fixtures/e2e-workspace/`:

- `MultiTfm.csproj` is `TestProject.csproj` with three changes:
  - `<TargetFrameworks>net8.0;netstandard2.0</TargetFrameworks>` replaces `<TargetFramework>net8.0</TargetFramework>`.
  - The `ImplicitUsings` and `Nullable` properties are removed.
  - The two references stay: Newtonsoft.Json 13.0.2 and Serilog 3.1.1.
- `nuget.config` is a copy of the e2e one, with nuget.org as the only source.

It sits next to `e2e-workspace`, not inside it, so neither the e2e suites nor ExTester open it. Only the source files
are tracked; `obj/` is not.

## Measuring again

- Dotnet timings: run `npm run perf:baseline`. It writes `out/perf/perf-baseline.json` and prints one line per row.
  `--out <file>` writes the file elsewhere, and `--summary <file>` appends a Markdown table. The CI job
  `Perf baseline (informational)` runs the script on every push and uploads the JSON as the artifact
  `perf-baseline`. Local numbers on other hardware are not comparable with the table above.
- Search: `rm -rf dist && NUIGET_V2=1 npm run package`, then
  `NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2`. Read the `[P5.6] cold search` and
  `[P7.2] warm search` lines in the output.
- Bundles: `rm -rf dist && node esbuild.mjs --v2 --production --analyze`. The metafiles go to `out/esbuild/`.

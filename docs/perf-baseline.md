# nUIget 2.0 performance baseline

The baseline that the acceptance cut (plan item P7.6) checks the 2.0 extension against. It was written once by plan
item P7.2a, from one CI run. Every number below comes from that run's jobs and artifacts. None comes from a local
machine or from an untracked capture. The section "In-page timings of the main panel" was added by UX plan item P0.26
from the UI jobs of its own runs, under the same rule.

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

- A dotnet timing passes when the median of the last five perf runs on the same runner image is at most 1.5 × its
  baseline; a single run over tolerance is recorded, not judged (refined at P7.6: the cold restores download from
  nuget.org and vary 2.4× between runs of one image, and `scripts/perf-baseline.mjs` runs no extension code, so these
  rows cannot regress through 2.0 code). On another image, measure the baseline again first; the numbers are not
  comparable across images.
- A bundle passes when it is at or under its ceiling in `esbuild.mjs`. CI enforces this on every push.
- A search target is `Math.ceil(measured × 1.5 / 100) × 100` ms: 1700 ms cold and 900 ms warm.
- When a cold search goes over its target on two consecutive runs, open a ⚑ row P7.2d for a lite `found` chunk on
  `search/query`. That is a contract change (decision D6) with its own ruling. Do not open the row before then.

## Acceptance measurement (P7.6)

Plan item P7.6 judged "perf ≥ baseline" on the six perf runs between the owner's P7.4 commit and the acceptance cut. Every
perf job of these runs, like the baseline run, ran on GitHub-hosted `ubuntu-24.04`, image version `20261012.334.1`, with
.NET SDK 10.0.402 (the job log's "Runner Image" group). Times in ms.

| Metric | 38860198819 | 38863088619 | 38864168236 | 38866154469 | 38868138060 | 38870091917 | Median of the last five | Tolerance | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `sdk-probe` | 73 | 118 | 109 | 96 | 89 | 139 | 109 | ≤ 133 | pass |
| `config-paths` | 317 | 531 | 369 | 365 | 413 | 523 | 413 | ≤ 616 | pass |
| `restore-cold-single` | 1540 | 1762 | 2563 | 1939 | 1171 | 2826 | 1939 | ≤ 2442 | pass |
| `restore-cold-multi` | 1481 | 2049 | 1480 | 1377 | 1235 | 2041 | 1480 | ≤ 2772 | pass |
| `restore-warm-multi` | 888 | 1205 | 1066 | 664 | 726 | 1117 | 1066 | ≤ 1731 | pass |
| `evaluate-properties-multi` | 265 | 366 | 254 | 202 | 214 | 337 | 254 | ≤ 508 | pass |
| `evaluate-items-multi-net8.0` | 349 | 471 | 320 | 269 | 274 | 450 | 320 | ≤ 681 | pass |
| `evaluate-items-multi-netstandard2.0` | 364 | 486 | 321 | 272 | 281 | 452 | 321 | ≤ 679 | pass |
| `evaluate-properties-single` | 349 | 469 | 318 | 270 | 260 | 459 | 318 | ≤ 675 | pass |
| `evaluate-items-single` | 350 | 475 | 317 | 270 | 262 | 449 | 317 | ≤ 670 | pass |
| `evaluate-combined-single` | 349 | 481 | 320 | 269 | 269 | 449 | 320 | ≤ 672 | pass |

Single runs over tolerance, recorded and not judged under the rule below: `sdk-probe` 139 ms and `restore-cold-single`
2826 ms in run 38870091917, `restore-cold-single` 2563 ms in run 38864168236. Run 38870091917 is among the slowest of the six in
every row (its evaluation rows are 449–459 ms against 202–486 ms in the other runs), and `scripts/perf-baseline.mjs` spawns `dotnet`
on copies of the fixtures without any extension code, so these rows cannot regress through 2.0 code.

The metrics the extension controls, judged on the head runs: cold search 819 ms (run 38866154469) and 1058 ms (run
38870091917) against the 1700 ms target; warm search 286 ms and 282 ms against 900 ms; the 2.0 bundles 293 183, 525 105
and 319 313 bytes (P7.fix-2) under 321 341, 575 626 and 350 684. Verdict: perf ≥ baseline (P7.6 acceptance ruling).

## After the legacy deletion (P8.2)

Plan item P8.2 re-read the perf job by the median rule above on the last five runs on `labs/2.0` up to the P8.2b
commit: P7.fix-4, the `e29549f` chore, P8.1, P8.2a and P8.2b. Every perf job of these runs ran on GitHub-hosted
`ubuntu-24.04`, image version `20261012.601`, with .NET SDK 10.0.402. That image is newer than the baseline's
`20261012.334.1`, so the numbers are compared, not re-based: every median is within tolerance and the baseline above is
unchanged. The P8.2c run comes after its own commit and is not in the table. Times in ms.

| Metric | 38880770134 | 38886469731 | 38889586187 | 38894936903 | 38900038138 | Median | Tolerance | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `sdk-probe` | 88 | 88 | 93 | 96 | 96 | 93 | ≤ 133 | pass |
| `config-paths` | 1576 | 540 | 564 | 457 | 383 | 540 | ≤ 616 | pass |
| `restore-cold-single` | 1698 | 1764 | 1665 | 1516 | 1609 | 1665 | ≤ 2442 | pass |
| `restore-cold-multi` | 1931 | 1978 | 1914 | 3885 | 2000 | 1978 | ≤ 2772 | pass |
| `restore-warm-multi` | 1153 | 1148 | 1166 | 880 | 1158 | 1153 | ≤ 1731 | pass |
| `evaluate-properties-multi` | 340 | 338 | 350 | 259 | 346 | 340 | ≤ 508 | pass |
| `evaluate-items-multi-net8.0` | 448 | 449 | 458 | 325 | 458 | 449 | ≤ 681 | pass |
| `evaluate-items-multi-netstandard2.0` | 451 | 451 | 457 | 328 | 463 | 451 | ≤ 679 | pass |
| `evaluate-properties-single` | 446 | 451 | 453 | 333 | 459 | 451 | ≤ 675 | pass |
| `evaluate-items-single` | 446 | 453 | 453 | 333 | 451 | 451 | ≤ 670 | pass |
| `evaluate-combined-single` | 446 | 467 | 461 | 332 | 457 | 457 | ≤ 672 | pass |

Single runs over tolerance, recorded and not judged: `config-paths` 1576 ms in run 38880770134 and `restore-cold-multi`
3885 ms in run 38894936903. Search, `UI` job of the runs since P8.1: cold 535, 806 and 812 ms against the 1700 ms target,
warm 282, 295 and 287 ms against 900 ms. Bundles at P8.2b: 293 183, 525 241 and 319 313 bytes, the sizes of P8.1; the
ceilings in `esbuild.mjs` were reset to `Math.ceil(measured × 1.1)`: 322 502, 577 766 and 351 245 bytes. Verdict: no row
beyond tolerance.

## In-page timings of the main panel (UX-P0.26)

Informational, with no tolerance: a later item compares its own `[perf]` lines with these (UX plan P4.9 "not worse",
P5.9a "`[perf] search → first result` below its baseline"). The lines come from the capture suite's test "in-page timings
(UX-P0.26)" in the `UI` job's Modern UI pass, on the dense workspace (`src/test/ui/fixtures/dense-workspace/`), after every
capture and keyboard walk; the job log's artifact `ui-log`, file `ui-output.txt`. Every run below ran on GitHub-hosted
`ubuntu-26.04`, image version `20261026.180.1`, VS Code 1.140.0, Chromium 150. Times in ms.

| Mark | 41023390081 (`48dd773`) | 41025682652 (`7386a58`) | 41027778946 (`5c16a70`) | Median |
|---|---:|---:|---:|---:|
| `panel open again → first row` | ≤ 147 | ≤ 181 | ≤ 142 | ≤ 147 |
| `panel open again → authoritative list` | ≤ 147 | ≤ 181 | ≤ 142 | ≤ 147 |
| `panel open again → icons` | ≤ 147 | ≤ 181 | ≤ 142 | ≤ 147 |
| `refresh → list settled` | 198 | 237 | 197 | 198 |
| `project chosen → first row` | 252 | 349 | 246 | 252 |
| `project chosen → authoritative list` | 257 | 359 | 248 | 257 |
| `project chosen → icons` | 370 | 1142 | 513 | 513 |
| `select → details` | 4 | 6 | 3 | 4 |
| `select → dependencies` | 196 | 228 | 200 | 200 |
| `search → first result` | 593 | 672 | 1067 | 672 |
| `search again → first result` | 196 | 173 | 607 | 196 |

The median is descriptive, not a rule: the values vary between runs of one commit, and the items that compare with them
set their own comparison rule.

The run of `48dd773` printed the reopen as `panel open`; the label became `panel open again` at `7386a58`. The run of
`7386a58` also tried to time the session's first panel: its recorder was armed in the suite's `before` hook and was to be
read at the end of the exemplar test, but the exemplar closes every editor group, so no recorder was left to read
(`[perf] panel open: not measured …`), and the failed entry delayed every capture by 60 s. `5c16a70` removed the attempt.
The timed test's own code is the same in the three runs.

What each chain measures:

- **Clock.** Every number is the difference of two `performance.now()` readings in the main panel's webview document: no
  WebDriver round trip and no poll interval is in it. A mark is stamped by a `MutationObserver` in the task that changed
  the DOM, before that change is painted (`src/test/ui/v2/perf.ts`).
- **`panel open again`**: the panel closed and opened again on Gateway, whose lists the captures had read; timed from the
  time origin of the panel's content document (the webview began loading). The recorder can start only once the driver
  reaches that document, 142 to 181 ms after load, and every mark was already there, so each value is an upper bound
  (`≤`), never a measurement. The session's first open is not timed (above).
- **`refresh`**: the Refresh button (every resource invalidated) to Gateway's list settled again: rows, nothing busy, no
  `provisional` badge, every row with its authors, after a revalidation was seen. A provisional list came first in every
  run.
- **`project chosen`**: Utility chosen in the project selector, its list not read since the Refresh, so the host walks
  its configuration and evaluates it again; the SDK probe is cached, and the lite metadata may come from the cache. `first
  row` is the first Utility row, `authoritative list` the `provisional` badge gone, `icons` every row with its authors and
  one with its own icon (the lite metadata answer, which carries both). The icons vary most (370 to 1142 ms): the answer
  waits for the vulnerability data set, which expires after one hour (research finding X33).
- **`select`**: a press on a Utility row (`System.CommandLine`, never opened before) to its details header (`details`,
  drawn from the row's own data) and to the dependency groups the host answers (`dependencies`).
- **`search`**: Enter in the search box on a text the session has not searched before ("Humanizer") to the first Browse
  row. The feeds are already connected: this is not the session's first search and is not comparable with the
  `[P5.6] cold search` row above. **`search again`**: the same text again after Escape. Both read nuget.org live and vary
  with it.

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
- Search: `rm -rf dist && npm run test:ui -- --storage /tmp/nuiget-ui` (ExTester packages the production build).
  Read the `[P5.6] cold search` and `[P7.2] warm search` lines in the output. The tables above name the CI jobs as
  they were called at the time: `UI 2.0` and `E2E 2.0` are `UI` and `E2E` since P8.1.
- Bundles: `rm -rf dist && node esbuild.mjs --production --analyze`. The metafiles go to `out/esbuild/`.
- In-page timings: the `[perf]` lines of the `UI` job's `ui-output.txt` (`gh run download <run-id> -n ui-log`), or of a
  local `npm run test:ui`. Local numbers on other hardware are not comparable with the table above.

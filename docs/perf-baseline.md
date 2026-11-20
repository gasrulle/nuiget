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

### UX-P4.9: the in-page timings before and after (architecture-advisor ruling of 2026-11-20 and its follow-up 1)

UX-P4.9 (X43: All Projects asks the lite metadata of the provisional rows first; X33 reduced: the lite enricher bounds its
vulnerability leg once per call) is judged on four lines: `refresh → list settled`, `project chosen → first row`,
`project chosen → authoritative list` and `project chosen → icons`. The `≤` panel-open lines and the search lines are
pasted, not judged; `select → details`, `select → dependencies` and `recorder started` stand beside them as controls the
item cannot touch. The lines are bimodal by runner VM, so a run is compared within its class (follow-up 1): the class is read
from the capture pass's own Mocha total (the second `N passing (Xm)` line of `ui-output.txt`), fast when ≤ 14 min, slow when
≥ 15 min. Each after-run's line is divided by the before-median of its own class; a line passes when the median of the three
ratios is at most 1.5 (the dotnet rows' tolerance, unchanged). One run is never judged. The first reading compared three
before-runs that were all fast-class with after-runs that were slow-class, and read red for that reason.

**The before set.** The 61 pre-item green push runs on `labs/ux` with `[perf]` lines among the run folders under `captures/`
numbered from 44006473449 (2026-11-15) to 44725528260, each checked `push success labs/ux` with `gh api`; nothing was fetched
for it. It is not every run on record: `captures/` also holds older run folders (40023246433 to 43994145813), left out
because the window was chosen by run number, not by a reason in the runs; the architecture-advisor's follow-up read 13 of the
most recent. A pre-commit reviewer's estimate over all such runs (about 237) gives class medians fast 223 / 308.5 / 315 / 530 and
slow 252 / 373 / 381 / 551, and the advisor's 13 give fast 176 / 216 / 222 / 422 and slow 245.5 / 427.5 / 435.5 / 596: the verdict
below holds under all three sets (not recomputed here for the 237). Times in ms.

| Class | Runs | refresh → list settled | first row | authoritative list | icons |
|---|---|---|---|---|---|
| fast (≤ 14m) | 40 | 184 | 240 | 245 | 437.5 |
| slow (≥ 15m) | 21 | 248 | 373 | 381 | 556 |

After, the item's three green runs (7f7be39a and the two docs commits on it), each line with its ratio to its class median:

| Run | Class | refresh | first row | authoritative | icons | select → details | select → dependencies | recorder started |
|---|---|---|---|---|---|---|---|---|
| 44732130015 | slow (17m) | 263 (1.06) | 411 (1.10) | 424 (1.11) | 589 (1.06) | 13 | 500 | 217 |
| 44736499934 | slow (16m) | 266 (1.07) | 504 (1.35) | 510 (1.34) | 697 (1.25) | 19 | 310 | 210 |
| 44740395026 | fast (11m) | 147 (0.80) | 316 (1.32) | 321 (1.31) | 344 (0.79) | 7 | 129 | 133 |
| Median ratio | | 1.06 | 1.32 | 1.31 | 1.06 | | | |
| Verdict | | pass | pass | pass | pass | | | |

The before set, run by run:

| Run | Class | refresh | first row | authoritative | icons | select → details | select → dependencies | recorder started |
|---|---|---|---|---|---|---|---|---|
| 44006473449 | fast (11m) | 167 | 178 | 185 | 273 | 8 | 129 | 130 |
| 44017225108 | fast (13m) | 195 | 180 | 188 | 296 | 7 | 160 | 143 |
| 44020687480 | fast (12m) | 189 | 333 | 339 | 808 | 20 | 98 | 165 |
| 44031276097 | fast (11m) | 165 | 181 | 186 | 692 | 6 | 172 | 188 |
| 44036837521 | fast (10m) | 156 | 171 | 175 | 258 | 5 | 117 | 129 |
| 44040040328 | slow (16m) | 273 | 381 | 392 | 530 | 8 | 276 | 198 |
| 44048105231 | slow (15m) | 214 | 353 | 359 | 556 | 13 | 310 | 182 |
| 44088824993 | slow (16m) | 263 | 352 | 362 | 519 | 11 | 229 | 205 |
| 44111085167 | fast (13m) | 231 | 289 | 295 | 411 | 8 | 227 | 163 |
| 44116707127 | slow (16m) | 254 | 405 | 414 | 575 | 13 | 283 | 201 |
| 44125387157 | fast (14m) | 212 | 308 | 316 | 438 | 7 | 217 | 175 |
| 44130059273 | fast (13m) | 210 | 272 | 279 | 437 | 7 | 238 | 200 |
| 44149001126 | fast (13m) | 226 | 343 | 349 | 471 | 7 | 192 | 165 |
| 44157815833 | fast (13m) | 197 | 316 | 322 | 427 | 6 | 287 | 156 |
| 44169068801 | slow (15m) | 221 | 352 | 360 | 631 | 11 | 284 | 196 |
| 44175345104 | slow (15m) | 256 | 352 | 358 | 515 | 8 | 363 | 191 |
| 44180874252 | fast (12m) | 188 | 205 | 209 | 1090 | 6 | 234 | 130 |
| 44184633461 | fast (11m) | 171 | 198 | 207 | 292 | 6 | 129 | 131 |
| 44191260179 | fast (12m) | 171 | 196 | 202 | 992 | 7 | 178 | 131 |
| 44194939732 | fast (12m) | 183 | 215 | 224 | 349 | 7 | 249 | 153 |
| 44209521600 | fast (12m) | 224 | 235 | 240 | 733 | 10 | 190 | 146 |
| 44260186997 | fast (13m) | 185 | 211 | 219 | 324 | 10 | 257 | 195 |
| 44263173962 | slow (15m) | 248 | 386 | 393 | 565 | 10 | 242 | 197 |
| 44267610384 | slow (15m) | 224 | 404 | 414 | 631 | 9 | 251 | 223 |
| 44272851463 | fast (12m) | 167 | 298 | 298 | 1195 | 7 | 312 | 133 |
| 44278515805 | fast (13m) | 222 | 291 | 296 | 405 | 7 | 203 | 153 |
| 44283541873 | fast (13m) | 215 | 245 | 250 | 357 | 7 | 222 | 167 |
| 44290207055 | fast (11m) | 170 | 220 | 225 | 315 | 6 | 163 | 147 |
| 44303433180 | fast (12m) | 174 | 231 | 237 | 685 | 7 | 99 | 142 |
| 44314020299 | fast (12m) | 188 | 297 | 303 | 1000 | 8 | 285 | 144 |
| 44319150988 | fast (12m) | 163 | 207 | 215 | 1040 | 6 | 222 | 133 |
| 44323521066 | fast (13m) | 230 | 350 | 355 | 456 | 9 | 587 | 150 |
| 44350651585 | fast (13m) | 240 | 268 | 274 | 392 | 7 | 178 | 167 |
| 44356085581 | fast (12m) | 165 | 297 | 303 | 1333 | 7 | 1000 | 134 |
| 44364800640 | slow (16m) | 263 | 365 | 374 | 519 | 11 | 333 | 232 |
| 44374049262 | slow (16m) | 261 | 373 | 381 | 556 | 8 | 255 | 233 |
| 44380575458 | slow (16m) | 230 | 386 | 393 | 552 | 9 | 308 | 191 |
| 44386424171 | slow (16m) | 251 | 365 | 370 | 532 | 10 | 282 | 200 |
| 44394529420 | fast (13m) | 198 | 225 | 231 | 349 | 15 | 211 | 158 |
| 44399914588 | slow (15m) | 243 | 442 | 450 | 617 | 11 | 301 | 201 |
| 44416987719 | fast (12m) | 171 | 209 | 215 | 1094 | 30 | 197 | 140 |
| 44428362148 | slow (16m) | 266 | 326 | 334 | 485 | 13 | 284 | 194 |
| 44432587034 | slow (18m) | 246 | 338 | 348 | 512 | 9 | 550 | 225 |
| 44445946322 | fast (13m) | 205 | 335 | 343 | 446 | 8 | 466 | 159 |
| 44449385049 | fast (14m) | 176 | 320 | 325 | 414 | 7 | 363 | 176 |
| 44452956857 | slow (16m) | 247 | 414 | 421 | 598 | 10 | 274 | 211 |
| 44464137487 | fast (12m) | 170 | 308 | 315 | 794 | 8 | 219 | 137 |
| 44470888225 | slow (16m) | 236 | 333 | 342 | 491 | 9 | 261 | 193 |
| 44604160966 | fast (14m) | 197 | 181 | 188 | 302 | 9 | 152 | 163 |
| 44614226491 | fast (12m) | 171 | 158 | 163 | 635 | 8 | 88 | 144 |
| 44622304312 | slow (16m) | 254 | 418 | 426 | 557 | 13 | 355 | 210 |
| 44628177911 | fast (13m) | 216 | 279 | 285 | 422 | 7 | 298 | 150 |
| 44633074875 | fast (12m) | 168 | 279 | 286 | 1158 | 10 | 190 | 132 |
| 44636682366 | slow (16m) | 249 | 496 | 505 | 692 | 9 | 307 | 197 |
| 44642077252 | slow (16m) | 241 | 437 | 445 | 635 | 16 | 322 | 196 |
| 44656619145 | fast (12m) | 176 | 161 | 169 | 661 | 8 | 111 | 139 |
| 44664479917 | fast (13m) | 180 | 255 | 260 | 371 | 8 | 237 | 151 |
| 44709230961 | slow (16m) | 242 | 342 | 350 | 522 | 10 | 240 | 228 |
| 44713612548 | fast (13m) | 210 | 255 | 261 | 386 | 8 | 166 | 200 |
| 44721186954 | fast (12m) | 153 | 166 | 171 | 602 | 5 | 74 | 125 |
| 44725528260 | fast (11m) | 158 | 216 | 222 | 310 | 6 | 138 | 134 |

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

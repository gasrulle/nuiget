# STATUS — src/core/versioning   commit 4d66bfb (P6.4c closed; parent of the P6.5 commit)   2026-10-16T03:00:00Z

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`,
`docs/plans/STATUS.md`, `src/core/versioning/{README,STATUS}.md`; new `src/core/versioning/{CONFORMANCE.md,conformance.test.ts}`

Item: **P6.5** — the `NuGetVersion` conformance table and property tests. This note replaces the P1.3 note (in this
file's history); `NuGetVersion.ts`, `VersionRange.ts` and `versioning.test.ts` are unchanged.

## Verified by running

```text
baseline (on 4d66bfb; P6.4c green in CI run 38802111829): npm run check-types → exit 0 · npx eslint src → exit 0 ·
                               npx vitest run → Test Files 165 passed (165) · Tests 3328 passed | 6 skipped (3334)
NuGet docs via Context7 /websites/learn_microsoft_en-us_nuget → "Normalized version numbers", "Pre-release versions"
                               (with the sorting example 1.0.1 … 1.0.1-aaa), "Where NuGetVersion diverges from Semantic
                               Versioning" of https://learn.microsoft.com/en-us/nuget/concepts/package-versioning
npx vitest run --project backend src/core/versioning/conformance.test.ts → Tests 64 passed (64) at the first run
negative control             → `1.0.1-alpha2` `>` changed to `<` in CONFORMANCE.md: "× 1.0.1-alpha2 < 1.0.1-alpha10",
                               1 failed | 63 passed; the file restored (cmp equal)
npx vitest run --project backend src/core/versioning → Tests 126 passed (126)
npx tsc --noEmit             → exit 0 · npm run check-types → exit 0 · npx eslint src/core/versioning → exit 0
npm test                     → Test Files 166 passed (166) · Tests 3392 passed | 6 skipped (3398)
npm run bench                → Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 291154 / 299921, webview 522304 / 600685,
                               sidebar 318305 / 329122 (unchanged: tests and a document only)
npm run test:ui              → SKIPPED: no UI change
CI                           → see the tracker row of P6.5
```

## Done (tested)

- `CONFORMANCE.md`: three tables (normalization, 11 rows; precedence, 18 rows including the page's sorting example
  pair by pair; not a version, 9 rows), the laws, and what is not covered. Next to the module, not under `docs/adr`.
- `conformance.test.ts`: reads the three tables and runs every row (both directions for precedence), and five laws on
  versions from a seeded mulberry32 generator (seeds 1, 7, 42, 2026, 31337; a failure names its seed and inputs):
  `normalize` idempotent and precedence-preserving; reflexive, antisymmetric, transitive `compare`; equal precedence
  ⇔ equal normalized text ignoring case; metadata ignored; `sortDescending` non-increasing.
- `README.md`: one item pointing to the table.

## Done (untested)

- Nothing.

## Not started

- Numeric prerelease identifiers with a leading zero (`1.0.0-01`): `parseVersion` accepts and compares them by value;
  NuGet's parsers were not probed (CONFORMANCE.md, "Not covered").

## Deviations from contract/ADR (file:line each)

- None. No property-testing library was added (`package.json` is not an item file); the generator is in the test.

## Advisor decisions (date, item, question, answer verbatim)

P6.5 is not ⚑ and no stop-and-ask trigger fired; no `architecture-advisor` consultation. The ambient advisor's points
(doc next to the module, a seeded generator instead of a dependency, the documented rules from the NuGet page) are
what the item did.

## Exact next step (one item ID)

The P6 phase gate and the phase review (RUN.md §6), then P7.1.

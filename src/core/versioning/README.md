# Versioning

Three concepts, three types — never mixed:

| Concept | Type | Source | Example |
|---|---|---|---|
| Version | `NuGetVersion` (`parseVersion`) | Feeds, assets/lock files, resolved references | `13.0.3`, `2.0.0-preview.1` |
| Version specification | `ParsedVersionSpec` (`parseVersionSpec`) | `PackageReference`/`PackageVersion` text | `13.0.3` (minimum), `[1.0,2.0)`, `1.*`, `1.0.*-*` |
| Resolved version | `string` validated with `parseVersion` | Assets/lock files for floating/range specs | `1.9.3` for `1.*` |

Rules:

- Parsing never coerces. `parseVersion('unknown')` is `undefined`, not `0.0.0`. Comparators return
  `undefined`/`false` on unparsable input so a missing version can never look like an update.
- Specifications never reach a comparator. Convert with `effectiveInstalledVersion(spec, resolved)`
  first; `isUpdateCandidate` tells whether a reference can be checked at all. An exact pin such as
  `[1.0.0]` is never checked.
- Precedence follows SemVer 2 with NuGet's case-insensitive prerelease identifiers; build metadata is
  ignored; a non-zero fourth component (`1.0.0.1`) sorts above `1.0.0`.
- Normalization (`normalize`) implements the documented NuGet rules (three components minimum, zero
  fourth component dropped, leading zeros removed, metadata dropped).
- `CONFORMANCE.md` lists the cases row by row against NuGet's package-versioning page; `conformance.test.ts`
  runs every row and checks the laws of precedence on generated versions.

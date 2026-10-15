# NuGetVersion conformance

What `NuGetVersion.ts` does with a version string, row by row, against the rules of NuGet's
[Package versioning](https://learn.microsoft.com/en-us/nuget/concepts/package-versioning) page (sections
"Normalized version numbers", "Pre-release versions", "Where NuGetVersion diverges from Semantic Versioning"; read
through Context7 `/websites/learn_microsoft_en-us_nuget` on 2026-10-15) and of [SemVer 2.0.0](https://semver.org/)
where that page defers to it. `conformance.test.ts` reads the three tables of this file and runs every row, so a row
that is here is tested; property tests in the same file check the laws below on generated versions.

## Normalization

`normalize(input)` is the version NuGet 3.4+ writes and compares: leading zeros removed, three parts at least, a zero
fourth part dropped, build metadata dropped. Prerelease labels keep their case (the flat container lowercases them;
`normalize` does not).

| Input | Normalized | Rule |
|---|---|---|
| `1` | `1.0.0` | three parts at least |
| `1.0` | `1.0.0` | three parts at least |
| `1.0.0` | `1.0.0` | unchanged |
| `1.0.0.0` | `1.0.0` | a zero fourth part is omitted |
| `1.0.0.1` | `1.0.0.1` | a non-zero fourth part (Revision) is kept |
| `01.002.0003` | `1.2.3` | leading zeros are removed |
| `1.00.0.00` | `1.0.0` | leading zeros, then the zero fourth part |
| `1.0.0+build.5` | `1.0.0` | build metadata is removed |
| `1.0.0-beta+sha.abc` | `1.0.0-beta` | metadata removed, the label kept |
| `1.0.0-Beta.1` | `1.0.0-Beta.1` | the label keeps its case |
| `2.0.0-rc.10.preview` | `2.0.0-rc.10.preview` | dot-separated labels (SemVer 2.0.0) |

## Precedence

`compareText(left, right)`: a stable version is above its prereleases; prerelease identifiers compare one by one,
numeric ones by value and below alphanumeric ones, alphanumeric ones case-insensitively; a longer label wins when the
shorter one is its prefix; build metadata never counts. The Revision part orders after Patch.

| Left | Relation | Right | Rule |
|---|---|---|---|
| `1.0.1` | `>` | `1.0.1-zzz` | a stable version is above its prereleases |
| `1.0.1-zzz` | `>` | `1.0.1-rc.10` | alphanumeric order (the page's sorting example) |
| `1.0.1-rc.10` | `>` | `1.0.1-rc.2` | numeric identifiers by value (the page's sorting example) |
| `1.0.1-rc.2` | `>` | `1.0.1-open` | alphanumeric order (the page's sorting example) |
| `1.0.1-open` | `>` | `1.0.1-beta` | alphanumeric order (the page's sorting example) |
| `1.0.1-beta` | `>` | `1.0.1-alpha2` | alphanumeric order (the page's sorting example) |
| `1.0.1-alpha2` | `>` | `1.0.1-alpha10` | `alpha2` and `alpha10` are alphanumeric: compared as text (the page's sorting example) |
| `1.0.1-alpha10` | `>` | `1.0.1-aaa` | alphanumeric order (the page's sorting example) |
| `1.0.0-alpha` | `=` | `1.0.0-Alpha` | prerelease labels compare case-insensitively |
| `1.0.0-beta.2` | `<` | `1.0.0-beta.11` | numeric identifiers by value |
| `1.0.0-1` | `<` | `1.0.0-alpha` | a numeric identifier is below an alphanumeric one |
| `1.0.0-alpha` | `<` | `1.0.0-alpha.1` | a longer label wins over its prefix |
| `1.0.0+a` | `=` | `1.0.0+b` | build metadata does not count |
| `1.0.0` | `=` | `1.0.0.0` | a zero fourth part is the same version |
| `1.0.0.1` | `>` | `1.0.0` | the Revision part orders after Patch |
| `1.0.0.1` | `<` | `1.0.1` | Patch decides before Revision |
| `1.2.3` | `=` | `01.02.03` | leading zeros do not count |
| `2.0.0-rc.1` | `>` | `1.9.9` | the core decides before the label |

## Not a version

`parseVersion(input)` is `undefined` and `normalize(input)` too; a comparison with such a string is `undefined`
(never an update: the README's rule "parsing never coerces").

| Input | Why |
|---|---|
| `unknown` | not numeric |
| `1.0.0.0.0` | five parts |
| `1.0.0-` | an empty label |
| `1.0.0-beta..1` | an empty identifier |
| `1.0.0+` | empty metadata |
| `1.0.0-beta_1` | `_` is not an identifier character |
| `[1.0.0,2.0.0)` | a range is a version specification, not a version |
| `1.*` | a floating pattern is a version specification |
| `v1.0.0` | a prefix is not part of a version |

## Laws (property tests)

On generated versions (one to four numeric parts with occasional leading zeros, prerelease identifiers in mixed case,
optional metadata; no numeric prerelease identifier with a leading zero, see below):

- `normalize` is idempotent, and `parseVersion(normalize(v))` compares equal to `v`.
- `compare` is antisymmetric and transitive, and `compare(v, v) = 0`.
- `compare(a, b) = 0` exactly when the normalized forms are equal ignoring case.
- Metadata never changes the result: `compare(v, v + '+meta') = 0`.
- `sortDescending` returns the versions in non-increasing `compare` order.

## Not covered

- Numeric prerelease identifiers with leading zeros (`1.0.0-01`): SemVer 2.0.0 forbids them; `parseVersion` accepts
  them and compares them by value, and NuGet's strict and lenient parsers were not probed here.
- Version specifications (ranges, floating patterns): `VersionRange.ts` and `versioning.test.ts`.

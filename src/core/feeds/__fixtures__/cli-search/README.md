# `dotnet package search` captures

`10.0.401.json` records what `dotnet package search --format json --verbosity normal` writes, as `search.ts` reads it. Each
entry of `commands` holds the argv, the exit code and the full stdout and stderr of one run.

- SDK 10.0.401 on macOS (darwin-arm64), captured 2026-10-15 for plan item P4.6.
- Argv base: `dotnet package search Newtonsoft.Json --format json --verbosity normal`, plus the `--source`, `--exact-match` and
  `--take` arguments each entry lists (the form `packageSearchArgs` in `src/core/cli/commands.ts` builds).
- Redaction: the home directory would be `<home>` and the dotnet root `<dotnet-root>`; no capture contained either. The
  nuget.org data (ids, versions, download counts, owners) is public and kept as captured.
- `prefix-lines-synthetic` is constructed, not captured (`"synthetic": true`): the three `info :`/`warn :` lines are verbatim from
  `src/core/cli/__fixtures__/sdk-probes/10.0.401.json:37`, followed by a captured document.

The quarry's `warn :` on stdout was not reproduced in any of these captures. Source failures are structured `problems[]`
entries (exit code 0 for a per-source problem, exit code 1 with a top-level problem for an http source without
`allowInsecureConnections`). `--take` together with `--exact-match` is ignored: all versions come back.

# ADR-005: Project execution context and outbound request policy

Status: accepted · Date: 2026-10-10

## Context

`getSources()` and `restore` ran from the first workspace folder while install/update ran from the
project directory; metadata cache keys omitted the source; installed-package enrichment queried
nuget.org for every package id regardless of configured feeds (privacy leak for private feeds);
the bespoke HTTP client ignores VS Code proxy settings.

## Decision

- Every CLI call, HTTP query and cache key is scoped by a `ProjectExecutionContext`
  (`projectDir`, workspace folder, SDK, effective `nuget.config` chain, enabled source URLs,
  revision). Sources are resolved **per project directory** (`dotnet nuget list source` with
  `cwd = projectDir`), cached per directory and invalidated by `nuget.config` watchers.
- `OutboundPolicy` decides which feeds may receive which package ids: a package id is only sent
  to the sources enabled for the project that references it. nuget.org is contacted only when it
  is an enabled source. No telemetry.
- Cache keys include source (and prerelease where relevant). `CachePolicy` is the single place
  that defines TTLs and `clear(scope)`.
- `Transport` honours VS Code `http.proxy`, `http.proxyStrictSSL` and `http.systemCertificates`
  (via `https.Agent`/`undici` proxy agent); HTTP/2 is used only for origins known to support it
  and falls back to HTTP/1.1. One redirect/SSRF implementation; redirect targets are re-validated
  by resolved address when the hostname is not an IP literal.

## Consequences

- Private-only configurations never contact nuget.org (tested).
- Multi-root workspaces get the correct SDK and config per project.

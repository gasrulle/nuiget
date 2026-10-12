# ADR-005: Project execution context and outbound request policy

Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: context contract, proxy strategy without `undici`)

## Context

`getSources()` and `restore` ran from the first workspace folder while install/update ran from the
project directory; metadata cache keys omitted the source; installed-package enrichment queried
nuget.org for every package id regardless of configured feeds (privacy leak for private feeds);
the bespoke HTTP client ignores VS Code proxy settings.

The amendment of 2026-10-12 records the contract changes of plan item P1.1b and plan decisions D7 and
D13 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`, §1).

## Decision

- Every CLI call, HTTP query and cache key is scoped by a `ProjectExecutionContext`
  (`projectDir`, workspace folder, SDK, effective `nuget.config` chain, enabled source URLs,
  revision). Sources are resolved **per project directory** (`dotnet nuget list source` with
  `cwd = projectDir`), cached per directory and invalidated by `nuget.config` watchers.
  The context is `ProjectExecutionContext` in `src/core/contracts.ts` (`projectPath`, `projectDir`,
  `workspaceFolder`, `sdk`, `configFiles`, `sourceUrls`, `revision`); `sdk.supported === false`
  marks the project `unsupported: 'sdk-too-old'` and read-only (D13, plan item P2.5); `revision`
  keys the evaluator cache (ADR-004).
- `OutboundPolicy` decides which feeds may receive which package ids: a package id is only sent
  to the sources enabled for the project that references it. nuget.org is contacted only when it
  is an enabled source. No telemetry.
- Cache keys include source (and prerelease where relevant). `CachePolicy` is the single place
  that defines TTLs and `clear(scope)`.
- `Transport` honours VS Code `http.proxy`, `http.proxyStrictSSL`, `http.proxySupport` and
  `http.systemCertificates` by routing HTTP/1.1 through Node's `https` module (which the extension
  host patches for proxies); HTTP/2 is used only when no proxy is configured. One redirect/SSRF
  implementation; same-origin-only auth forwarding; redirect targets are re-validated by resolved
  address when the hostname is not an IP literal. `undici` is not a dependency. Plan item P4.1
  records the supported configuration matrix and decides whether a proxy agent is vendored
  (`docs/adr/005-proxy-matrix.md`).

## Consequences

- Private-only configurations never contact nuget.org (tested).
- Multi-root workspaces get the correct SDK and config per project.

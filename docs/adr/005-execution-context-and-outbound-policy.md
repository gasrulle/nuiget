# ADR-005: Project execution context and outbound request policy

Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: context contract, proxy strategy without `undici`) · Amended: 2026-10-14 (plan item P4.1: proxy and certificate matrix, no vendored agent)

## Context

`getSources()` and `restore` ran from the first workspace folder while install/update ran from the
project directory; metadata cache keys omitted the source; installed-package enrichment queried
nuget.org for every package id regardless of configured feeds (privacy leak for private feeds);
the bespoke HTTP client ignores VS Code proxy settings.

The amendment of 2026-10-12 records the contract changes of plan item P1.1b and plan decisions D7 and
D13 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`, §1).

The amendment of 2026-10-14 records plan item P4.1: how the VS Code extension host treats an extension's `https`
and `http2` requests (read at VS Code 1.85.0 with `@vscode/proxy-agent` 0.18.2, and at the current release), and
the configuration matrix in `005-proxy-matrix.md`.

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
- `Transport` opens HTTP/1.1 connections through Node's `http`/`https` request functions **without an agent of
  its own**, so that the extension host's proxy patch applies: under `http.proxySupport` `override` (the default),
  `on` and `fallback` the host resolves the proxy for every request (`http.proxy`, then the `https_proxy`/`http_proxy`
  environment, then the operating-system or PAC configuration), authenticates to it (credentials in the
  `http.proxy` URL, Kerberos/Negotiate, the host's own prompts) and adds the operating-system certificate store
  when `http.systemCertificates` is on. VS Code does not apply `http.proxyStrictSSL` or `http.proxyAuthorization` to extension requests, and `Transport` does not emulate them; certificate verification is never disabled.
  HTTP/2 (`http2.connect`) is outside the host patch (no proxy, no operating-system certificates): it is used only
  for allow-listed origins (default `https://api.nuget.org`) and only while the injected proxy predicate is false;
  the predicate is true when `http.proxySupport` is not `off` and `http.proxy` or a proxy environment variable is
  set. A proxy the predicate cannot see (operating-system or PAC) and a TLS-intercepting proxy are handled by the
  fallback: a connection-level failure (DNS, connect, TLS handshake) downgrades the origin to HTTP/1.1 for the
  lifetime of the `Transport` instance; the composition root resets the transport when an `http.*` setting
  changes. No proxy agent is vendored; neither `undici` nor the global `fetch` is used. One redirect/SSRF
  implementation; same-origin-only auth forwarding; a redirect target whose hostname is not an IP literal is
  re-validated by resolved address while the predicate is false and refused with `redirect-blocked` when it does
  not resolve; while the predicate is true the proxy resolves names and the string checks alone apply. The
  supported configuration matrix is `005-proxy-matrix.md` (supplement, plan item P4.1).

## Consequences

- Private-only configurations never contact nuget.org (tested).
- Multi-root workspaces get the correct SDK and config per project.
- Corporate proxies work exactly as far as VS Code's own proxy support reaches an extension
  (`005-proxy-matrix.md`); nUIget contributes no proxy or certificate setting of its own.

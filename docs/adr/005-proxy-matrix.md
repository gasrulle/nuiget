# ADR-005 supplement: proxy and certificate matrix for Transport

Status: evidence for [ADR-005](005-execution-context-and-outbound-policy.md) (the Transport bullet) · Read: 2026-10-14

This file is not a separate decision. It records what the VS Code extension host does with an extension's
outbound requests per proxy and certificate setting, so that the `Transport` bullet of ADR-005 and the decision
not to vendor a proxy agent rest on sources read at a pinned version, not on documentation or memory. The baseline
is VS Code 1.85 (plan decision D10); nUIget's `Transport` uses Node's `https` module for HTTP/1.1 and `http2` for
HTTP/2, and never the global `fetch`.

Facts marked **read** were read by the implementing session of plan item P4.1 on 2026-10-14 at the tag, path and
lines given. Facts marked `unverified` come from the research of the same session and were not re-read at a pinned
source; they do not carry a decision.

## What was read

| Source | Tag or commit | Path and lines | What it shows |
|---|---|---|---|
| VS Code | `1.85.0` | `src/vs/platform/request/node/requestService.ts:70-75` | **read**: `configure()` reads `http.proxy`, `http.proxyStrictSSL` (`this.strictSSL`) and `http.proxyAuthorization` for VS Code's own request service |
| VS Code | `1.85.0` | `src/vs/workbench/api/node/proxyResolver.ts:30-39` | **read**: the parameters handed to `@vscode/proxy-agent` for extension requests: `http.proxy`, `http.proxySupport` (`\|\| 'off'` when unset), `http.systemCertificates`, `http.experimental.systemCertificatesV2`; neither `proxyStrictSSL` nor `proxyAuthorization` appears anywhere in the file |
| VS Code | `1.85.0` | `src/vs/workbench/api/node/proxyResolver.ts:79-86` | **read**: `createPatchedModules` patches `http`, `https`, `net` and `tls` with `Object.assign`; no `http2` |
| VS Code | `1.85.0` | `src/vs/workbench/api/node/proxyResolver.ts:88-96` | **read**: certificates V1 when `systemCertificates` is on and V2 is off; V2 when both are on |
| VS Code | `1.85.0` | `src/vs/workbench/api/node/proxyResolver.ts:139-154` | **read**: Kerberos/Negotiate proxy authentication in the host (`kerberos` module, `http.proxyKerberosServicePrincipal`) |
| VS Code | `1.85.0` | `package.json:74`, `yarn.lock:1395-1396` | **read**: `"@vscode/proxy-agent": "^0.18.2"`, resolved to `version "0.18.2"`: the proxy-agent version the 1.85 extension host runs |
| VS Code | `1.85.0` | `src/vs/platform/request/common/request.ts:164-179` | **read**: the configuration registration: `http.proxySupport` with `default: 'override'` (line 173), `http.systemCertificates` with `default: true` (line 179); the code fallback in `proxyResolver.ts:37` (`\|\| 'off'`) applies only when the setting has no value at all |
| `@vscode/proxy-agent` | `v0.18.2` (pinned by VS Code 1.85.0) | `src/index.ts:140-215` | **read**: resolution order localhost → env `no_proxy` → `http.proxy` → env proxy → `params.resolveProxy(url)` (the Electron session: operating-system and PAC configuration) |
| `@vscode/proxy-agent` | `v0.18.2` | `src/index.ts:319-353` | **read**: `useProxySettings = !optionsPatched && (config === 'override' \|\| config === 'fallback' \|\| (config === 'on' && originalAgent === undefined))`; `addCertificatesV1` only for `https` without its own `ca`; the replacement agent keeps the caller's agent only when settings are not used, the host is localhost, or the mode is `fallback` (line 349) |
| `@vscode/proxy-agent` | `v0.18.2` | `src/agent.ts:104-108` | **read**: on a `DIRECT` decision the agent used is the caller's, else `https.globalAgent` / `http.globalAgent` |
| `@vscode/proxy-agent` | `v0.18.2` | `src/index.ts:434` | **read**: the only mention of `http2` is a comment in the `tls` patch; the module has no `http2` code |
| Node.js | `v18.15.0` | `lib/https.js:334`, `lib/_http_agent.js:110` | **read**: `globalAgent = new Agent()` with `keepAlive = options.keepAlive \|\| false` |
| Node.js | `v19.0.0` release notes | <https://nodejs.org/en/blog/release/v19.0.0> | **read**: "HTTP(S)/1.1 KeepAlive by default" |
| VS Code release notes | 1.86, 1.88, 1.90, 1.92 | <https://code.visualstudio.com/updates/v1_90> and the others | **read**: Electron 27 with Node.js 18.17.1 (1.86), Electron 28 with Node.js 18.18.2 (1.88), Electron 29 with Node.js 20.9.0 (1.90), Electron 30 with Node.js 20.14.0 (1.92); 1.85 runs Node 18 (D10) |
| VS Code current | `main` 27d8c30 (release 1.142.0), `@vscode/proxy-agent` `v0.45.0` | `proxyResolver.ts`, `src/index.ts:533-575` | `unverified`: the same agent rule; `http.noProxy` from 1.91; a patched global `fetch` from 1.96 (`http.fetchAdditionalSupport`); an agent's own `ca` kept from proxy-agent 0.25.0 |
| Node.js | `v18.15.0` | `lib/internal/http2/core.js:3286-3294` | `unverified`: `http2.connect` opens its socket with `tls.connect` (the `tls` patch is a pass-through unless certificates V2 is on) |

## How the host treats an extension's request

- **Modules.** The host patches `http.request`/`get`, `https.request`/`get`, `net.connect` and
  `tls.createSecureContext`/`connect`. `http2` is never patched; the global `fetch` is not patched in 1.85
  (`unverified` for the later releases: proxied from 1.96).
- **Proxy resolution** for a patched request: localhost is always direct; then the `no_proxy` environment; then
  `http.proxy`; then `https_proxy`/`http_proxy`; then the operating-system or PAC configuration through the
  Electron session. Kerberos/Negotiate is answered by the host.
- **The caller's agent**, by `http.proxySupport`:
  - `override` (the registered default): proxy settings are used; the caller's agent is dropped for a non-localhost
    host, so a direct connection goes through `https.globalAgent`.
  - `on`: proxy settings are used only when the request has **no** agent; a request with an agent bypasses the
    proxy.
  - `fallback`: proxy settings are used, and a direct decision keeps the caller's agent.
  - `off`: no proxy; the operating-system certificates are still added when `http.systemCertificates` is on and V2
    is off, because certificates V1 is decided apart from the proxy (`index.ts:327`).
- **Certificates.** With `http.systemCertificates` on (the default) and V2 off, the operating-system store is added
  to Node's roots for a patched `https` request that has no `ca` of its own. `http2` gets none of it.

## Matrix

`https.request` means nUIget's HTTP/1.1 request without an agent of its own; `http2.connect` means its HTTP/2
session to an allow-listed origin. The predicate is the injected proxy predicate of ADR-005: true when
`http.proxySupport` is not `off` and `http.proxy` or `HTTPS_PROXY`/`https_proxy`/`HTTP_PROXY`/`http_proxy` is set.

| Setting / value | VS Code range | https.request from nUIget (no agent) | http2.connect from nUIget | nUIget behaviour |
|---|---|---|---|---|
| `http.proxySupport: override` (default) | 1.85+ | proxied as resolved; direct through `https.globalAgent` | not proxied | HTTP/2 only while the predicate is false; a failed connect downgrades the origin for the transport's lifetime |
| `http.proxySupport: on` | 1.85+ | proxied as resolved (no agent, so the settings apply) | not proxied | as `override`; a custom agent would bypass the proxy, so none is passed |
| `http.proxySupport: fallback` | 1.85+ | proxied as resolved; direct keeps the default agent | not proxied | as `override` |
| `http.proxySupport: off` | 1.85+ | no proxy; operating-system certificates still added (V1) | direct | predicate false: HTTP/2 to allow-listed origins; `http.proxy` is not honoured, as the user set |
| `http.proxy` set, no credentials | 1.85+ | proxied through it | not proxied | predicate true: HTTP/1.1 only |
| `http.proxy` with `user:password@` | 1.85+ | proxied; Basic credentials taken from the proxy URL (`unverified`) | not proxied | predicate true: HTTP/1.1 only |
| `HTTPS_PROXY` / `HTTP_PROXY` environment | 1.85+ | proxied (after `http.proxy`) | not proxied | predicate true: HTTP/1.1 only |
| `NO_PROXY` environment | 1.85+ | direct for the hosts it names | direct | the predicate ignores it (conservative: HTTP/1.1 for every origin) |
| `http.noProxy` | 1.91+ (`unverified`) | direct for the hosts it names (`unverified`) | direct | the predicate ignores it |
| Operating-system / PAC / WPAD proxy | 1.85+ | proxied through the Electron session's decision | not proxied | predicate false (cannot be seen): direct blocked → one connection failure, then HTTP/1.1 for the transport's lifetime; direct allowed → HTTP/2 works |
| `http.proxyStrictSSL` | 1.85+ | not applied (VS Code's own request service only) | not applied | not read, not emulated; certificate verification is never disabled |
| `http.proxyAuthorization` | 1.85+ | not applied (VS Code's own request service only) | not applied | not read; credentials in the `http.proxy` URL work, and the host's Basic prompt from 1.92 (`unverified`) is the host's |
| `http.systemCertificates: true` (default) | 1.85+ | operating-system store added (no `ca` of its own) | not added | nUIget passes no `ca`, so the store applies to HTTP/1.1 |
| `http.experimental.systemCertificatesV2` | 1.85+ | store added through the `tls` patch | possibly added through `tls.connect` (`unverified`) | not relied upon |
| TLS-intercepting proxy with a private CA | 1.85+ | succeeds when the CA is in the operating-system store | handshake fails | one failure, then HTTP/1.1 for the transport's lifetime |
| Kerberos / Negotiate proxy | 1.85+ | answered by the host | not proxied | HTTP/1.1 through the host |
| `http.fetchAdditionalSupport` | 1.96+ (`unverified`) | not applicable | not applicable | nUIget never calls the global `fetch` |
| Keep-alive, host on Node 18 | 1.85-1.89 | `https.globalAgent` has `keepAlive: false`: a new connection per request in every `http.proxySupport` mode (no agent is passed) | sessions pooled by nUIget | accepted cost of passing no agent |
| Keep-alive, host on Node 20+ | 1.90+ | `https.globalAgent` keeps connections alive (Node 19+) | sessions pooled by nUIget | none |
| The dotnet CLI | any | not affected (`dotnet` is a child process) | not affected | `dotnet` reads its own proxy configuration (environment, `nuget.config`; `unverified`), not VS Code settings; no parity attempted |

## Decisions recorded

- **A, no agent of our own for HTTP/1.1.** Without an agent the host's patch applies under every `proxySupport`
  value; a custom agent is dropped under `override` and bypasses the proxy under `on`.
- **E, HTTP/2 for allow-listed origins behind the predicate, with a sticky downgrade.** The predicate is
  `http.proxySupport !== 'off' && (http.proxy set || HTTPS_PROXY/https_proxy/HTTP_PROXY/http_proxy set)`; what it
  cannot see (an operating-system or PAC proxy, a TLS-intercepting proxy) costs one connection failure, after which
  the origin stays on HTTP/1.1 for the lifetime of the `Transport` instance.
- **G, no vendored proxy agent.** An agent would only matter under `http.proxySupport: off`, where honouring
  `http.proxy` would contradict the user's setting; under `override` the host replaces it, and the Node 18 lines of
  the candidates lack PAC, operating-system proxy discovery, Kerberos and the operating-system certificate store.
- **J, `http.proxyStrictSSL` and `http.proxyAuthorization` are not applied.** VS Code applies them to its own
  requests only; emulating `proxyStrictSSL` would mean disabling certificate verification from a setting.
- **K, only the ADR text changes.** `src/core/contracts.ts` already says only that HTTP/1.1 goes through `https`,
  which the host patches, and that HTTP/2 is used only when no proxy is configured.

## Known limitations

- An undetectable proxy costs one failed HTTP/2 connection attempt per `Transport` instance and origin.
- Under an undetected proxy, a redirect target whose name does not resolve locally is refused with
  `redirect-blocked`.
- On VS Code 1.85-1.89 (Node 18 hosts) HTTP/1.1 requests do not reuse connections in any `http.proxySupport` mode.

## What P4.2 and P4.9 implement

- P4.2: `NodeTransport` passes no `agent`, keeps HTTP/2 behind the allow-list and the injected `ProxyState`,
  downgrades an origin for the instance's lifetime on a connection-level HTTP/2 failure, and offers
  `NodeTransport.reset()` (not on the `Transport` contract) to close the HTTP/2 sessions and clear the downgrades.
  Tests: `passes no agent to the request functions so the host proxy patch applies`, `uses HTTP/2 for an
  allow-listed origin only while the proxy predicate is false`, `a connection-level HTTP/2 failure downgrades the
  origin for the transport's lifetime`, `reset() restores HTTP/2 for a downgraded origin`, `a redirect target that
  does not resolve is refused with redirect-blocked`.
- P4.9: `proxyConfigured()` in the composition root evaluates the predicate from
  `vscode.workspace.getConfiguration('http')` (`proxySupport`, default `'override'`, and `proxy`) and the four
  environment variables on every call, and calls `transport.reset()` when an `http.*` setting changes.

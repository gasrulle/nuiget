# STATUS — src/core/http   commit 18fe2cd (parent of the P4.1 commit)   2026-10-14T23:59:00Z

P4.1 decision for this directory; code unchanged since P1.9.

git status --porcelain --untracked-files=all: ` M src/core/http/STATUS.md` (this note), with ` M docs/adr/005-execution-context-and-outbound-policy.md`,
`?? docs/adr/005-proxy-matrix.md`, ` M docs/adr/README.md`, ` M docs/plans/STATUS.md`, ` M docs/plans/findings-ledger.md`,
` M .github/copilot-instructions.md` (all belong to the P4.1 commit)

Item: **P4.1 ⚑ proxy and certificate investigation before Transport lands** (contract item under D6, behind the
`.claude/.contract-change` sentinel with content `P4.1`, created after the ruling was recorded and deleted after
the sign-off). Decision: ADR-005 as amended on 2026-10-14 and its supplement `docs/adr/005-proxy-matrix.md`. Nothing
under `src/` but this note changes; `Transport.ts` arrives in P4.2.

## Verified by running

P4.1:

```text
the pinned sources, fetched on 2026-10-14 (raw.githubusercontent.com, nodejs.org, code.visualstudio.com):
  VS Code 1.85.0 requestService.ts:72-74 → reads proxy, proxyStrictSSL, proxyAuthorization (its own requests)
  VS Code 1.85.0 proxyResolver.ts → no proxyStrictSSL, no proxyAuthorization; params at 30-39; patches http,
                               https, net, tls at 79-86; certificates V1/V2 at 88-96; Kerberos at 139-154
  @vscode/proxy-agent v0.18.2 src/index.ts:326,327,349 → the agent rule; agent.ts:104-108 → DIRECT uses the
                               caller's agent or https.globalAgent; index.ts:434 the only `http2` mention (a comment)
  VS Code 1.85.0 package.json:74, yarn.lock:1395-1396 → @vscode/proxy-agent 0.18.2
  VS Code 1.85.0 request.ts:164-179 → http.proxySupport default 'override' (173), http.systemCertificates true (179)
  Node v18.15.0 lib/https.js:334, lib/_http_agent.js:110 → globalAgent keepAlive false; Node 19.0.0 notes →
                               "HTTP(S)/1.1 KeepAlive by default"
  VS Code release notes → 1.86 Node 18.17.1, 1.88 Node 18.18.2, 1.90 Node 20.9.0 (Electron 29), 1.92 Node 20.14.0
npx tsc --noEmit / npx eslint src → exit 0 / exit 0, no output
npx vitest run               → Test Files 121 passed (121) · Tests 2797 passed | 3 skipped (2800)
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 121 passed (121) · Tests 2800 passed (2800)
npm run bench               → Test Files 18 passed (18) · Tests 112 passed | 1 skipped (113)
git diff --quiet HEAD -- src/core/contracts.ts src/protocol src/core/http/ssrf.ts → unchanged
grep -c "proxyStrictSSL" docs/adr/005-execution-context-and-outbound-policy.md → 1 (the "does not apply" line);
                               grep -c "undici" → 2; grep -c "^| " docs/adr/005-proxy-matrix.md → 38
CHANGELOG: SKIPPED: decision record, P4.2 writes the user-visible entry
npm run package:vsix, check:vsix, docs:protocol:check, test:ui → SKIPPED: no code, packaging, protocol or UI file changed
```

P1.9 (unchanged):

```text
The gates ran with DOTNET_ROOT set to the SDK directory and NUIGET_SDK_TESTS=1 (N48).
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0, no output
baseline npx vitest run      → Test Files 61 passed (61) · Tests 2003 passed (2003)
copy from the quarry tree    → cmp: ssrf.ts identical to the quarry working tree
unmodified copy              → npm run check-types exit 0 · npx eslint src/core/http exit 0 (no tests exist)
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output
npm run lint                 → exit 0
npx vitest run --project backend src/core/http → Test Files 1 passed (1) · Tests 70 passed (70)   (item gate)
npm test                     → Test Files 62 passed (62) · Tests 2073 passed (2073)
npx vitest run --coverage    → exit 0 · All files 75.61 % statements, 65.49 % branches, 70.78 % functions,
                               77.17 % lines · ssrf.ts 95.83 % lines, index.ts 100 % ·
                               src/core/** 1385 of 1408 lines, 98.37 % (floor 85 %)
npm run bench                → Test Files 16 passed (16) · Tests 101 passed | 1 skipped (102)
npm run package:vsix         → exit 0 · Tests 2072 passed | 1 skipped (that script ran without
                               NUIGET_SDK_TESTS) · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 528.74 KB)
npm run check:vsix           → check:vsix: OK
cmp src/core/http/ssrf.ts <quarry> → identical after the item: the implementation did not change
grep Thenable, vscode, child_process, dns in src/core/http → no match (the module does no I/O)
probe of the classifier      → 192.0.43.8, 198.51.44.1 and 203.0.178.191 are classified 'reserved' (N49)
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P1.9
```

## Done (tested)

P4.1: the decision is recorded (ADR-005 `Transport` bullet as dictated by the ruling; `docs/adr/005-proxy-matrix.md`
with what was read, how the host treats an extension's request, the matrix, the decisions A/E/G/J/K, the known
limitations and what P4.2 and P4.9 implement; the README's Supplements entry). Tracker notes for P4.2 and P4.9,
ledger M5 (mapped) and C-cache-http-5 (closed), one 2.0 gotcha row.

P1.9 (unchanged):

- `ssrf.ts`, copied from the quarry working tree and unchanged: `classifyAddress`, `isPrivateAddress`,
  `parseIPv6`, `isLocalhostName`, `isSafeRedirectTarget`, `isRedirectStatus`, `resolveRedirect`,
  `redactUrl`.
- `index.ts`, new: exports those eight functions and the three types of `ssrf.ts`, and nothing else.
- `ssrf.test.ts`, new, 70 cases (45 declarations).
  - Ported from `src/services/Http2Client.test.ts:88-312` (`isSafeRedirectTarget`, `isRedirectStatus`,
    `resolveRedirect`): every accept and reject case of 1.x, adapted to the signature
    `resolveRedirect(currentUrl, status, location, authHeader?, options?)` and to `undefined` instead of `null`.
  - The eight additions the item names, each in a test of its own:
    mapped-v6 `blocks an IPv4-mapped IPv6 address by the IPv4 address inside it`;
    NAT64 `blocks a NAT64 address, 64:ff9b::/96, by the IPv4 address inside it`;
    6to4 `blocks a 6to4 address, 2002::/16, by the IPv4 address inside it`;
    CGNAT `blocks carrier-grade NAT, 100.64.0.0/10, and allows its neighbours`;
    zone id `classifies an address with a zone id by the address, and rejects it as a redirect target`;
    303 `accepts 303 (1.x did not follow it)` and `re-issues a 303 as GET and leaves the method alone for the
    other codes`;
    same-host exemption `lets a private or loopback host redirect to itself`,
    `does not extend to another private host or to a downgrade` and
    `compares host names, so another port of the same host is allowed`;
    127.0.0.0/8 `blocks all of 127.0.0.0/8, not only 127.0.0.1`.
    All of them passed against the unchanged quarry implementation.
  - The rest of the module: a table for `classifyAddress` and `isPrivateAddress`, `parseIPv6`,
    `isLocalhostName`, the `allowLoopback` option, `redactUrl`.

## Done (untested)

- Five lines of `ssrf.ts` have no test (`:76`, `:82`, `:94`, `:98`, `:183`): branches of `parseIPv6` behind
  `net.isIPv6`, which already rejects the input that would reach them, and the empty host name in
  `isSafeRedirectTarget`, which a parsed http URL does not have.
- Nothing imports the module yet. `Transport` (P4.2) is its first user.

## Not started

`Transport.ts` and its tests: P4.2, as the P4.1 ruling's note on row P4.2 says (no agent; HTTP/2 behind the
allow-list and the injected predicate; sticky downgrade; `NodeTransport.reset()`; the five named tests).

- The check of the resolved address when the host is a name (ADR-005): it needs a resolver and lives in
  `Transport` (P4.2). This module only judges the text of a URL.
- `Transport.ts` and its tests: P4.2. The quarry's untracked `Transport.ts` stays in the quarry.

## Deviations from contract/ADR (file:line each)

P4.1:

- The ruling's step 3 expected the Node 20 extension host at VS Code 1.92; the release notes read put it at 1.90
  (Electron 29, Node.js 20.9.0). The matrix follows the read; the sign-off confirms it.
- `docs/adr/005-execution-context-and-outbound-policy.md`: the `proxyStrictSSL` sentence of the dictated bullet is
  one unwrapped line, so that the ruling's line-based check (`grep -c "proxyStrictSSL"` → 1 on the "does not apply"
  line) holds.
- Ten matrix cells rest on the research of the session and are marked `unverified` (the current-release column,
  `http.noProxy`, the global `fetch` from 1.96, the Basic prompt from 1.92, credentials in the proxy URL, V2 on
  `http2`, `http2` over `tls.connect`, the dotnet CLI's proxy configuration).

P1.9 (unchanged):

- Two 1.x expectations are inverted, both named by the item: `isRedirectStatus(303)` is `true`
  (`Http2Client.test.ts:230` expected `false`), and a private or loopback host may redirect to itself (1.x had
  no such exemption; its cases with a public original URL are unchanged).
- The same-host exemption compares host names, not origins (`ssrf.ts:185-187`): another port of the same
  private host is an allowed target. `resolveRedirect` still forwards the `Authorization` value to the same
  origin only (`:230`); the test `follows a redirect to another port of the same host without forwarding the
  credential` pins both.
- `classifyAddress` treats all of 192.0.0.0/16, 198.51.0.0/16 and 203.0.0.0/16 as reserved (N49, Medium).
  The tests assert the documentation addresses themselves (`192.0.2.1`, `198.51.100.7`, `203.0.113.9`) and do
  not pin the public neighbours either way. Not named by the item; the file was left identical to the
  quarry, and the finding is scheduled for P4.2, before the resolved-address check uses the function.
- `ssrf.ts:105`: the helper `embeddedV4` has a conditional whose two branches are the same expression. It
  classifies correctly; left as it is (part of N49).
- A URL cannot carry an IPv6 zone id, so `https://[fe80::1%25eth0]/` does not parse and is refused for that
  reason; `classifyAddress('fe80::1%eth0')` is where the zone id is actually stripped.
- No bench: the item names none.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-14, P4.1, ⚑ brief (plan §2.4) with the facts F1-F8, the quarry excerpts and twelve options; answer, verbatim:

`````text
DECISION: HTTP/1.1 = A (no agent of our own; the host patch does the proxying); HTTP/2 = E sharpened (allow-listed origins only, gated by the injected predicate `http.proxySupport !== 'off' && (http.proxy set || HTTPS_PROXY/https_proxy/HTTP_PROXY/http_proxy set)`, with a connection-level failure downgrading the origin to HTTP/1.1 for the lifetime of the `Transport` instance instead of the quarry's 60 s cooldown); vendoring = G (none); settings = J (`http.proxyStrictSSL` and `http.proxyAuthorization` are stated as not applied, never emulated, certificate verification never disabled); contract text = K (amend ADR-005 and write `docs/adr/005-proxy-matrix.md` as a supplement; `src/core/contracts.ts` is not touched). Nothing in this item is OWNER MUST DECIDE: no `contributes` change, no dependency added, no release or scope question; the plan row itself delegates the vendoring decision to P4.1 with advisor sign-off.

WHY: The brief is wrong about the tree in one place, and it matters: `src/core/contracts.ts:254-258` does not mention `http.proxyStrictSSL`. It says "Honours VS Code proxy settings by routing HTTP/1.1 through Node's `https` module (which the extension host patches for proxies); HTTP/2 is used only when no proxy is configured", which stays true under this ruling, so option L dissolves and D6 stays narrow (P4.1 is named for `docs/adr/**` only, plan line 50). The brief is right about `docs/adr/005-execution-context-and-outbound-policy.md:30-36` (names `http.proxyStrictSSL`, and the P1.1b diff review at `docs/plans/STATUS.md:740` already left the dropped "falls back to HTTP/1.1" clause to P4.1), about the three `REMOVAL GATE: P4.9` anchors in `src/extension.next.ts:72,205,274`, about the P4.2/P4.9 tracker notes (`docs/plans/STATUS.md:64,71`) and about `src/core/http` holding only `ssrf.ts`, `index.ts`, tests and the P1.9 note. On the facts F1-F8 I have no outside access and could not verify them; they are consistent with each other and with the GitLab and C# extension behaviour the subagent cites, and the ruling rests on two of them (F2, F4), which DO step 3 makes the session re-read at the pinned tags before writing. Given F4, the choice on the HTTP/1.1 path is decided by `http.proxySupport: on`, not by keep-alive: under `override` (the default) a caller-supplied agent is discarded anyway, and under `on` a defined agent bypasses the proxy entirely, which is a correctness failure for exactly the corporate users the plan's §7 risk row ("Transport/proxy regresses corporate users | P4.1 before P4.2; HTTP/2 only without proxy", plan line 358) protects; passing no agent is correct in all four modes and the only cost is keep-alive on Node 18 hosts (D10 baseline), which Node 19 and later hosts restore through the global agent. Given F3, the HTTP/2 predicate cannot see an operating-system or PAC proxy or a TLS-intercepting CA, so the h2→h1 fallback is the real safety net and must be sticky: a 60 s cooldown against a connect that times out under a dropping firewall is a recurring stall. Dropping HTTP/2 (option D) would reopen the plan's own mitigation and the P4.2 row's test list ("h2→h1 fallback", plan line 258), so it is not taken. Vendoring an agent is reached only when the user has set `http.proxySupport: off`, where honouring `http.proxy` would contradict the user's own setting, is replaced by the host under `override` (F4), loses PAC, OS proxy, Kerberos and OS certificates (F7), and adds a dependency with Node 18 version ceilings; so none. Emulating `http.proxyStrictSSL` would mean `rejectUnauthorized: false` from a setting VS Code itself scopes to its own request service (F2), which `.github/instructions/security-and-owasp.instructions.md` forbids; the dotnet CLI does not read VS Code settings either, so J loses no parity.

DO:
1. Tracker first (N42 order): paste this answer verbatim under `## Advisor decisions` in `docs/plans/STATUS.md` as `### P4.1 — ⚑ proxy and certificate matrix before Transport (2026-10-14)`, set row P4.1 to `in-progress`, and add this row note: "A: no agent; HTTP/2 allow-listed origins behind the predicate `proxySupport !== 'off' && (http.proxy || env proxy)`, sticky h2→h1 downgrade per Transport instance; no vendored agent; `http.proxyStrictSSL`/`http.proxyAuthorization` not applied by the host and not emulated; `contracts.ts` unchanged (its JSDoc never named `proxyStrictSSL`)".
2. Create `.claude/.contract-change` with content exactly `P4.1` (`scripts/hooks/guard.mjs:36` gates `docs/adr/` by prefix, so the new supplement and `docs/adr/README.md` need it too).
3. Re-verify the two load-bearing facts at the pinned sources before writing, and record tag, path, line and the date in the matrix: F2 (`https://github.com/microsoft/vscode/blob/1.85.0/src/vs/platform/request/node/requestService.ts` lines 73-74 read `proxyStrictSSL`/`proxyAuthorization`; `https://github.com/microsoft/vscode/blob/1.85.0/src/vs/workbench/api/node/proxyResolver.ts` lines 36-39 and 88-96 do not) and F4 (`https://github.com/microsoft/vscode-proxy-agent/blob/v0.18.2/src/index.ts` lines 319-353, `originalAgent: undefined` under `override`, caller's agent kept under `fallback`, bypass under `on` with a defined agent; `src/agent.ts` lines 104-108, `https.globalAgent` on DIRECT). Also verify the subagent's open item from the Node 19.0.0 release notes ("HTTP(S)/1.1 KeepAlive by default") and, for the matrix's host-Node column, the VS Code release that moved the extension host to Node 20 (expected 1.92, Electron 30; read `https://code.visualstudio.com/updates/v1_92`). If a re-read contradicts F2 or F4, stop: do not write the ADR, send a new brief with the contradicting text (universal trigger: evidence differs).
4. Amend `docs/adr/005-execution-context-and-outbound-policy.md` in the `dd1ed73` form: header `Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (…) · Amended: 2026-10-14 (plan item P4.1: proxy and certificate matrix, no vendored agent)`; add to Context the paragraph "The amendment of 2026-10-14 records plan item P4.1: how the VS Code extension host treats an extension's `https` and `http2` requests (read at VS Code 1.85.0 with `@vscode/proxy-agent` 0.18.2, and at the current release), and the configuration matrix in `005-proxy-matrix.md`."; replace the `Transport` bullet (lines 30-36) with exactly: "`Transport` opens HTTP/1.1 connections through Node's `http`/`https` request functions **without an agent of its own**, so that the extension host's proxy patch applies: under `http.proxySupport` `override` (the default), `on` and `fallback` the host resolves the proxy for every request (`http.proxy`, then the `https_proxy`/`http_proxy` environment, then the operating-system or PAC configuration), authenticates to it (credentials in the `http.proxy` URL, Kerberos/Negotiate, the host's own prompts) and adds the operating-system certificate store when `http.systemCertificates` is on. VS Code does not apply `http.proxyStrictSSL` or `http.proxyAuthorization` to extension requests, and `Transport` does not emulate them; certificate verification is never disabled. HTTP/2 (`http2.connect`) is outside the host patch (no proxy, no operating-system certificates): it is used only for allow-listed origins (default `https://api.nuget.org`) and only while the injected proxy predicate is false; the predicate is true when `http.proxySupport` is not `off` and `http.proxy` or a proxy environment variable is set. A proxy the predicate cannot see (operating-system or PAC) and a TLS-intercepting proxy are handled by the fallback: a connection-level failure (DNS, connect, TLS handshake) downgrades the origin to HTTP/1.1 for the lifetime of the `Transport` instance; the composition root resets the transport when an `http.*` setting changes. No proxy agent is vendored; neither `undici` nor the global `fetch` is used. One redirect/SSRF implementation; same-origin-only auth forwarding; a redirect target whose hostname is not an IP literal is re-validated by resolved address while the predicate is false and refused with `redirect-blocked` when it does not resolve; while the predicate is true the proxy resolves names and the string checks alone apply. The supported configuration matrix is `005-proxy-matrix.md` (supplement, plan item P4.1)."; add to Consequences: "Corporate proxies work exactly as far as VS Code's own proxy support reaches an extension (`005-proxy-matrix.md`); nUIget contributes no proxy or certificate setting of its own."
5. Create `docs/adr/005-proxy-matrix.md` in the `004-sdk-probes.md` form: title `# ADR-005 supplement: proxy and certificate matrix for Transport`; line `Status: evidence for [ADR-005](005-execution-context-and-outbound-policy.md) (the Transport bullet) · Read: 2026-10-14`; a sentence that it is not a separate decision; section "What was read" listing each source with tag or commit, path and lines (VS Code 1.85.0 `proxyResolver.ts`, `request.ts`, `requestService.ts`, `yarn.lock` pin; `@vscode/proxy-agent` v0.18.2 `src/index.ts`, `src/agent.ts`; VS Code main 27d8c30 = release 1.142.0 and `@vscode/proxy-agent` v0.45.0 for the "current" column; Node v18.15.0 `lib/https.js`, `lib/_http_agent.js`, `lib/internal/http2/core.js`; Node 19.0.0 release notes); section "How the host treats an extension's request" (resolution order localhost → `no_proxy` → `http.proxy` → env → Electron `resolveProxy`; agent handling per `proxySupport` value; what is never patched: `http2`, and global `fetch` before 1.96); section "Matrix" as one table with columns `Setting / value | VS Code range | https.request from nUIget (no agent) | http2.connect from nUIget | nUIget behaviour`, with at least these rows: `http.proxySupport: override` (default), `on`, `fallback`, `off`; `http.proxy` set (with and without credentials in the URL); `HTTPS_PROXY`/`HTTP_PROXY` env; `NO_PROXY` env and `http.noProxy` (1.91+; the predicate ignores both, conservative); operating-system / PAC / WPAD proxy (undetectable; direct blocked → one connect failure then sticky HTTP/1.1; direct allowed → HTTP/2 works); `http.proxyStrictSSL` (read by VS Code's own request service only; not emulated); `http.proxyAuthorization` (same; credentials in the `http.proxy` URL work; Basic prompt from 1.92 is host-side); `http.systemCertificates` (default true; applied to patched `https` requests without their own `ca`; not to `http2`); `http.experimental.systemCertificatesV2` (patches `tls.connect`, incidental benefit to `http2`, not relied upon); TLS-intercepting proxy with a private CA (HTTP/1.1 succeeds through the OS store, HTTP/2 fails the handshake → sticky downgrade); Kerberos/Negotiate (host-side, HTTP/1.1 only); `http.fetchAdditionalSupport` (1.96+; irrelevant, nUIget never calls `fetch`); keep-alive by host Node version (18.x: `https.globalAgent` keepAlive false; ≥ 19: true; name the VS Code release of the Node 20 host from step 3); the dotnet CLI (reads `HTTP(S)_PROXY` and `nuget.config` `config/http_proxy`, not VS Code settings; no parity attempted). Then sections "Decisions recorded" (A, E-sharpened with the predicate text, G, J, K, each with one sentence of reason), "Known limitations" (undetectable proxy costs one failed connect per `Transport` instance; redirect targets that do not resolve locally under an undetected proxy are refused; no keep-alive on Node 18 hosts under `override`), and "What P4.2 and P4.9 implement" (the predicate, `NodeTransport.reset()`, the test titles of step 8). Mark any cell you could not verify with the literal word `unverified`.
6. Add the supplement to the Supplements list of `docs/adr/README.md`: "- [005-proxy-matrix.md](005-proxy-matrix.md): how the VS Code extension host treats an extension's `https` and `http2` requests per proxy and certificate setting, backing the `Transport` bullet of ADR-005 and the decision not to vendor a proxy agent."
7. Second brief (the Gate column says "advisor sign-off", the P1.1b precedent at `docs/plans/STATUS.md:680`): send `git diff -- docs/adr` to the `architecture-advisor`, paste the answer under "Advisor decisions" in both STATUS files, act on it. Only then delete `.claude/.contract-change` (`guard.mjs:159-165` denies `git commit` while it exists).
8. Tracker notes, verbatim. P4.2: "From the P4.1 ruling: `NodeTransport` passes no `agent` to `http(s).request` (under `http.proxySupport: on` a defined agent bypasses the VS Code proxy, under `override` it is discarded); drop the quarry's `httpsAgent`/`httpAgent` (Node 18 already defaults to TLS 1.2; concurrency is bounded by the feeds' batching, not by `maxSockets`) and rewrite the header comment at quarry `Transport.ts:10-18` (keep-alive does not survive a DIRECT decision under `override`); `shouldUseHttp2` keeps the allow-list and the injected `ProxyState`; a connection-level HTTP/2 failure (DNS, connect, TLS handshake) downgrades the origin for the instance's lifetime, replacing `H2_FAILURE_COOLDOWN_MS`; `NodeTransport.reset()` (class method, not on the `Transport` contract) closes HTTP/2 sessions and clears the downgrade set; redirect re-validation runs while `proxy.isConfigured()` is false and a target that does not resolve is refused with `redirect-blocked` and a message naming the unresolved host; never `rejectUnauthorized: false`, never `undici` or `fetch`. Tests by title: `passes no agent to the request functions so the host proxy patch applies`, `uses HTTP/2 for an allow-listed origin only while the proxy predicate is false`, `a connection-level HTTP/2 failure downgrades the origin for the transport's lifetime`, `reset() restores HTTP/2 for a downgraded origin`, `a redirect target that does not resolve is refused with redirect-blocked`. CHANGELOG `### Added` entry for the proxy behaviour lands here." P4.9: "From the P4.1 ruling: `proxyConfigured()` in the root reads `vscode.workspace.getConfiguration('http')`: `proxySupport` (default `'override'`) and `proxy`, plus the four env vars; true when `proxySupport !== 'off' && (proxy.trim() !== '' || any env var set)`; evaluated on every call. Gate (iii) at `src/extension.next.ts:274`: on `e.affectsConfiguration('http')` call `transport.reset()` (the root holds the `NodeTransport` instance; `Catalog` keeps the `Transport` interface), no re-wiring."
9. Ledger (`docs/plans/findings-ledger.md`): C-cache-http-5 (line 427) → `closed (P4.1: ADR-005 claims only what the extension host does for an extension's requests; docs/adr/005-proxy-matrix.md)`; M5 (line 68) → mapped `P4.1 (decision and matrix), P4.2 (Transport)`, status `open; decision recorded in P4.1, closes at P4.2 with the named tests`. Add a finding row `N<next>` only if step 3 found a contradiction (then you stopped anyway).
10. Docs duties: `.github/copilot-instructions.md` 2.0 gotchas, one new row: "| Agent, `fetch` or `rejectUnauthorized` in `Transport` | `Transport` passes no `agent` to `http(s).request`: under `http.proxySupport: on` a defined agent bypasses the VS Code proxy and under `override` it is discarded (ADR-005, `docs/adr/005-proxy-matrix.md`). Never add an `https.Agent`, `rejectUnauthorized: false`, `undici` or the global `fetch`; HTTP/2 only through the allow-list and the injected proxy predicate, with the sticky h2→h1 downgrade. |" (mirror unchanged: `.claude/rules` point at `.github/instructions`, not at this file). No CHANGELOG entry (decision record only; the STATUS note says literally `CHANGELOG: SKIPPED: decision record, P4.2 writes the user-visible entry`); no ARCHITECTURE.md change (P4.10 documents the transport).
11. Handoff note: rewrite `src/core/http/STATUS.md` from the §2.5 template with the first line stating the scope "P4.1 decision for this directory; code unchanged since P1.9", the P1.9 facts kept under "Done (tested)", this ruling and the sign-off under "Advisor decisions", "Exact next step: P4.2".
12. Gates in §2.2 order even though no code changes: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`, `npm test`, `npm run bench`; then commit with the `git-commit` skill: `docs(adr): proxy and certificate matrix for Transport, no vendored agent (P4.1, ADR-005, D10, M5, C-cache-http-5)`; push to `labs/2.0`; wait for green CI; next item P4.2.

DO NOT:
- Do not edit `src/core/contracts.ts` or anything under `src/protocol/**`; the `Transport` JSDoc at `contracts.ts:254-258` is already consistent with this ruling.
- Do not keep the quarry's `https.Agent({ keepAlive: true, … })` or any agent in P4.2, and do not carve out a "custom agent when `proxySupport` is `fallback` or `off`" special case.
- Do not add `https-proxy-agent`, `proxy-agent`, `hpagent`, `global-agent` or `undici` to `package.json`, and do not call the global `fetch` in 2.0 code.
- Do not set `rejectUnauthorized: false` or pass a `ca` from a setting; do not read `http.proxyStrictSSL` or `http.proxyAuthorization` anywhere in 2.0 code.
- Do not drop HTTP/2 or the P4.2 row's `h2→h1 fallback` test; do not keep the 60 s cooldown.
- Do not make the predicate read `NO_PROXY`/`http.noProxy` or try to reproduce the host's PAC/OS resolution; the sticky fallback covers what the predicate cannot see.
- Do not present F1-F8 in the matrix as verified by this ruling; cite tag, path, line and the date of the session's own re-read, and write `unverified` where it did not.
- Do not create the sentinel before the tracker row is updated, do not commit while it exists, and do not delete it before the second brief's sign-off is recorded.
- Do not add a `contributes` setting (⚑), a CHANGELOG entry, or an ARCHITECTURE.md row in this item.
- Do not write `proxyConfigured()` or any code in P4.1.

CONTRACT CHANGE: `docs/adr/005-execution-context-and-outbound-policy.md` (header, Context paragraph, the `Transport` bullet, one Consequences line), new `docs/adr/005-proxy-matrix.md`, `docs/adr/README.md` (Supplements list), all in P4.1 behind `.claude/.contract-change` with content `P4.1`, after this approval is recorded in the tracker and before the second brief's sign-off is recorded. `src/core/contracts.ts` and `src/protocol/**`: none. Non-frozen files of the item: `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`, `src/core/http/STATUS.md`, `.github/copilot-instructions.md`.

VERIFY:
- `grep -c "proxyStrictSSL" docs/adr/005-execution-context-and-outbound-policy.md` → 1, and that line contains "does not apply"; `grep -c "undici" docs/adr/005-execution-context-and-outbound-policy.md` → 2 (the P1.1b header mention and the new negation); `grep -n "redirect-blocked\|lifetime of the" docs/adr/005-execution-context-and-outbound-policy.md` → both present.
- `ls docs/adr/005-proxy-matrix.md` → exists; `grep -c "^| " docs/adr/005-proxy-matrix.md` → ≥ 18 (header, separator, at least 16 rows); `grep -n "proxySupport\|systemCertificates\|proxyStrictSSL\|PAC\|unverified" docs/adr/005-proxy-matrix.md` → the first four present, `unverified` only on cells the session could not re-read; `grep -n "005-proxy-matrix" docs/adr/README.md` → one line under Supplements.
- `git diff --quiet HEAD -- src/core/contracts.ts src/protocol src/core/http/ssrf.ts && echo unchanged` → `unchanged`; `git status --porcelain --untracked-files=all` before the commit lists only the files named under CONTRACT CHANGE and the non-frozen files; `ls .claude/.contract-change` → `No such file or directory` at commit time.
- `grep -n "C-cache-http-5" docs/plans/findings-ledger.md` → `closed (P4.1 …)`; `grep -n "^| M5 " docs/plans/findings-ledger.md` → mapped `P4.1 … P4.2`; `grep -n "^| P4.1 \|^| P4.2 \|^| P4.9 " docs/plans/STATUS.md` → P4.1 `done` with SHA, P4.2 and P4.9 notes contain "From the P4.1 ruling".
- `grep -c "Agent, \`fetch\` or \`rejectUnauthorized\` in \`Transport\`" .github/copilot-instructions.md` → 1.
- `npx tsc --noEmit` → exit 0; `npx eslint src` → exit 0, no output; `npm test` and `npm run bench` → green (nothing under `src/` changed except `STATUS.md`); CI green on `labs/2.0` before P4.2 starts.
- Second brief's answer recorded under "Advisor decisions" in `docs/plans/STATUS.md` and `src/core/http/STATUS.md` before the commit.

FILES CHECKED: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; `/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` lines 41-175 (D1-D13, §2, §3, §4), 253-268 (P4 rows and gate), 329-363 (§7 incl. the proxy risk row); `/Users/mattias/github/nuiget/docs/plans/RUN.md` §4 (64-84) and §7 (113-127); `/Users/mattias/github/nuiget/docs/adr/005-execution-context-and-outbound-policy.md` (whole) and its amendment diff in `git show dd1ed73`; `/Users/mattias/github/nuiget/docs/adr/README.md`; `/Users/mattias/github/nuiget/docs/adr/004-sdk-probes.md` lines 1-30 (supplement form); `/Users/mattias/github/nuiget/src/core/contracts.ts` lines 205-280 (`TransportRequest`, `TransportErrorCode`, `TransportFailure`, the `Transport` JSDoc at 254-258); `/Users/mattias/github/nuiget/src/extension.next.ts` lines 60-90 and 255-295 (the three `REMOVAL GATE: P4.9` anchors at 72, 205, 274); `/Users/mattias/github/nuiget/src/core/http/` (`ssrf.ts` exports, `index.ts`, `STATUS.md` lines 1-40); `/Users/mattias/github/nuiget/docs/plans/STATUS.md` rows P1.1b, P2.10, P4.1, P4.2, P4.9 (lines 29, 49, 63-64, 71), the P1.1b diff review (736-746, item 4 at 740) and the P2.10 ruling (1288-1362); `/Users/mattias/github/nuiget/docs/plans/findings-ledger.md` rows M5 (68, 233), P4 (71), N49 (151), C-cache-http-1 and C-cache-http-5 (423, 427); `/Users/mattias/github/nuiget/scripts/hooks/guard.mjs` lines 9, 36, 159-162 (sentinel, gated prefixes incl. `docs/adr/`, commit denial); `/Users/mattias/github/nuiget/package.json` (`engines.vscode ^1.85.0`, `engines.node >=22`, no `http.*` contribution, `@types/node ^24`); `/Users/mattias/github/nuiget/ARCHITECTURE.md` 2.0 section lines 60-68 and rows 89, 96, 101; `/Users/mattias/github/nuiget/CHANGELOG.md` and `README.md` (no proxy claim besides the redaction entry); `git log -- src/core/contracts.ts docs/adr` (frozen-file history). Not checkable from this repository: the quarry worktree and the external VS Code, `@vscode/proxy-agent` and Node sources behind F1-F8; DO step 3 assigns their re-read to the session.
`````

2026-10-14, P4.1, second brief: sign-off of the `docs/adr` diff; answer, verbatim:

`````text
DECISION: The amendment, the supplement and the README entry implement the P4.1 ruling of 2026-10-14; three cells of `docs/adr/005-proxy-matrix.md` state facts without a cited read and must be corrected before the sentinel is deleted. SIGN-OFF is conditional: no now, yes once the three edits below are in and the VERIFY greps hold; no third brief is needed.

WHY: The brief is wrong about the tree in one harmless place: it names four changed files, but `git status --porcelain --untracked-files=all` on `labs/2.0` @ `18fe2cd` lists six (also ` M .github/copilot-instructions.md` and ` M docs/plans/findings-ledger.md`); both are in the ruling's non-frozen file list and both diffs are the step 9 and step 10 texts verbatim, so nothing is out of scope. I compared the dictated texts mechanically (whitespace-collapsed `diff`) against the files: the `Transport` bullet (`docs/adr/005-execution-context-and-outbound-policy.md:34-50`), the header (line 3), the Context paragraph (lines 15-17), the Consequences line (lines 56-57), the README Supplements entry (`docs/adr/README.md:24-26`), the gotcha row (`.github/copilot-instructions.md:203`), the P4.2 and P4.9 tracker notes (`docs/plans/STATUS.md:64,71`, "From the P4.1 ruling" present in both) and the ledger rows M5 and C-cache-http-5 are all identical to the ruling's step 4, 6, 8, 9 and 10 text. The ruling's VERIFY greps hold: `proxyStrictSSL` 1 (on the "does not apply" line), `undici` 2, `redirect-blocked`/`lifetime of the` present, `^| ` rows in the matrix 36, one Supplements line, `src/core/contracts.ts`, `src/protocol/**` and `src/core/http/ssrf.ts` unchanged, sentinel content `P4.1`; `src/core/contracts.ts:255-257` still says only what decision K relies on. The matrix has the sections and all the rows step 5 asked for, the columns as dictated, and `unverified` on the "current" column, `http.noProxy`, the 1.96 `fetch` patch, the 1.92 Basic prompt, the proxy-URL credentials, V2 on `http2`, `http2` over `tls.connect` and the dotnet CLI, which is honest. The session's correction of my step 3 expectation is right: the release notes it read put the Node 20 extension host at 1.90 (Electron 29, Node 20.9.0), not 1.92; the matrix follows the read, and that is what the ruling asked for. Three assertions are still presented as read without a source: (1) `005-proxy-matrix.md:24` says `v0.18.2` is "pinned by VS Code 1.85.0" but no row of "What was read" cites the pin, and F4 at 0.18.2 bears on 1.85 only through that pin (step 5 named the 1.85.0 `yarn.lock` for this reason); (2) lines 43, 61, 73 and 115 call `override` and `systemCertificates: true` the registered defaults, which is true of the configuration registration, not of `proxyResolver.ts` (whose code fallback is `'off'`, as the brief itself says), and no row cites the registration; (3) the keep-alive row (line 78) and the limitation (line 103) say "under `override`", but with no agent passed every `http.proxySupport` value lands on `https.globalAgent` (`override`/`on`/`fallback`: DIRECT → `originalAgent || defaultAgent` with `originalAgent` undefined, `agent.ts:104-108`; `off`: the unpatched request has no agent either), so the qualifier, inherited from the quarry's custom-agent case, understates the limitation. The DO NOT line "cite tag, path, line and the date of the session's own re-read, and write `unverified` where it did not" is the criterion the brief asks me to apply, and these three cells fail it; everything else passes.

DO:
1. In `docs/adr/005-proxy-matrix.md` "What was read", add one `**read**` row for the pin: VS Code tag `1.85.0`, `package.json` (the `"@vscode/proxy-agent"` dependency line) or `yarn.lock` (the `@vscode/proxy-agent@^0.18.2` entry and its `version "0.18.2"` line), with the line numbers read today. If it cannot be read, change line 24's parenthetical to `(pinned by VS Code 1.85.0, unverified)`.
2. Add one `**read**` row for the defaults: VS Code tag `1.85.0`, `src/vs/platform/request/common/request.ts`, the lines of the configuration registration where `http.proxySupport` has `default: 'override'` and `http.systemCertificates` has `default: true`. If it cannot be read, append `(unverified)` to "the registered default" at line 43, "(default)" at lines 61 and 73, and "default `'override'`" at line 115.
3. Line 78: replace "a new connection per request under `override`" with "a new connection per request in every `http.proxySupport` mode (no agent is passed)". Line 103: replace "On VS Code 1.85-1.89 (Node 18 hosts) under `override`, HTTP/1.1 requests do not reuse connections." with "On VS Code 1.85-1.89 (Node 18 hosts) HTTP/1.1 requests do not reuse connections in any `http.proxySupport` mode." Leave lines 85 and 91 as they are: they describe a caller-supplied agent, where `override` is the right qualifier.
4. Paste this answer verbatim under "Advisor decisions" in `docs/plans/STATUS.md` (below the first ruling, as the second brief of P4.1) and in `src/core/http/STATUS.md`; rewrite `src/core/http/STATUS.md` per the ruling's step 11 (§2.5 template, first line "P4.1 decision for this directory; code unchanged since P1.9", P1.9 facts under "Done (tested)", both rulings under "Advisor decisions", "Exact next step: P4.2"), and set row P4.1 to `done` with the commit SHA when the SHA exists.
5. Run the VERIFY greps below; then delete `.claude/.contract-change`; then the ruling's step 12 gates and the commit `docs(adr): proxy and certificate matrix for Transport, no vendored agent (P4.1, ADR-005, D10, M5, C-cache-http-5)`; push to `labs/2.0`; wait for green CI; next item P4.2.

DO NOT:
- Do not change the `Transport` bullet, header, Context paragraph or Consequences line of ADR-005: they are verbatim as dictated, and a re-wrap of the `proxyStrictSSL` sentence is allowed only if the word still appears once and the sentence still says it is not applied.
- Do not mark the Node 20 host row `unverified` or change it back to 1.92: the release notes were read, 1.90 is right, my expectation was wrong.
- Do not touch lines 85 and 91 of the matrix, `src/core/contracts.ts`, `src/protocol/**` or `src/core/http/ssrf.ts`.
- Do not add a CHANGELOG or ARCHITECTURE entry, a `contributes` setting, or any code in this item.
- Do not delete the sentinel before this answer is pasted into both STATUS files and the three edits are made; do not commit while it exists; do not send a third brief for these three edits.

CONTRACT CHANGE: `docs/adr/005-proxy-matrix.md` only (three cells and up to two source rows, DO steps 1-3), in P4.1 behind the existing `.claude/.contract-change` with content `P4.1`. `docs/adr/005-execution-context-and-outbound-policy.md` and `docs/adr/README.md`: no further change. `src/core/contracts.ts`, `src/protocol/**`: none.

VERIFY:
- `grep -n "0.18.2" docs/adr/005-proxy-matrix.md` → a `**read**` row with tag `1.85.0`, path and lines for the pin, or `unverified` next to "pinned" on line 24.
- `grep -n "request/common/request.ts" docs/adr/005-proxy-matrix.md` → one `**read**` row with lines, or `grep -c "default.*unverified\|unverified.*default" docs/adr/005-proxy-matrix.md` → 4.
- `grep -n 'under `override`' docs/adr/005-proxy-matrix.md` → exactly two lines, both in "Decisions recorded" (the custom-agent sentences of A and G); `grep -n "Keep-alive, host on Node 18\|do not reuse connections" docs/adr/005-proxy-matrix.md` → two lines, neither containing "override".
- The ruling's VERIFY greps still hold: `grep -c "proxyStrictSSL" docs/adr/005-execution-context-and-outbound-policy.md` → 1; `grep -c "undici" …` → 2; `grep -c "^| " docs/adr/005-proxy-matrix.md` → ≥ 37; `git diff --quiet HEAD -- src/core/contracts.ts src/protocol src/core/http/ssrf.ts && echo unchanged` → `unchanged`.
- `grep -c "second brief\|SIGN-OFF" docs/plans/STATUS.md src/core/http/STATUS.md` → ≥ 1 in each file before the commit.
- At commit time `git status --porcelain --untracked-files=all` lists exactly: ` M .github/copilot-instructions.md`, ` M docs/adr/005-execution-context-and-outbound-policy.md`, ` M docs/adr/README.md`, `?? docs/adr/005-proxy-matrix.md`, ` M docs/plans/STATUS.md`, ` M docs/plans/findings-ledger.md`, ` M src/core/http/STATUS.md`; `ls .claude/.contract-change` → `No such file or directory`.
- `npx tsc --noEmit` → exit 0; `npx eslint src` → exit 0, no output; `npm test` and `npm run bench` green; CI green on `labs/2.0` before P4.2 starts.

SIGN-OFF: no, as the files stand; yes once DO steps 1-3 are made and the first three VERIFY lines hold, without a further brief. Exact changes required: (1) a cited `**read**` source row for the `@vscode/proxy-agent` 0.18.2 pin at VS Code 1.85.0, or `unverified` on line 24; (2) a cited `**read**` source row for the `http.proxySupport` default `override` and `http.systemCertificates` default `true` in `src/vs/platform/request/common/request.ts` at 1.85.0, or `unverified` at lines 43, 61, 73 and 115; (3) remove the "under `override`" qualifier from the keep-alive row (line 78) and the limitation (line 103), stating that the limitation applies in every `http.proxySupport` mode because no agent is passed.

FILES CHECKED: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; `/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` lines 50 (D6), 61-136 (§2.1-§2.6), 250-268 (P4 rows and gate); `/Users/mattias/github/nuiget/docs/adr/005-execution-context-and-outbound-policy.md` (working tree, whole) and `git show HEAD:` of the same file; `/Users/mattias/github/nuiget/docs/adr/005-proxy-matrix.md` (whole, 118 lines); `/Users/mattias/github/nuiget/docs/adr/README.md`; `/Users/mattias/github/nuiget/docs/adr/004-sdk-probes.md` lines 1-12 (supplement form); `/Users/mattias/github/nuiget/docs/plans/STATUS.md` via `git diff` (rows P5.4, P4.1, P4.2, P4.9 and the full "### P4.1 — ⚑ proxy and certificate matrix before Transport (2026-10-14)" ruling); `/Users/mattias/github/nuiget/docs/plans/findings-ledger.md` via `git diff` (rows M5, C-cache-http-5); `/Users/mattias/github/nuiget/.github/copilot-instructions.md` via `git diff` (line 203); `/Users/mattias/github/nuiget/src/core/contracts.ts` lines 255-257; `/Users/mattias/github/nuiget/src/core/http/STATUS.md` lines 1-5 (unchanged, step 11 pending); `/Users/mattias/github/nuiget/scripts/hooks/guard.mjs` lines 33-36 and 157-166; `/Users/mattias/github/nuiget/.claude/.contract-change` (content `P4.1`); `git status --porcelain --untracked-files=all`, `git log --oneline -1` (`18fe2cd`). Not checkable from this repository: the external VS Code, `@vscode/proxy-agent` and Node sources; the session's step 3 re-read is taken as reported, and the three uncited cells above are the places where the matrix does not yet say what was read.
`````

Acted on: DO steps 1-3 of the sign-off made; its first three VERIFY lines hold.

P1.9 (unchanged):

The item is not ⚑ and no stop-and-ask trigger fired: no frozen file, no test that this item did not write,
no change of the salvaged implementation. No consultation of the `architecture-advisor` took place for it.

## Exact next step (one item ID)

P4.2 (`src/core/http/Transport.ts` and `Transport.test.ts`), with the P4.1 ruling's note on its tracker row.

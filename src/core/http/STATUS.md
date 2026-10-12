# STATUS — src/core/http   commit 91d1144 (parent of the P1.9 commit)   2026-10-12T14:31:31Z

git status --short src/core/http: `?? src/core/http/` (belongs to the P1.9 commit, together with
` M CHANGELOG.md`, ` M ARCHITECTURE.md`, ` M docs/plans/STATUS.md` and ` M docs/plans/findings-ledger.md`)

Item: **P1.9 `src/core/http/ssrf.ts` with `ssrf.test.ts`; `http/index.ts` exports ssrf only**.

The quarry's `src/core/http/STATUS.md` covers http, credentials, sources and cache together. Checked against
its tree: `ssrf.ts` is as described (committed in `f837f34`, unchanged since, imports only Node's `net`). The
note lists `Transport.ts`, `http/index.ts` and the http tests as not started; `Transport.ts` exists in the
working tree, untracked, from the second session. It belongs to P4.2 and was not copied. There was no
`index.ts` and no test file to copy; both are new.

## Verified by running

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

- The check of the resolved address when the host is a name (ADR-005): it needs a resolver and lives in
  `Transport` (P4.2). This module only judges the text of a URL.
- `Transport.ts` and its tests: P4.2. The quarry's untracked `Transport.ts` stays in the quarry.

## Deviations from contract/ADR (file:line each)

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

The item is not ⚑ and no stop-and-ask trigger fired: no frozen file, no test that this item did not write,
no change of the salvaged implementation. No consultation of the `architecture-advisor` took place for it.

## Exact next step (one item ID)

P1.10 (`src/core/ops/PackageWorkflows.ts` and its test; ⚑ on CPM semantics). It is the last item of phase P1;
the phase gate and the phase review of `RUN.md` §6 follow it.

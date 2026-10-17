# STATUS — src/protocol   commit 2975739 (P9.9 commit (a); parent of commit (b))   2026-10-17T08:30:00Z

git status --porcelain --untracked-files=all (before commit (b)): see `src/host/STATUS.md`.

Item: **P9.9, commit (b)** — the advisor-approved contract change (D6, sentinel `P9.9`): the 45th request
`ui/reportError` (`messages.ts`, `guards.ts`), `docs/adr/007-protocol.md` amended, `docs/protocol.md` regenerated. Ruling
and follow-up verbatim in `src/host/STATUS.md`. This note replaces the P7.5b note (history at `a2fd5d2`).

## Verified by running

```text
npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npm run lint 0 · npm run docs:check 0
npm run docs:protocol → wrote docs/protocol.md · npm run docs:protocol:check → up to date
npx vitest run --project backend src/host src/protocol → Tests 122 passed (122)
npx vitest run --project frontend ErrorBoundary.test.tsx main/index.test.tsx sidebar/index.test.tsx → Tests 8 passed (8)
npx vitest run --project backend src/test/lint → Tests 131 passed (131)
npm test                    → exit 0 · Tests 1997 passed | 9 skipped (2006) · npm run bench → exit 0
rm -rf dist out/esbuild && node esbuild.mjs --production --analyze → dist/extension.js 297016 / 322502 ·
                              dist/webview.js 548697 / 577766 · dist/sidebar.js 327723 / 351245
npm run package:vsix        → exit 0 · Packaged: nuiget-v2.0.0.vsix (17 files, 578.25 KB)
rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui → exit 0 · 38 passing (1m)
```

## Done (tested)

- `ui/reportError`: `{ message: string; stack?: string; componentStack?: string }` → `{}`, under Diagnostics; its key in
  `REQUEST_TYPE_RECORD`. Test: `accepts the ui/reportError request` (protocol.test.ts).
- Named rewrites (follow-up ruling): `src/host/handlers.test.ts` 'covers the 45 requests of the protocol' (was 44) and
  `ARCHITECTURE.md:41` "45 requests".

## Done (untested)

- None.

## Not started

- None of P9.9.

## Deviations from contract/ADR (file:line each)

- None. The guard key sits on the `ui/openExternal` line (the ruling said "the `ui/` line").

## Advisor decisions (date, item, question, answer verbatim)

2026-10-17, P9.9: the ruling is verbatim in `src/host/STATUS.md`. 2026-10-17, P9.9 commit (b) follow-up (the request-count
test), verbatim:

`````text
DECISION: Option 1. Rewrite `src/host/handlers.test.ts:257-260` to the title `covers the 45 requests of the protocol` with `toHaveLength(45)`, the second assertion unchanged, as a named rewrite of P9.9 (b). `ARCHITECTURE.md:41` becomes "45 requests" under DO 14. The `cpm/preview` "44th request" line in `docs/adr/007-protocol.md:29` stays as it is (it is history, like the "43rd" line above it).

WHY: Verified in the tree: the test at `handlers.test.ts:257-260` is the exact text of the brief and the number is the only thing that distinguishes it from the `payloads` table rewrite the ruling named at `:120-166`; it exists to catch a request added without a payload entry, which the second assertion still does. D6 ("Contract items regenerate `docs/protocol.md` and fix dependent tests") makes a count that follows a contract change a dependent test, not "a failing test you did not write"; P6.4a (the 44th request) must have changed this same line from 43 to 44, and the test's title is a count, so option 2 would leave a title that lies. `grep -n "44" ARCHITECTURE.md docs/adr/007-protocol.md docs/ux/interaction-model.md README.md` finds only `ARCHITECTURE.md:41` and the ADR's historical `cpm/preview` bullet; the EventMap count (11) is unchanged. Sentinel content is `P9.9` and the working tree holds exactly the seven files of DO 9-10 plus `docs/protocol.md`, so the change stays inside the approved CONTRACT CHANGE.

DO:
1. `src/host/handlers.test.ts:257-258`: title `covers the 45 requests of the protocol`, `expect(REQUEST_TYPES).toHaveLength(45);`; leave `:259` as it is.
2. `ARCHITECTURE.md:41`: `RequestMap` (45 requests, …); the rest of the row unchanged. Record both as named rewrites in the STATUS note of `src/host` and `src/protocol`.
3. Re-run `npx vitest run --project backend src/host src/protocol` → 0 failed, 122 passed; then continue with DO 11-16 (the ErrorBoundary, the entries, docs, gates, `rm .claude/.contract-change` before the commit).

DO NOT:
- Do not keep the title at 44 with the number at 45, and do not delete or loosen the test (`toBeGreaterThan`, a derived count) so that the next request slips in uncounted.
- Do not edit the "44th request" wording of `docs/adr/007-protocol.md:29`; the new "45th" bullet after it is the record.
- Do not commit (b) while `.claude/.contract-change` exists, and do not add any further file to the contract change for this fix.

CONTRACT CHANGE: unchanged from the ruling (sentinel `P9.9`; `messages.ts`, `guards.ts`, `docs/adr/007-protocol.md`, `docs/protocol.md`). This follow-up adds two named rewrites: `src/host/handlers.test.ts:257-258` and `ARCHITECTURE.md:41`.

VERIFY: `sed -n 257,260p src/host/handlers.test.ts` → the title says 45 and `toHaveLength(45)`; `grep -n "44 requests\|45 requests" ARCHITECTURE.md` → one line, `:41`, reading 45; `npx vitest run --project backend src/host src/protocol` → 0 failed; `npm run docs:check` → 0 after DO 14.

Files checked: `/Users/mattias/github/nuiget/src/host/handlers.test.ts:255-261`; `/Users/mattias/github/nuiget/ARCHITECTURE.md:41`; `/Users/mattias/github/nuiget/docs/adr/007-protocol.md:29`; `/Users/mattias/github/nuiget/.claude/.contract-change` (content `P9.9`); `git status --short` (seven modified files: `docs/adr/007-protocol.md`, `docs/protocol.md`, `src/host/handlers.test.ts`, `src/host/handlers.ts`, `src/protocol/guards.ts`, `src/protocol/messages.ts`, `src/protocol/protocol.test.ts`); `git log --oneline -2` (`2975739` commit (a) on top of `428a060`).
`````

## Exact next step (one item ID)

P9.10.

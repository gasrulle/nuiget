# STATUS — src/webview/sidebar   commit 3f2a2e0 (P9.13; parent of the P9.fix-1 commit)   2026-10-17T09:00:00Z

git status --porcelain --untracked-files=all (before the commit): see `src/webview/shared/STATUS.md` (one commit for
P9.fix-1); in this directory modified `index.tsx`, `index.test.tsx`, `STATUS.md`

Item: **P9.fix-1** — the sidebar entry mounts the store with `prefetch={false}`, so the sidebar never asks
`transitive/get` or the transitive `transitive/metadata` ahead of time (N87). The rulings, the full gate output and the
change are in `src/webview/shared/STATUS.md`. This note replaces the P9.10 note (history at `52baabc`).

## Verified by running

```text
npx vitest run --project frontend src/webview/shared/store src/webview/sidebar src/webview/main/index.test.tsx
                     → Tests 193 passed (193)
npm test             → exit 0; Test Files 135 passed (135); Tests 2016 passed | 9 skipped (2025)
negative control     → `prefetch={false}` removed from index.tsx: `the entry mounts the store without the transitive
                       prefetch (P9.fix-1, N87)` fails; restored
dist/sidebar.js      → 333128 / 351245 (+57 bytes against run 39016052047)
```

## Done (tested)

- `index.tsx:34`: `<StoreProvider bus={bus} prefetch={false}>`; `index.test.tsx`: the entry test through a
  `vi.doMock` wrapper of `../shared/store/StoreProvider` that renders the real provider, `vi.doUnmock` in `afterEach`.

## Done (untested)

- Nothing.

## Not started

- Sidebar rows of the parity audit still open for 2.0.1: SB2, SB7, SB9, SB10, SB13, SB14, DP10
  (`docs/plans/parity-audit-2026-10-16.md`, `## Closure status`).

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

- 2026-10-17, P9.fix-1: the P9 phase review and the follow-up ruling on the test shape, verbatim in
  `src/webview/shared/STATUS.md`.

## Exact next step (one item ID)

P9 gate re-run and the visual check, then stop for the owner's `P9 approved`; after it, P10.1.

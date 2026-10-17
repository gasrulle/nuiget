# STATUS — src/core/logging   commit bf2c68b (P7.2c closed; parent of the P7.3 commit 1)   2026-10-16T00:30:10Z

git status --porcelain --untracked-files=all (before commit 1): modified `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`,
`src/core/logging/{redact,redact.test}.ts`, `src/core/sources/NuGetConfigReader.test.ts`, the STATUS notes of `src/core/sources`
and `src/core/logging`

Item: **P7.3, commit 1** — `redact` masks a secret that is the value of a quoted JSON key (N56), by the P7.3 ruling
of 2026-10-16 (verbatim in `docs/plans/STATUS.md` and `src/core/sources/STATUS.md`). This note replaces the P1.5 note
(in this file's history at `effc1e4`).

## Verified by running

```text
baseline at bf2c68b (CI run 38827088243 green on 13 of 13): tsc 0 · check-types 0 · eslint 0 · npm test 167 files,
                              3413 passed (macOS, NUIGET_SDK_TESTS=1) · bench 0
npx tsc --noEmit / npm run check-types / npx eslint src → exit 0 each
npx vitest run --project backend src/core/sources src/core/logging src/core/cli --reporter=verbose → 11 files, 214
                              passed, 4 skipped; "redacts a secret that is the value of a quoted JSON key (N56)" passed;
                              "dpapi (Windows, SDK 10): …" and "dpapi (Windows): … (N54)" SKIPPED: not win32
DOTNET_ROOT=… NUIGET_SDK_TESTS=1 npx vitest run --project backend src/core/cli src/core/sources → 190 passed, 2 skipped
                              (the two DPAPI tests, SKIPPED: not win32)
npm test (DOTNET_ROOT set, NUIGET_SDK_TESTS=1) → exit 0 · Test Files 167 passed (167) · Tests 3414 passed | 2 skipped (3416)
npm run bench               → exit 0 · Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
grep -rln child_process src/core --include='*.ts' → src/core/cli/* only
rm -rf dist && node esbuild.mjs --v2 --production --analyze → dist/extension.js 292374 / 321341 (+17, redact.ts) ·
                              dist/webview.js 523296 / 575626 · dist/sidebar.js 318803 / 350684
```

## Done (tested)

- `redact.ts`: `HEADER_SECRET`, `KEY_VALUE_SECRET` and `NUGET_CONFIG_SECRET` admit an optional quote between the key
  word and the separator (`"Password":"…"`, `"token":"…"`, `"Authorization":"…"`); replacement strings unchanged.
- `redact.test.ts`: new `redacts a secret that is the value of a quoted JSON key (N56)`; `is stable when applied twice`
  also applies the JSON form twice. Every existing title and output unchanged (25 → 26 tests in the file).

## Done (untested)

- None.

## Not started

- None.

## Deviations from contract/ADR (file:line each)

- `redact.ts:24,27`: the value class of `KEY_VALUE_SECRET` and `NUGET_CONFIG_SECRET` also stops before `}`. The
  widened key match alone was not idempotent on the JSON form (`{"token":"tok456"}` → `{"token=[REDACTED]}` → a
  second pass ate the `}`), which the ruling's step 4 requires; no existing output changed.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.3: verbatim in `docs/plans/STATUS.md` ("P7.3 — stop-and-ask: the scope of the Windows item …") and in
`src/core/sources/STATUS.md`. For this directory: N56 in commit 1, with a JSON-form test and the idempotence check.

## Exact next step (one item ID)

P7.3, commit 2.

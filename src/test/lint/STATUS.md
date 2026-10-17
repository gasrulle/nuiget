# STATUS — src/test/lint   commit aacde06 (P9.fix-5; parent of the P9.fix-6 commit)   2026-10-17T11:00:00Z

git status --porcelain --untracked-files=all src/test/lint (before the commit): modified `webview-stylesheets.test.ts`,
`webview-tokens.test.ts`, `STATUS.md`

Item: **P9.fix-6** — every padding, margin and gap of a 2.0 stylesheet from the spacing scale, by the P9.fix-2..6
ruling (verbatim in `src/webview/main/STATUS.md`). This note replaces the P8.2b note (history at `6678f0f`).

## Verified by running

```text
npx vitest run --project backend src/test/lint/webview-stylesheets.test.ts src/test/lint/webview-tokens.test.ts
                     → Tests 24 passed (24)
grep -rnE '^\s*(padding|margin|gap|row-gap|column-gap)[a-z-]*\s*:[^;]*[0-9](px|em|rem)' src/webview --include='*.css'
  | grep -v tokens.css | wc -l → 0 (the owner's grep; before P9.fix-6: 4 lines, primitives.css:12, main.css:76,
                       main.css:426 (1.75em), main.css:434)
npm test             → exit 0; Test Files 135 passed (135); Tests 2019 passed | 9 skipped (2028)
```

## Done (tested)

- `webview-stylesheets.test.ts`: `findStylesheetDefects` gains `pxSpacing` (a `padding*`, `margin*`, `gap`, `row-gap`
  or `column-gap` declaration whose value holds a `px`, `em` or `rem` length); new test `every padding, margin and gap
  is a spacing token`; named rewrites of the two scanner self-tests: `the scanner finds planted defects` plants
  `padding: 1px 4px` and now also reports the existing planted `margin: 0.5em`; `the scanner accepts what the
  primitives are allowed to write` accepts `margin-block-start: calc(var(--nuiget-space-1) * -1); padding: 0`.
- `webview-tokens.test.ts`: `REQUIRED` gains `--nuiget-space-hairline` and `--nuiget-inset` (named rewrite).

## Done (untested)

- Nothing.

## Not started

- Nothing in this directory.

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

- 2026-10-17, P9.fix-2..6: the ruling is verbatim in `src/webview/main/STATUS.md` (DO 23, 26 for this directory).

## Exact next step (one item ID)

The P9 gate re-run after P9.fix-6.

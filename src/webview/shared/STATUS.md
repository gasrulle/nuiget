# STATUS — src/webview/shared   commit 3349d27 (parent of the P3.1 commit)   2026-10-13T21:07:00Z

Scope of this note: `src/webview/shared/**`, the code both 2.0 webviews share, and the test wiring it needs
(`src/test/setup-frontend.ts`, `src/test/jest-axe.d.ts`, `src/test/lint/webview-*.test.ts`).

git status --porcelain --untracked-files=all: `?? src/webview/shared/tokens.css`,
`?? src/webview/shared/primitives/icons.tsx`, `?? src/webview/shared/primitives/icons.test.tsx`,
`?? src/webview/shared/STATUS.md`, `?? src/test/jest-axe.d.ts`, `?? src/test/lint/webview-colours.test.ts`,
`?? src/test/lint/webview-tokens.test.ts`, ` M src/test/setup-frontend.ts`, ` M tsconfig.vitest.json`,
` M package.json`, ` M package-lock.json`, ` M docs/plans/STATUS.md`, ` M docs/plans/findings-ledger.md`,
` M CHANGELOG.md`, ` M ARCHITECTURE.md`, ` M .github/copilot-instructions.md` (all belong to the P3.1 commit)

Item: **P3.1 tokens, icons and the axe matcher** (stop-and-ask: the row names `jest-axe`, which was not
installed, so `package.json` and the lockfile change; no contract change, no sentinel). The quarry has nothing
in this directory but a note; everything here is new, the icons a port of `src/webview/app/icons.tsx`.

## Verified by running

```text
baseline npx tsc --noEmit / npm run check-types → exit 0 / exit 0
baseline npx eslint src      → exit 0
baseline npx vitest run      → Test Files 83 passed (83) · Tests 2492 passed | 3 skipped (2495)
baseline npx vitest run --project frontend → 20 files, 612 tests, Duration 2.50s (before the axe matcher)
npm install (after the one line in package.json) → exit 0 · only package.json and package-lock.json changed ·
                               24 lockfile entries added, none removed: jest-axe 11.0.0 (MIT), axe-core
                               4.12.1 (MPL-2.0), jest-matcher-utils and jest-diff 30.4.1, lodash.merge
                               4.6.2, @jest/* helpers, @sinclair/typebox, react-is, chalk 4 with its two
                               helpers (all MIT) · grep -c '"node_modules/jest-axe"' package-lock.json → 1 ·
                               ls node_modules/@types | grep -c jest → 0
npm ci --no-audit --no-fund  → exit 0 (the lockfile installs as it is) · git status afterwards: the files of
                               this item only · ls node_modules/@types | grep -c jest → 0
npm audit                    → 4 vulnerabilities (2 low, 1 moderate, 1 high): the same four development-only
                               findings as before the item (N28); the new packages add none
npx tsc --noEmit / npm run check-types → exit 0 / exit 0 (src/test/jest-axe.d.ts through tsconfig.vitest.json)
npx eslint src / npm run lint → exit 0, no output / exit 0
npx vitest run --project frontend → 21 files, 620 tests, Duration 2.47s (2.50s before: the matcher costs
                               nothing where no test calls axe)
npx vitest run --project frontend src/webview/shared → Test Files 1 passed (1) · Tests 8 passed (8) (the
                               row's gate "frontend tests green")
npx vitest run --project backend src/test/lint → Test Files 4 passed (4) · Tests 106 passed (106), among
                               them webview-colours (3) and webview-tokens (7): the row's gate "hex colours
                               only in tokens.css"
node esbuild.mjs --v2        → exit 0 · [development] Build complete · dist/ after rm -rf dist: extension.js,
                               sidebar.js, webview.js and their maps, no CSS file (expected until P3.4)
npm test (NUIGET_SDK_TESTS=1) → Test Files 86 passed (86) · Tests 2513 passed (2513)
npx vitest run               → Tests 2510 passed | 3 skipped (2513)
npx vitest run --coverage    → exit 0 · all files lines 79.74 % · src/webview/** 3064 of 4691 lines, 65.32 %
                               (ratchet 64, unchanged) · src/webview/shared/** 53 of 53 · src/core/** 98.52 %
npm run bench / bench:compare → exit 0 / exit 0 · Tests 112 passed | 1 skipped (113)
negative control             → 13 mutations: a titled icon without role; `aria-hidden="false"`; an icon with
                               a style attribute, a fixed size, a colour literal; tokens.css with an element
                               rule, a colour that is no alias, a var() of a foreign variable, a duration
                               left on under reduced motion, a required token missing, a theme variable
                               under forced colours, one high-contrast class only; a hex colour planted in a
                               stylesheet of the sidebar. 13 of 13 caught; every file restored.
grep -rnE '#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})([^[:alnum:]_-]|$)|rgba?\(|hsla?\(' src/webview/shared src/webview/main src/webview/sidebar-next → 0 lines
grep -c 'style' src/webview/shared/primitives/icons.tsx → 0 · grep -c 'prefers-reduced-motion' tokens.css → 1
git diff --stat -- src/protocol src/core src/host docs/adr vitest.config.mts eslint.config.mjs esbuild.mjs → empty
ls .claude/.contract-change  → No such file or directory
npm run package:vsix, npm run check:vsix, npm run docs:protocol:check, npm run test:ui → SKIPPED: no host,
                               packaging, protocol or UI file changed; CI runs them (and its Build & Package
                               job proves with check:vsix that the new development dependency does not ship)
CI                           → see the tracker row of P3.1
```

## Done (tested)

- `tokens.css`: custom properties with the prefix `--nuiget-` and nothing else. Spacing 1 to 6 (2 to 16 px),
  two radii, two row heights (22 and 44 px), three icon sizes, the smallest pointer target (24 px), four
  z-index steps, two durations and an easing, three font sizes in `em`, line height and two font families,
  and 28 colour tokens, each an alias of a `--vscode-*` variable. One rule for the two high-contrast classes,
  one `forced-colors` block in system colours, one `prefers-reduced-motion` block. No colour literal.
- `primitives/icons.tsx`: the 26 icons of 1.x. `IconProps` is `{ size?, className?, title? }`; no `style`; an
  icon without a title has `aria-hidden="true"` and no role, one with a title has `role="img"`, a `<title>`
  and no `aria-hidden` attribute (1.x rendered `aria-hidden="false"` there).
- `primitives/icons.test.tsx`, 8 tests over every export of the module: the seven titles of the ruling and
  `the axe matcher is live: an image without a name is a violation`.
- `src/test/setup-frontend.ts` registers `toHaveNoViolations` for every frontend test; `src/test/jest-axe.d.ts`
  types the package; `tsconfig.vitest.json` includes the declaration file.
- `src/test/lint/webview-colours.test.ts` (3 tests) and `src/test/lint/webview-tokens.test.ts` (7 tests): the
  tool behind the gate "hex colours only in `tokens.css`", and the shape of the tokens file.

## Done (untested)

- Nothing renders with the tokens yet: `tokens.css` is imported by no entry, so it is in no bundle and
  `node esbuild.mjs --v2` writes no CSS file. The lint tests check the file's text, not its effect in a
  theme. P3.4 imports it from the sidebar entry; P5.11 is the theme pass.
- `LoadingIcon` carries the class `codicon-loading`, as in 1.x, where a stylesheet binds the spin animation to
  it. No 2.0 stylesheet has that rule yet: the `Spinner` primitive of P3.2 brings it, timed with
  `--nuiget-duration-*`.

## Not started

- The other primitives (`Row`, `Listbox`, `SectionHeader`, `IconButton`, `Badge`, …): P3.2, after its ⚑
  decision on the listbox and row markup. `primitives/index.ts` is decided there.
- `bus/` and `store/`: P3.3. `PackageIcon` and `BookIcon`: with their first consumer.
- Raising the coverage ratchet of `src/webview/**`: not in this item (the ruling leaves the thresholds).

## Deviations from contract/ADR (file:line each)

- `src/test/setup-frontend.ts:12-19` and `src/test/jest-axe.d.ts`: the ruling puts the Vitest augmentation
  into the declaration file, written as `interface Assertion<T = unknown>` and `AsymmetricMatchersContaining`.
  Two things in the tree decide otherwise. `declare module 'jest-axe'` is a declaration of that module only
  in a script file (no top-level import or export), and an augmentation of `vitest` needs a module file, so
  the two cannot share a file; the augmentation is in `setup-frontend.ts`, which `tsconfig.vitest.json`
  already includes. And Vitest 5 declares `Assertion<R, T>` with two type parameters, so a one-parameter
  interface does not merge (TS2428); Vitest's extension point for custom matchers is `Matchers<R, T>`, which
  `Assertion` and the asymmetric matchers both extend, and the matcher is declared there with Vitest's own
  parameter list (one `eslint-disable-next-line` for the unused `T`).
- `primitives/icons.test.tsx`: one test more than the ruling lists (the liveness check of the matcher), and
  `className is applied` asserts that the class is among the icon's classes, because `LoadingIcon` adds its
  own.
- `tokens.css`: the fallbacks that are keywords are `transparent` (shadow, input border); `fg-muted` falls
  back to `--vscode-foreground`. The ruling asks for "a `--vscode-*` or keyword fallback" without naming them.
- `src/test/lint/webview-tokens.test.ts`: beyond the ruling's list it checks that the forced-colours block
  uses system colour keywords only and that the high-contrast rule sets exactly border, focus and shadow.
  It normalizes CRLF to LF when it reads `tokens.css`: the repository has no `.gitattributes`, and a checkout
  on Windows may have CRLF, which two of its lookups would not find.
- `.github/copilot-instructions.md`: two gotcha rows where the ruling asks for one. "Jest-typed matcher
  packages under Vitest" is the ruled one; "Colour literal in a 2.0 webview file" tells the next author what
  the new lint test wants, which is the kind of footgun the table exists for.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-13, P3.1, stop-and-ask in the plan's §2.4 form (`architecture-advisor`). Question: `jest-axe` is not
installed and `package.json` is not named by the row; which dependency, how is the matcher wired and typed
under Vitest, what are the tokens, what is the tool behind "hex colours only in `tokens.css`", is the file
bundled now, and how far does the icon port go? Answer, verbatim:

`````text
DECISION: Option B, sharpened: `jest-axe` (`^11.0.0`, caret like every other entry) as the only new devDependency, no `@types/jest-axe`; the matcher is registered globally in `src/test/setup-frontend.ts`; the Vitest type augmentation (and, if `jest-axe` ships no types, an ambient module declaration of the three exports the tests use) lives in a new `src/test/jest-axe.d.ts` that `tsconfig.vitest.json` lists; `package.json`, `package-lock.json` and that `tsconfig.vitest.json` line are the item's files under this ruling. `tokens.css` is custom properties only (`--nuiget-*`), colours as `--vscode-*` aliases with `--vscode-*` fallbacks, zero hex in P3.1, HC/forced-colors/reduced-motion blocks and no light/dark blocks, imported by nothing until P3.4. All 26 icons ported, no `PackageIcon`/`BookIcon`, no barrel. The hex gate becomes two lint-as-tests in `src/test/lint/`. Not `OWNER MUST DECIDE`: the owner approved the row that names `jest-axe`, and `contributes` does not change.

WHY: The brief describes the tree accurately (checked: `src/test/setup-frontend.ts:5-18`; `tsconfig.vitest.json:26-29,46-56`; `vitest.config.mts:36-47,72-80`; `src/webview/app/icons.tsx:11-16` and 26 `export const` lines; `src/host/services.ts:103-131`; `esbuild.mjs:13-24,77-100`; `.claude/settings.json` allows exactly `Bash(npm install)` and `Bash(npm ci)`; `src/webview/shared` does not exist). The row (plan line 244) names `jest-axe` in `setup-frontend.ts`, so adding it is the item's work, not a "resource suggests it" install (`.github/copilot-instructions.md:35` is about Awesome Copilot templates); §2.1 makes a config file the item names one of its files, and the P2.11 ruling (`docs/plans/STATUS.md:1264`) is the precedent for approving one `tsconfig.vitest.json` include line here. Option A is wrong for this tree, not just redundant: `@types/jest-axe` depends on `@types/jest`, whose global `describe`/`it`/`expect` declarations would sit next to `vitest/globals` in the `tsconfig.vitest.json` program (brief point 2 is right that its `jest.Matchers` augmentation does nothing for Vitest), and the quarry's "no `tsc` impact" claim rested on tests not being type-checked, which P0.11 ended. Option C re-implements what jest-axe encodes (its default disables the `region` rule, which otherwise fails every primitive rendered in isolation) and departs from the row's text; D is unmaintained. ADR-008:33-35 wants tokens for layout, motion and typography with "theme coverage ... in one place" and "no hex outside tokens": a permission for `tokens.css`, not a requirement; every VS Code theme colour reaches a webview as a `--vscode-*` variable, so aliases cover light and dark by construction and only high contrast (`--vscode-contrastBorder`, no shadows) and `forced-colors` (system colour keywords) need their own blocks; U4, U5, U7, U9 and U11 (`docs/plans/findings-ledger.md:248-255`) are what the tokens progress, and P5.11 (plan line 284) is where they close. ADR-006:22-23 forbids a `style` attribute in rendered HTML; the 1.x icons also render `aria-hidden="false"` on titled icons (`aria-hidden={!title}`), which the port corrects. CSS needs nothing in `esbuild.mjs`: 1.x gets `dist/webview.css` from `import './App.css'` in `App.tsx:3` with no loader entry, and the 2.0 entries are P3.4's and P5.3's files, so `tokens.css` stays unbundled until P3.4 and the STATUS note says so.

DO:
1. Dependency: edit `package.json` devDependencies by hand, `"jest-axe": "^11.0.0"` after `"jsdom"`; run `npm install` (pre-approved; `npm install --save-dev` is not); check `git status --porcelain --untracked-files=all` shows only `package.json` and `package-lock.json`, and `grep -c '"node_modules/jest-axe"' package-lock.json` → 1 and `ls node_modules/@types | grep -c jest` → 0; run `npm ci` once (ADR-000:45) and `npm audit` and paste both summary lines into the STATUS note (licences: jest-axe MIT, axe-core MPL-2.0, development only; `npm run check:vsix` proves nothing ships).
2. Decide the typing shape from the installed package: `grep -n '"types"' node_modules/jest-axe/package.json; ls node_modules/jest-axe/*.d.ts`. If it ships types, `src/test/jest-axe.d.ts` holds only the Vitest augmentation. If not (expected), it also holds `declare module 'jest-axe'` with the exports the tests use: `axe(html: Element | string, options?: object): Promise<AxeResults>`, `configureAxe(options?: object): typeof axe`, `toHaveNoViolations: { toHaveNoViolations(results: AxeResults): { pass: boolean; message(): string } }`, where `AxeResults` is a self-contained interface (`violations: Array<{ id; impact?; help; helpUrl; nodes: Array<{ html; target: string[] }> }>`), no import from `axe-core` (a transitive package; importing it would be a phantom dependency). The Vitest part: `declare module 'vitest' { interface Assertion<T = unknown> { toHaveNoViolations(): T } interface AsymmetricMatchersContaining { toHaveNoViolations(): unknown } }`, mirroring `node_modules/@testing-library/jest-dom/types/vitest.d.ts`. Add `"src/test/jest-axe.d.ts"` to the `include` of `tsconfig.vitest.json` next to `src/test/setup-frontend.ts`.
3. `src/test/setup-frontend.ts`: add `import { toHaveNoViolations } from 'jest-axe';` and `expect.extend(toHaveNoViolations);` (globals are on). It applies to the 1.x frontend tests too; that is additive and harmless. No helper in `src/test/helpers/frontend.tsx`; tests write `expect(await axe(container)).toHaveNoViolations()`. Record `npx vitest run --project frontend` wall time before and after in the STATUS note.
4. `src/webview/shared/tokens.css`: only custom-property declarations, no element rules (body font and colour belong to the entry CSS of P3.4). `:root`: `--nuiget-space-1..6` (2, 4, 6, 8, 12, 16 px); `--nuiget-radius-sm|md` (2, 4 px); `--nuiget-row-height-compact|comfortable` (22, 44 px, starting values P3.4/P5.3 may retune by value, never by name); `--nuiget-icon-size-sm|md|lg` (12, 16, 24 px); `--nuiget-target-min: 24px` (U11, P5.11's "≥ 24 px targets"); `--nuiget-z-sticky|popover|dialog|toast` (1, 10, 20, 30); `--nuiget-duration-fast|normal` (100 ms, 200 ms) and `--nuiget-easing: ease-out`; `--nuiget-font-size-sm|md|lg` (0.85em, 1em, 1.15em), `--nuiget-line-height: 1.4`, `--nuiget-font-family: var(--vscode-font-family)`, `--nuiget-font-family-mono: var(--vscode-editor-font-family)`. Colours, each `var(--vscode-…)` with a `--vscode-*` or keyword fallback and never a literal: `fg` (foreground), `fg-muted` (descriptionForeground), `border` (widget-border, fallback panel-border), `focus` (focusBorder), `list-hover-bg`, `list-active-bg|fg`, `list-inactive-bg` (list-*), `badge-bg|fg`, `button-bg|fg|hover-bg`, `button-secondary-bg|fg`, `input-bg|fg|border|placeholder`, `link` (textLink-foreground), `error` (errorForeground), `warning` (editorWarning-foreground), `info` (editorInfo-foreground), `progress` (progressBar-background), `shadow` (widget-shadow), `scrollbar|scrollbar-hover|scrollbar-active` (scrollbarSlider-*). One block `body.vscode-high-contrast, body.vscode-high-contrast-light { --nuiget-color-border: var(--vscode-contrastBorder); --nuiget-color-focus: var(--vscode-contrastActiveBorder, var(--vscode-focusBorder)); --nuiget-color-shadow: transparent; }`; one `@media (forced-colors: active)` block mapping the colour tokens to `CanvasText`, `Canvas`, `Highlight`, `HighlightText`, `ButtonFace`, `ButtonText`, `GrayText`, `LinkText`, `Field`, `FieldText`; one `@media (prefers-reduced-motion: reduce)` block setting both durations to `0ms`. A header comment states that light and dark are covered by the aliases and that P5.11 owns any literal that ever becomes necessary.
5. `src/webview/shared/primitives/icons.tsx`: the 26 icons of `src/webview/app/icons.tsx`, header kept (codicons, MIT), `IconProps = { size?: number; className?: string; title?: string }`, `width={size} height={size}`, `fill="currentColor"`, `aria-hidden={title ? undefined : true}`, `role={title ? 'img' : undefined}`, `<title>` when titled, `React.memo` kept; no `style`, no `PackageIcon`/`BookIcon` (first consumer adds them), no `primitives/index.ts` (P3.2 decides when there are several primitives). Imports: `react` only (the webview fence allows it; `npx eslint src/webview/shared` → 0).
6. `src/webview/shared/primitives/icons.test.tsx` (frontend project), table-driven over `Object.entries(await import('./icons'))` so a new icon is tested without editing the table: `every export of the module is an icon component`; `every icon is aria-hidden without a title` (also asserts no `role`); `a titled icon is an image with an accessible name` (`getByRole('img', { name })`); `no icon renders a style attribute`; `width and height follow size`; `className is applied`; `icons have no axe violations` (all icons untitled in one container, then all titled, each `toHaveNoViolations`).
7. `src/test/lint/webview-colours.test.ts` (backend project; the folder is already in both `vitest.config.mts:68` and `tsconfig.vitest.json:48`): walks `src/webview/{shared,main,sidebar-next}` with `readdirSync(dir, { recursive: true })` for `*.css|ts|tsx` including tests, exempts exactly `src/webview/shared/tokens.css`, and reports every match of hex `#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])` and of the functions `rgb(`, `rgba(`, `hsl(`, `hsla(`, `hwb(`, `lab(`, `lch(`, `oklab(`, `oklch(`, `color(` as `path:line: text`. Named colours are not covered (words). Tests: `no colour literal outside tokens.css` (expect `[]`); `the scan covers the 2.0 webview files` (the file list contains `tokens.css` and `primitives/icons.tsx`, so an empty glob cannot pass vacuously); `the scanner finds planted literals` (a string sample with `#fff`, `#A1B2C3D4`, `rgb(0 0 0)`, and non-matches `#root`, `#sidebar-root`, `getElementById('#abc-def')`).
8. `src/test/lint/webview-tokens.test.ts` (backend): reads `tokens.css` and asserts braces balance; every declaration matches `^\s*--nuiget-[a-z0-9-]+:\s.+;$`; every `var(` argument starts with `--vscode-` or `--nuiget-`; exactly one `prefers-reduced-motion: reduce` rule and it sets both duration tokens to `0ms`; exactly one `forced-colors: active` rule; the HC selector names both `vscode-high-contrast` classes; the required token names of step 4 are all declared in `:root` (P3.2 relies on them).
9. Gates in §2.2 order, plus `npx vitest run --project frontend src/webview/shared`, `npx vitest run --project backend src/test/lint`, `npm run check-types` (the `.d.ts` is reached through `tsconfig.vitest.json`), `node esbuild.mjs --v2` (unchanged output: three bundles, no CSS), `npm test`, `npm run bench`; `package:vsix`, `check:vsix`, `docs:protocol:check`, `test:ui` SKIPPED with the literal reason (no host, packaging, protocol or UI file changed). Run `npx vitest run --coverage` and paste the `src/webview/**` numbers; do not touch the thresholds.
10. Docs: CHANGELOG `### Added` `**2.0 webview tokens and icons** — \`src/webview/shared\` holds the design tokens of the 2.0 webviews (spacing, radius, row heights, icon sizes, hit target, z-index, motion, em typography and colour aliases, with high-contrast, forced-colours and reduced-motion coverage in one file) and the icon set without inline styles; a lint test keeps colour literals out of every other 2.0 webview file, and the frontend tests check rendered markup with axe`. ARCHITECTURE.md `src/webview/shared/**` row (line 104): "Tokens and icons present since P3.1 (`tokens.css`, `primitives/icons.tsx`); bus and store in P3.3; `tokens.css` is in no bundle until the sidebar entry imports it in P3.4", plus a short subsection "Webview tokens and the colour gate" under the 2.0 section naming the `--nuiget-` prefix, the alias rule, the theme coverage mechanism, the two lint tests and the axe matcher in `setup-frontend.ts`. One 2.0 gotcha row: "Jest-typed matcher packages under Vitest: `@types/jest-axe` (and anything depending on `@types/jest`) augments the `jest` namespace, which `tsconfig.vitest.json` never loads, and puts a second set of `describe`/`it`/`expect` globals next to `vitest/globals`; the Vitest augmentation is `src/test/jest-axe.d.ts`. Never add `@types/jest`." New `src/webview/shared/STATUS.md` (§2.5). Ledger: U4, U5, U7, U9, U11 "progressed in P3.1 (tokens); close at P5.11"; tracker row P3.1 with the SHA. Commit: `feat(webview/shared): tokens, icons and the axe matcher (P3.1, ADR-008, ADR-006, U4, U5, U7, U9, U11)`.

DO NOT:
- Add `@types/jest-axe`, `@types/jest`, `vitest-axe` or a direct `axe-core` dependency.
- Run `npm install --save-dev …` (not on the allowlist) or hand-edit `package-lock.json`.
- Write `body.vscode-light`/`body.vscode-dark` blocks with no differing value, or a hex, `rgb()` or `hsl()` literal anywhere in P3.1, `tokens.css` included.
- Put element rules (`body`, `*`) or a reset into `tokens.css`.
- Import `tokens.css` from `src/webview/main/index.tsx` or `src/webview/sidebar-next/index.tsx`, or touch `esbuild.mjs`.
- Keep `style` in `IconProps`, keep `aria-hidden={!title}`, add `PackageIcon`/`BookIcon`, or add a `primitives/index.ts`.
- Change the coverage thresholds in `vitest.config.mts`, `eslint.config.mjs`, CI, the interaction model, or any frozen path.
- Narrow the colour scan to `.css` files or exempt test files from it.

CONTRACT CHANGE: none. `src/protocol/**`, `src/core/contracts.ts` and `docs/adr/**` stay as they are (ADR-008:33-35 already describes `tokens.css`); `.claude/.contract-change` must not exist. Approved as files the row does not name: `package.json` (devDependencies only), `package-lock.json`, one `include` line in `tsconfig.vitest.json`, `src/test/jest-axe.d.ts`, `src/test/lint/webview-colours.test.ts`, `src/test/lint/webview-tokens.test.ts`.

VERIFY: `git diff --stat HEAD~1 -- package.json tsconfig.vitest.json` shows one added dependency line and one include line; `ls node_modules/@types | grep -c jest` → 0; `npm ci` exits 0; `npx tsc --noEmit && npm run check-types && npx eslint src` → 0 each; `npx vitest run --project frontend src/webview/shared` green with the seven titles of step 6; `npx vitest run --project backend src/test/lint` green with the titles of steps 7 and 8; `grep -rnE '#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})([^[:alnum:]_-]|$)|rgba?\(|hsla?\(' src/webview/shared src/webview/main src/webview/sidebar-next` → 0 lines (the gate, stricter than the row for this item); `grep -c 'style' src/webview/shared/primitives/icons.tsx` → 0; `grep -c 'prefers-reduced-motion' src/webview/shared/tokens.css` → 1; `node esbuild.mjs --v2` builds three bundles and `ls dist/*.css` after `rm -rf dist` shows none (expected until P3.4); `npm test` and `npm run bench` green; `test -e .claude/.contract-change` → false.

FILES CHECKED: `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:41-175,240-251,284`; `docs/adr/008-webview-architecture.md` (whole); `docs/adr/006-icons-and-csp.md` (whole); `docs/adr/000-release-and-compatibility-policy.md` (whole); `docs/plans/STATUS.md:45-56,1187,1264` and its advisor-decision headings; `docs/plans/findings-ledger.md:241-256`; `docs/ux/interaction-model.md:106-124`; `src/test/setup-frontend.ts`; `src/test/helpers/frontend.tsx`, `index.ts`; `src/test/lint/allowlist.test.ts:1-60`, `vsix-contents.test.ts:1-40`; `tsconfig.json`, `tsconfig.test.json`, `tsconfig.vitest.json`; `vitest.config.mts`; `eslint.config.mjs:10-43`; `esbuild.mjs` (whole); `src/host/services.ts:100-140`; `src/webview/main/index.tsx`, `src/webview/sidebar-next/index.tsx`; `src/webview/app/icons.tsx:1-60` and its 26 exports; `src/webview/app/App.tsx:3`, `src/webview/sidebar/SidebarApp.tsx:23`; `package.json` (devDependencies, dependencies, scripts); `.claude/settings.json`; `scripts/hooks/guard.mjs:1-120`; `scripts/check-vsix-contents.mjs:10-30`; `.gitignore`; `.github/copilot-instructions.md:33-37`; `node_modules/@testing-library/jest-dom/types/vitest.d.ts`; `ls node_modules/@types` (no `jest*`); `git log -3`, `git status` (clean at `3349d27`). Not checked (outside the repository): the quarry's `STATUS.md` and `package.json`, taken from the brief's excerpts; the registry metadata of `jest-axe` 11 (step 2 verifies it from the installed package). The ambient advisor tool timed out during this consultation; the ruling is mine alone.
`````

## Exact next step (one item ID)

P3.2 (⚑: the listbox and row accessibility decision, then the primitives). Consult before writing code. The
tokens the primitives rely on are listed in `src/test/lint/webview-tokens.test.ts`; a primitive that needs
another adds the token there and in `tokens.css`.

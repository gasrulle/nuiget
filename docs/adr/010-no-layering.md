# ADR-010: No layering: a rebuild or refactor replaces rules, never overrides them

Status: accepted · Date: 2026-10-23

## Context

The UX overhaul restyles both webviews. The owner's brief states the constraint in one line: the overhaul must not
patch a patched design. The research of 2026-10-23 (`docs/research/2026-10-23-ux-research.md`, §6) measured how far
the 2.0 stylesheets already are from that:

- Spacing and colour are fully tokenised, and the existing lints in `src/test/lint/` (colour literals, `!important`,
  `px` font sizes, `px`/`em`/`rem` spacing, literal durations, foreign class prefixes, small targets) are green. They
  saw none of the defects the owner found (V1 to V5); a lexical lint catches none of them, only geometry does.
- Seventeen rules outside `primitives.css` set properties on nine primitive classes, and none of them only places
  the primitive: all are overrides, most of them added by the parity phase P9 (finding V6). The P9 items corrected
  each symptom with a more specific selector where it showed; V2, for example, is `.nuiget-installed > .nuiget-toolbar`
  overriding the toolbar's end padding.
- Six candidate lint rules hit exactly 116 places at `e4d6e97`: `pxLength` 58 (34 of them 1 px lines), `specificity`
  41 (selectors above (0,2,0), up to (0,5,0)), `override` 16 (cross-file, 12 from P9), `duplicateSelector` 1,
  `deadRule` 0, `disableComment` 0. The list is a pure function of the stylesheets.
- The component audit gives each of 46 units a verdict: one rebuild (the Updates tab), 32 refactors, 13 keeps, plus
  six missing primitives (Button, Select, Checkbox, TextField, PropertyList, GroupCaption). Controls without a
  primitive are styled by bare classes in feature code (20 raw `nuiget-button`, 4 raw selects, 6 raw check boxes).
- The L2 guard (`scripts/hooks/guard.mjs`) denies deleting or renaming any `*.test.ts(x)` file for every session;
  its message ("unless the plan item names them") has no code behind it.

## Decision

1. **Verdicts.** Every primitive and feature carries one verdict from the component audit: keep, refactor or rebuild.
   The UX plan records it on the item that touches the unit. A changed verdict is a `design-advisor` ruling pasted
   into the directory's `STATUS.md` before the work starts.
2. **Rebuild.** A unit marked rebuild is rewritten against the Design System (`docs/design/design-system.md` and the
   unit's component spec) together with its tests, by one of two mechanisms:
   - *Rewrite in place* (the default): the rebuilt unit keeps its paths (`Row.tsx`, `Row.test.tsx`), and the item
     names the test titles it replaces.
   - *Test retirement*: the guard admits a gitignored sentinel `.claude/.test-retire` whose lines are the exact test
     paths the current item names. While it exists, deleting or renaming exactly those paths is allowed and
     `git commit` is denied (the pattern of the contract sentinel). The item creates it after the `design-advisor`
     ruling is pasted and deletes it before the commit. The hook change and its `guard.test.mjs` cases are a P0
     item of the UX plan.

   A rebuild migrates every caller and deletes the old rules in the same item. No `v2` or `legacy` directory and no
   second generation of a primitive exists on the tree between items.
3. **Refactor.** A unit marked refactor has its rules replaced: the new declaration takes the place of the old one.
   A more specific selector, a later rule or a feature-stylesheet rule that beats a primitive's rule is never the fix.
4. **Single owner.** Each property of a `.nuiget-<primitive>` class, or of an element inside it, is declared in
   exactly one rule across `src/webview/**/*.css`. A variant is a modifier class or a data attribute that the
   primitive declares in `primitives.css` and selects through its props, or a token re-valued in `tokens.css` (the
   look attributes of ADR-011 work this way). A feature stylesheet sets only a primitive's placement as a child of
   the feature's layout: `grid-*`, `flex`, `order`, `align-self`, `justify-self` and `margin-*`.
5. **Values.** Every visual value (length, colour, duration, easing, radius, weight, z-index) comes from
   `tokens.css`. No `!important`. No inline style: the only `style` prop under `src/webview/**/*.tsx` is a
   `cssVars({ '--nuiget-…': value })` call, the Content Security Policy bridge of ADR-006. No component-local magic
   number in CSS or in a TSX constant that sizes or places something; the one exception is `Listbox`'s `ROW_HEIGHT`,
   which repeats the row-height tokens for the virtualizer and is held equal to them by `webview-tokens.test.ts`. A
   1 px line is a token, not a literal.
6. **Selectors.** Specificity stays at or below (0,2,0); no selector is declared in more than one stylesheet except
   `body` and `:root`; no `stylelint-disable` or `eslint-disable` comment under `src/webview/**`.
7. **The gate.** Decisions 3 to 6 are Vitest lints in `src/test/lint/`, extending `webview-stylesheets.test.ts` and its
   siblings; no parallel stylelint setup. Rules: `pxLength` (a `px`/`em`/`rem` length outside `tokens.css` in a width,
   height, minimum or maximum size, inset, border, outline, radius or line height), `duplicateSelector`,
   `specificity`, `override` (the single-owner rule of Decision 4), `deadRule`, `disableComment`, and a TSX rule for
   Decision 5's `style` prop. The gate runs in CI against the tracked baseline
   `src/test/lint/__fixtures__/css-audit-baseline.json`: the 116 entries (file, rule, selector) of the code audit at
   `e4d6e97` (sha256 `4417610d…` of the research copy). It fails on any hit outside the baseline and on any entry
   whose file's rebuild or refactor item is `done`. The baseline only shrinks; a wish to add an entry is a design
   stop-and-ask. Negative control: with the baseline emptied, the new rules fail in exactly the 116 places and
   nowhere else, and the existing rules stay green.
8. **Done.** A primitive or screen item is done only when the files it touched have no baseline entry left.
9. **Scope of the lint.** It checks token *usage*, not token *choice*. A spacing defect built from valid tokens (V4,
   V5) is caught by the measurement harness (gap membership, symmetric insets), not here.

## Consequences

For implementers:

- A visual defect is fixed in the rule that owns the property. When the owner is a primitive, the fix lands in
  `primitives.css` even if one screen shows the defect, and the item re-captures every Tier A state that uses the
  primitive.
- A feature that needs a primitive to look different asks for a variant (a prop and a modifier the primitive owns).
  A diff to an exported `*Props` type under `src/webview/shared/primitives/` is a design stop-and-ask.
- The six missing primitives replace the bare control classes; feature stylesheets stop styling controls.
- The per-surface patches in `main.css` and `sidebar.css` (17 rules on 9 primitive classes) are deleted once the
  variants that replace them exist.
- `tokens.css` grows (a line-width token, font weights, the missing colour roles of ADR-011). Each token added,
  renamed or re-valued is a design stop-and-ask, so a new value is chosen once, against the Design System.
- The README typography block of `main.css` follows the same rules when its item comes; it is ported as a block and
  keeps the Markdown preview's scale.

For tests:

- Tests keep roles and test ids as their contract (443 `*ByRole` and 440 `*ByTestId` queries today); the 94 class
  selectors and the 26 ExTester class reads in 8 files are the coupling a rebuild migrates in its own item.
- The 18 computed-style reads that pin rule text, and the lines of `webview-stylesheets.test.ts` that pin hairline
  literals, break under the rewrite; the item rewrites them in place and names them. No test is weakened, skipped or
  deleted outside the retirement mechanism, and the guard enforces both.
- The `data-testid` hooks of the interaction model's §8 survive a rebuild: a rebuilt `Row` still renders
  `package-row-<id>` and `row-action-<name>`.
- The lint gate has planted-defect tests for each rule, as the existing lints do, so a rule with no hit on the tree
  (`deadRule`, `disableComment`) still proves it can fail.

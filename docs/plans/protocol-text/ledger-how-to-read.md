<!--
Target: docs/plans/findings-ledger.md, section "## How to read and maintain it". Added in the same commit as the
research report (UX brief §2: "Add the new letters to the ledger's 'How to read and maintain it' list in the same
commit"). The first bullet below replaces the existing "**Ids**" bullet; the others are appended after the bullet
"A new finding gets the next free `N` id, a row in section 1 and an entry in section 4."
-->

```markdown
- **Ids** (plan decision D12): `S` security, `Y` operations and sync, `F` project model, `M` multi-root,
  `P` performance, `U` user experience, `D` architecture smells, `T` tests and build; `N` new findings;
  `V` visual findings (V1 to V5 from the owner's screenshot reviews, V6 onwards from the UX research);
  `C-<group>-n` defects in the paused 2.0 code; and the letters of the UX research of 2026-10-23: `X` UX and
  interaction, `A` accessibility, `G` feature gaps, `W` user signal, `H` measurement, harness and tooling. Ids are
  never reused or renumbered.
- **The UX research's findings live in the research report.** The rows of `X1`–`X82`, `V6`–`V71`, `A1`–`A21`,
  `G1`–`G21`, `W1`–`W14` and `H1`–`H95` (id, severity, finding, evidence, verification) are Appendix A of
  `docs/research/2026-10-23-ux-research.md`; that appendix is their section, as section 4 is for `N`. The report is a
  dated snapshot and is not edited: the UX plan's ledger appendix and its tracker record which item schedules or
  closes each of these findings. `V1` to `V5` keep their rows in section 4 below.
- **A finding made while executing the UX plan** gets the next free id of its letter (after the last one in
  Appendix A) and a row in section 4 under a heading for that letter; a finding outside the letters' scope still gets
  the next free `N` id.
- **Letters that look alike.** `W`, `N`, `C` and `X` alone are the change codes of section 1's correction column
  and of section 3 (widened, narrowed, confirmed with precision edits, closed by a design decision), not ids; an id
  always has a number (`X3`, `W3`). `A` ids are findings; "Appendix A" is a section of the plans
  and of the research report. Rule ids of the Design System (`DS-*`), the measurement rules (`MS-*`), the listing
  rules (`LST-*`) and the regression matrix's `R<n>` are not findings.
```

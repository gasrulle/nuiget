# Artifacts of the UX initiative

Every claude.ai artifact the initiative produced, so a replacement planning session resumes from the files and never
re-asks a recorded decision. The committed files under `docs/research/`, `docs/design/` and `docs/plans/` are the
reference; the artifacts are the owner's viewing copies. The Design System artifact is kept current by the rule at the end
of this file; the other two are records of their date.

| Date | Artifact | URL | Committed counterpart |
|---|---|---|---|
| 2026-10-23 | nUIget UX Research (report, private page) | https://claude.ai/artifact/MTypaXSUY5Toervj1aAQgS | `docs/research/2026-10-23-ux-research.md` |
| 2026-10-23 | nUIget Design System (Design System type; viewing copy) | https://claude.ai/artifact/JbL87uhkYTL3gEsREDxe19 | `docs/design/design-system.md`, `docs/design/tokens.json` |
| 2026-11-18 | nUIget Design System refreshed (version 16; 87 rules, 179 tokens) | https://claude.ai/artifact/JbL87uhkYTL3gEsREDxe19 | snapshot of `labs/ux` @ fc801f11 (the two files above at that commit; the dialog's own line height, links and the empty slot's focus ring, the motion measurements) |
| 2026-11-17 | nUIget Design System refreshed (version 14; 87 rules, 179 tokens) | https://claude.ai/artifact/JbL87uhkYTL3gEsREDxe19 | snapshot of `labs/ux` @ 7d12d3a6 (the two files above at that commit; the fourth look attribute, the list's page, type-ahead and search-box keys, the sidebar sash hit area) |
| 2026-11-16 | nUIget Design System refreshed (version 11; 87 rules, 179 tokens) | https://claude.ai/artifact/JbL87uhkYTL3gEsREDxe19 | snapshot of `labs/ux` @ f95c8e7 (the two files above at that commit) |
| 2026-10-23 | nUIget Direction Round 1 (Design canvas: the 2.0 capture at 1:1 beside compositions A Extensions view, B Settings editor, C Tree view) | https://claude.ai/artifact/EZHTXiNUyzHoF2GQbQRdrB | `docs/design/artboards/round1/` (the `.dc.html` sources and tokens, committed with the plan) |

## Keeping the Design System artifact current

The Design System artifact is a snapshot: it shows `docs/design/design-system.md` and `docs/design/tokens.json` as they
were at the commit its newest row names, never the working tree. Nothing refreshes it by itself (it lagged 59 commits
before 2026-11-16). The rule, for the UX plan and for every later change:

- A change to `docs/design/design-system.md` or `docs/design/tokens.json` is finished only when the artifact has been
  refreshed from a commit that contains it, or a row above says which commit the artifact still mirrors. During the UX
  plan the planning session refreshes it at every phase boundary (`docs/plans/RUN-ux.md` §6 step 4) and a worker
  publishes nothing. After the plan the rule stays: for every later change, in any initiative, plan or one-off on any
  branch, the session that commits the change, or the planning session that verifies its report, refreshes the artifact
  before the work is called done, or reports the lag to the owner with the commit it still mirrors. The rule ends only when the owner retires the artifact in this file.
- A refresh: pin the pushed tip of the branch (`git rev-parse origin/labs/ux`) and read every source from that commit
  (`git show`), never from the working tree; read the artifact's `SKILL.md` and its index `project/design-system.json`
  first and revise file by file under `project/`, never a rebuild: `project/README.md` against §1 to §11 of the design
  system, the component pages against §7 and §8, every sentence traceable to a rule row or a table at that commit;
  write `project/tokens.json` with `node docs/design/tools/artifact-tokens.mjs docs/design/tokens.json <current
  project/tokens.json> <out>` (the colour, spacing, radius and size families from the tokens file; the `type` styles are
  kept from the current copy and edited against §5); publish once with the index last, its `lastChange.note` reading
  "refreshed from labs/ux @ <sha>"; read the published files back and compare their sha256 with the local ones; then add
  a row above with the date, the version and the commit.

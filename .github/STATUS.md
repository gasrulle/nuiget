# STATUS — .github (agent resources and repo-level documents)   commit d41ff61 (parent of the P9.13 commit)   2026-10-17T08:10:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/STATUS.md`, `ARCHITECTURE.md`,
`CHANGELOG.md`, `README.md`, `docs/plans/STATUS.md`, `docs/plans/parity-audit-2026-10-16.md`,
`docs/ux/interaction-model.md`; new `docs/images/nuiget-browse-details.png`, `docs/images/nuiget-installed-readme.png`,
`docs/images/nuiget-updates.png`

Item: **P9.13** — Docs: parity audit file, interaction model, CHANGELOG, ARCHITECTURE, README screenshots. This note
replaces the P8.3 note (history at `b63329a`).

## Verified by running

```text
baseline (d41ff61)   → npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npx vitest run: 135 files,
                       2011 passed, 9 skipped
npx tsc --noEmit     → exit 0
npm run check-types  → exit 0
npx eslint src       → exit 0
npm run lint         → exit 0
npm test             → exit 0; Test Files 135 passed (135); Tests 2011 passed | 9 skipped (2020)
npm run bench        → exit 0; Test Files 14 passed (14); Tests 75 passed (75)
npm run docs:check   → exit 0; docs:protocol:check — docs/protocol.md is up to date.
npm run package:vsix, npm run check:vsix, node esbuild.mjs --production --analyze → SKIPPED: no file under src/,
                       no build input and no packaging file changed (documents and three PNGs under docs/, which
                       .vscodeignore excludes with docs/**)
npm run test:ui      → SKIPPED: no product code changed; CI runs the UI job on the push
```

## Done (tested)

- `docs/plans/parity-audit-2026-10-16.md`: `## Closure status` after the intro, one row per gap id (88): 64 closed
  with the SHAs that cite the id in their message, 2 met by the tree (TF2, TF4, per the P9.12 note), 3 not a gap
  (MH9 documented, SB12 by D15, TF5 refuted), 2 partly (MI7: the tab count closed, no count on the row; DP3: the
  residue in `src/core/feeds/STATUS.md`), 17 open (MI10, MI11, MU8, MB3, MB13, MB16-MB19, SB2, SB7, SB9, SB10, SB13,
  SB14, DP8, DP10), and a line on the critic's missing items. Checked in the tree, not only in the commits: MU5
  (`MainShell.tsx:226-227,279`, the revalidation bar covers Updates), SB2 (`SidebarView.tsx:177,198`), SB13
  (`UpdatesSection.test.tsx:157`), DP10 (`StoreProvider.tsx:26`, `installed.tsx:77`), SB14 (`SidebarView.tsx:108`),
  MB17 (`nuspec.ts:43-44` only). The 88 audit entries are not edited.
- `docs/ux/interaction-model.md` §1: the main panel's two-line card (66 px, 32 px icon, name and badges over version,
  authors and Verified, Browse downloads and description, no description on Installed and Updates, 3 px accent,
  `id version` tooltip) and the sidebar's name-first compact rows; §4 Partial / failed op: warning toast with Show
  output, the output channel revealed on failure, an information toast on success, bulk progress
  (`src/host/feedback.ts:97-104,153`). §2, §3, §5, §7 and §8 were already current from P9.6-P9.12; every `data-testid`
  an ExTester, e2e or harness test reads is in §8.
- `CHANGELOG.md` `[Unreleased]` `### Changed`: one headline for what is not back from 1.x (recent searches, Collapse all
  and Expand all, hover prefetch, ArrowLeft/ArrowRight between Details and README). The restored controls were listed
  by P9.0-P9.12; recent searches also stays in 2.0.0 `### Breaking changes`. The 2.0.0 section is not touched; folding
  `[Unreleased]` into it is P10.1.
- `ARCHITECTURE.md` (Shared tooling, CI table, row `UI`): the `ui-screenshots` artifact with the named states of
  `ScreenshotState` and the job failing for a missing state. The webview sections already describe the P9 rows,
  `packageIcon`, `feedback.ts`, the ErrorBoundary, `useInstallAction`, `nextVersion` and `TransitiveDetails`.

## Done (untested)

- `README.md`: the 1.x `nuiget.gif` replaced by three PNGs copied unchanged from CI run 39001101052 (push of
  `d41ff61`, artifact `ui-screenshots`, folder `20261017T040717`): `main-browse-details.png` →
  `docs/images/nuiget-browse-details.png`, `main-installed-single.png` → `nuiget-installed-readme.png`,
  `main-updates.png` → `nuiget-updates.png`; each opened with the Read tool before copying (no test toast except
  "Restored 1 project." on the Updates image; `sidebar-sections.png` was left out for its three toasts). The links keep
  the absolute raw URL on `main`, as the gif did, so GitHub and the Marketplace show them once PR #18 merges; no gate
  renders a README. `docs/images/nuiget.gif` is kept, unreferenced: deleting it is the owner's call.

viewed: main-browse-details.png: Browse cards with icons, downloads, authors, Verified and description; details with the 1.x facts and collapsed dependency groups
viewed: main-installed-single.png: two Installed cards under DIRECT PACKAGES (2) with icon, version and authors; README tab rendered
viewed: main-updates.png: Updates cards with `old → new` (new marked), Update all (2), empty details pane
viewed: sidebar-sections.png: compact sidebar rows; three operation toasts in the corner (not used)
viewed: sidebar-narrow-200px.png: at 200 px the names keep their start and the versions shorten (not used)

## Not started

- Nothing of P9.13. Next: the P9 gate and phase review (RUN.md §6), then the stop for the owner's screenshot review.

## Deviations from contract/ADR (file:line each)

- None. No file under `src/`, `docs/adr/` or `src/protocol/` changed.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-17, P9.13, ambient advisor before the edits ("how to keep the audit current, what the interaction model,
CHANGELOG, ARCHITECTURE and README still need"). Answer, verbatim:

`````text
You've oriented enough; the item is mostly a reconciliation job because each P9 item already did its own docs duties. Work in this order:

**1. Parity audit — don't edit 92 entries inline.** Add one closure table near the top (gap id → status → evidence) and leave the entries as the audit record. Statuses you can defend from what you already have: `closed` with the SHA(s) from your map (subject or body cite); `partly` for DP3 (read `src/core/feeds/STATUS.md` for what "in part" left open); `not a gap` for TF5 (refuted by all three verifiers), MH9 (documented in 2.0.0 Breaking), MI7/DP8's severity-colour half (audit line 656 calls it deliberate; MI7's tab-badge half closed by 3e6a622); `met by tree` for TF2/TF4 per the P9.12 note. Everything else uncited defaults to `open — deferred to 2.0.1`, which the adopted phase shape already sanctions — no owner call needed. Verify in code only the few P9 may have closed incidentally without citing them: MU5 (3bfc748's revalidation bar), SB13 (spinner vs `0`), DP10, MB17. Don't spend a fan-out on the rest.

**2. Interaction model.** §1's density cell still says comfortable rows have "description" — that contradicts D14 for Installed/Updates; rewrite it as the two-line card (icon · name+badges / version · authors+Verified; description Browse-only). The header-controls sentence is already there. Check §3 for the "Multi Install only under All Projects" claim P9.8 overturned (the plan row names §4/§7/§8, but that sentence is stale too). §7 needs the P9.8 field list and collapsed dependency groups; §4 the transitive details origin. §8: never add a hook the product doesn't render — `interaction-model-testids.test.ts` runs inside `npm test` and will tell you.

**3. CHANGELOG — mostly done, and one trap.** `[Unreleased] ### Changed` already lists every restored control; recent searches is already in 2.0.0's Breaking line. Do **not** fold `[Unreleased]` into `[2.0.0]`: P10.1 owns "CHANGELOG 2.0.0 final (P9 entries; date)". Verify, don't duplicate. One combined headline for what stays absent in 2.0.0 (Collapse/Expand all, ArrowLeft/Right tab switch, hover prefetch) is a judgment call — if you add it, one line, not one per gap.

**4. ARCHITECTURE.** Grep the 2.0 section for P9 artifacts first (`packageIcon`, `feedback.ts`, `ErrorBoundary`/`ui/reportError`, `useInstallAction`, `nextVersion`, `TransitiveDetails`, `metadataResolver` size) and fill only the holes. The module map must keep a row per 2.0 module (`docs:check`).

**5. README.** Copy 2–3 PNGs into `docs/images/` under stable names (the artifact dir is timestamped), keep the existing absolute-raw-URL-on-`main` pattern so Marketplace rendering matches how the gif works today (broken until PR #18 merges — same as now; say so in the note), and record run `39001101052` as provenance. Look at each candidate before committing it: `sidebar-sections.png` has three test toasts in the corner. Also grep README for `Ctrl+Enter`, `Update all`, `Multi Install`, keyboard sections — P9.6/P9.8/P9.10 changed documented behaviour and `docs:check` checks names, not prose. Deleting `nuiget.gif` is optional; if you keep it, say why.

**6. Handoff and tracker.** The directory `STATUS.md` for an item with no `src/` directory is `.github/STATUS.md` (P0.2 row). Set P9.13 `in-progress` → `done` in the same commit. Read `.github/instructions/markdown.instructions.md` before editing (the rule is loaded, you haven't read it).

**7. Gates.** Full ritual even for docs: tsc, check-types, eslint, `npm test` (carries the docs-drift and testid lints), `npm run bench`, `npm run docs:check`, `npm run lint`; `package:vsix`/`check:vsix` as literal `SKIPPED:` with reason. Run `docs:check` after each doc batch, not once at the end.

**8. After green CI this closes P9 — sequencing matters.** Run the P9 gate line, launch `architecture-advisor` with `PHASE REVIEW P9` over `git log labs/2.0-P8-done..HEAD` in the background, paste under `## Phase gates`, land any blocking fix as `P9.fix-n`, push, wait green — then **stop** (RUN.md §7) and report the run id and `ui-screenshots`. Do not start P10.1. The P9 gate text includes *the owner's review*, so hold the `labs/2.0-P9-done` tag until `P9 approved` and say that in the owner-action line.
`````

Acted on: 1 (with DP8 left `open`, not `not a gap`, because its count half is still missing; MI7 `partly` for the same
reason), 2 (§3 and §7 were already current), 3 (one headline), 4, 5, 6, 7; 8 follows.

## Exact next step (one item ID)

P9 gate (RUN.md §6), then stop for the owner's review of `ui-screenshots`; next open item after approval: P10.1.

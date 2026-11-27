# STATUS — src/webview/shared/store   UX-P5.3a   commit 830471b3 (base; the item's commit written on it)   2026-11-27T08:21:41+01:00

git status --short (at writing): `src/webview/shared/store/allProjects.tsx`, `src/webview/shared/store/allProjects.test.tsx`,
`ARCHITECTURE.md`, `docs/plans/regression-matrix.md`, `docs/plans/STATUS-ux.md`, this note.

Item: **UX-P5.3a** — F3: Consolidate model (G5). "Version drift across projects under All Projects (central rows out, overrides in),
through `ops/bulkUpdateAllProjects` with a version." Not ⚑; no advisor brief. G5 is a research finding id whose text is not in the
tree, so the plan's row is the spec.

## Verified by running

Baseline on 830471b3 (UX-P5.fix-10's docs commit, push run 45955071708 green): tsc 0, check-types 0, eslint 0, `npx vitest run` 184 files /
2932 passed / 9 skipped.

```text
npx tsc --noEmit → exit 0; npm run check-types → exit 0; npx eslint src → exit 0; npm run lint → exit 0
npx vitest run src/webview/shared/store/allProjects.test.tsx → Tests 24 passed (24)
npx vitest run --project frontend src/webview/shared/store → Test Files 13 passed (13); Tests 179 passed (179)
node esbuild.mjs --production --analyze → extension.js 303263 / 326720; webview.js 614777 / 614785; sidebar.js 373223 / 374532
  (byte-identical: no view calls the two functions yet, so the bundles tree-shake them; the cost lands in UX-P5.3b)
npm test → Test Files 184 passed (184); Tests 2938 passed | 9 skipped (2947); [axe-coverage] 77 files, 42 rules passed somewhere, 0 missing
npm run bench → Test Files 15 passed (15); Tests 78 passed (78)
npm run package:vsix → DONE  Packaged: nuiget-v2.0.0.vsix (17 files, 628.45 KB); npm run check:vsix → check:vsix: OK
npm run docs:check → exit 0; npm run check:matrix → 365 rows: 360 covered, 2 gap, 3 manual-credentials; 0 finding(s)
```

## Visual evidence (UI items)

None: not a UI item (the view is UX-P5.3b).

## Done (tested)

None yet (the push's CI run pends).

## Done (untested)

`allProjects.tsx`: `DriftVersion`, `DriftHeld`, `DriftEntry`, `VersionDrift`; `versionDrift(state)` (the packages at least two projects
reference at at least two versions, by id; a version key without case or build metadata; the resolved version before the version as
specified; `central` rows, SDK references and rows `whyNotUpdatable` refuses held with their reason; `central-override` joins; `unread`
and `complete` for an incomplete reading) and `consolidationUpdates(entry, version, sourceUrl?)` (the `ops/bulkUpdateAllProjects`
payload). `allProjects.test.tsx`: six cases, one through `useOpsActions().run` on `createFakeHost`. ARCHITECTURE's `allProjects`
bullet; matrix R365. No CHANGELOG entry: nothing a user can notice until UX-P5.3b.

## Not started

The closing (this item's CI run).

## Deviations from contract/ADR/decision (file:line each)

None from a contract. For the planning session:
- `allProjects.tsx` imports `isCentral` and `whyNotUpdatable` from `src/webview/shared/installed/rules.ts` (the one update rule), which
  imports `store/ops`, which imports `store/allProjects`: an import cycle of function declarations only, called at run time, never at
  module evaluation; no lint forbids it. Planning may move the two functions into `rules.ts` if it prefers no cycle.
- Two versions are equal by a key (lower case, build metadata dropped), not a NuGet comparer: the webview has none and cannot import
  core's. `1.0` and `1.0.0` read as two versions when a provisional list carries only the version as specified; the resolved version
  of an authoritative list is NuGet's normalized form. UX-P5.3b decides the order of the versions and the default target (the model keeps
  the projects' order); if it needs a semantic order, the architecture-advisor names where the one comparer lives.
- Webview headroom stays 8 B; UX-P5.3b's view brings the model into the bundle and will cross the ceiling (the P5 budget procedure).

## Advisor decisions (date, item, question, answer verbatim)

None: the item is not ⚑ and raised no stop-and-ask. The host applies the given version verbatim (`src/core/ops/PackageWorkflows.ts:147-162`,
`src/host/handlers.ts:127-136`), so a lower target needs no core change.

## Exact next step (one item ID)

UX-P5.3a: push, watch the run green, then the tracker row `done`. Next row in table order: P5.3b (⚑-design).

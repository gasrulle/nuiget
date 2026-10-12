# STATUS — .github (agent resources and repo-level items)   commit 3a6f919 (parent of the P0.12 commit)   2026-10-12T11:50:00Z

git status --short: ` M ARCHITECTURE.md`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md`, ` M .github/STATUS.md`
(all belong to the P0.12 commit)

Item: **P0.12 ARCHITECTURE.md coexistence**. This file is the handoff note for plan items without a `src/`
directory of their own. The P0.11 note it replaces is in commit `3a6f919`; P0.11's CI run 38230778792 was green
on all eight jobs.

## Verified by running

```text
baseline npx tsc --noEmit   → exit 0, no output
baseline npx eslint src     → exit 0, no output
baseline npx vitest run     → Test Files 44 passed (44) · Tests 1591 passed (1591)
grep -c '(1.x — removed at P8)' ARCHITECTURE.md → 20                                              (item gate)
grep -c '^## ' ARCHITECTURE.md → 22 = 20 marked legacy H2s + `## 2.0 Architecture (in progress)` +
                              `## Repository Assistance Resources`
relative links in the 2.0 section → every target exists
anchors                     → #shared-tooling, #coexistence-of-1x-and-20 and #background-source-health-monitor
                              each resolve to a heading in the file
npx tsc --noEmit            → exit 0, no output
npx eslint src              → exit 0, no output
npm test                    → Test Files 44 passed (44) · Tests 1591 passed (1591)
npm run bench               → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npm run package:vsix        → SKIPPED: documentation only (plan §2.2 step 5)
npm run test:ui             → SKIPPED: documentation only
```

Each drift correction was checked against the code before the document was changed:

```text
watcher debounce            → src/webview/NuGetSidebarPanel.ts:151 `_scheduleWatcherRefresh(2000)`, :376 `(1000)`
refresh and the HTTP cache  → NuGetPanel.ts:763 and NuGetSidebarPanel.ts:633 call `clearNuGetHttpCacheBackground()`
refreshSidebar echo         → NuGetSidebarPanel.ts:640 `checkUpdatesInBackground(true)`; :169 default
                              `skipMainPanelNotify = false`; :313-314 then calls `_notifyMainPanel()`
sidebar CSP                 → NuGetSidebarPanel.ts:1436 `img-src ${webview.cspSource};`
topologicalSortByDependency → defined in src/services/NuGetUtils.ts
Browse tab                  → no BrowseTab component; browse results render in App.tsx
details panel               → no `renderPackageDetailsPanel`; `MemoizedPackageDetailsPanel` is used
line counts (wc -l)         → App.tsx 3220, InstalledTab.tsx 1616, UpdatesTab.tsx 775, PackageDetailsPanel.tsx 548,
                              NuGetService.ts 1286, NuGetPackageService.ts 2474, NuGetProjectService.ts 636
recent searches             → App.tsx has them, SidebarApp.tsx has none; durable copy in workspaceState key
                              `nuget.recentSearches`; limit setting default 5, maximum 10
webview message typing      → App.tsx:362 and SidebarApp.tsx:855 read untyped `event.data`
```

## Done (tested)

- `## 2.0 Architecture (in progress)` at the top: status, decision table (plan, tracker, ADR-000 to 008, the
  SDK probe supplement, UX model), module map placeholder, coexistence table, and a shared-tooling subsection
  (type-checking, lint, unit tests, bundle ceilings, packaging, the eight-job CI pipeline).
- Twenty legacy H2 headings carry the 1.x marker.
- Eleven drift corrections from the audit plan's Appendix A, listed above.
- Three statements that P0 items had made untrue now point at the shared-tooling subsection or are corrected:
  the CI/CD Pipeline subsection, the Node declarations sentence and the esbuild bullets in Build System, and
  the packaging pipeline block.

## Done (untested)

- Rendered appearance on GitHub; only link targets and anchors were checked.

## Not started

- P0.13: `docs/plans/findings-ledger.md`.

## Deviations from contract/ADR (file:line each)

- `## Repository Assistance Resources` is not marked as 1.x: agent resources are not removed at P8. It gained
  one paragraph about the Claude Code pointers, the `architecture-advisor` agent and the guard hook.
- The introductory note describes the marker in words instead of quoting it, so that the gate's `grep -c`
  counts headings only.
- Line counts in the File Structure section were updated to today's values rather than removed. They will
  drift again; the section is deleted at P8 and P7.5 plans a drift check that ignores line counts.
- The legacy `Testing` and `Build System` sections were edited where P0 items had made them wrong, although
  plan §2.2 step 6 confines ARCHITECTURE.md edits to the 2.0 section for later items. This item is the one that
  owns the document's structure, and the P0.8 advisor answer routed those corrections here.
- Not corrected because it is not this item's file: `.github/copilot-instructions.md` 1.x gotcha rows that give
  the watcher debounce as about 5 s. Candidate for P0.13's ledger; the row for P0.12 in the tracker says so.

## Advisor decisions (date, item, question, answer verbatim)

No stop-and-ask trigger fired and the item is not ⚑, so no consultation took place for this item. The
instruction to rewrite the CI/CD Pipeline subsection here comes from the first P0.8 answer (commit `98bcdd1`,
`.github/STATUS.md` history).

## Exact next step (one item ID)

P0.13

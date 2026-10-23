# User signal: nUIget UX overhaul research (dimension `user-signal`, 2026-10-22)

Repository: `/Users/mattias/github/nuiget`, branch `main` at `e4d6e97`. Read-only. Nothing was written under the
repository; the scripts and intermediate files are in the scratchpad (paths in §9).

## 0. Headline

1. **There is almost no external user signal, and none at all for 2.0.** In about eight months there is one external
   GitHub issue (#11), 0 Marketplace reviews, 0 Marketplace Q&A questions, Discussions turned off, 0 stars, 83
   Marketplace installs and trending at 0. The Marketplace still serves 1.18.9, so no outside user has seen 2.0. Every
   other signal comes from the owner: CHANGELOG entries, commits, the PR #2 prompt, the parity audit and the V rows.
   The plan cannot be driven by user feedback. Its acceptance evidence is the owner's review plus a measurement harness
   that uses V1–V5 as the negative control. (§2, §3, finding F1.)
2. **The owner's reviews narrowed in three steps: content, then layout, then spacing and alignment.** The first two
   rounds produced fixes with mechanical gates. Those gates measured *horizontal* edges only: the right edge within
   8 px (P9.fix-4) and the left edges within ±1 px (P9.fix-6), plus a token-provenance lint (`pxSpacing`). The owner's
   next review still found the same toolbar misaligned (V2), uneven vertical margins (V4) and "no single scale" (V5).
   A harness that checks horizontal edges and which tokens are used does not measure what the owner perceives. (§7,
   F4.)
3. **In 1.x, defects clustered in three places.** The sidebar appears in 61 of 199 Fixed headlines. Keeping the two
   surfaces in sync recurs in five versions, and stuck spinners in seven. "All Projects" has 22 Fixed headlines, 15 of
   them in 1.17.0 alone, and was represented three different ways. Seven information-architecture decisions went
   through three or more states: the Activity Bar badge, what Refresh clears, Browse as a tab, recent searches,
   notifications, the All Projects control and the restore toggle. Two more, Collapse/Expand all and hover prefetch,
   were added in 1.x, dropped in 2.0, and are still open parity rows. The plan should decide each of the nine on
   purpose rather than inherit 1.18.9's last state. (§5, F6–F8.)
4. **The one external issue was about whether the Updates list can be trusted.** It reported unlisted versions offered
   as updates. The reporter also called the package "deprecated", and neither 1.x nor 2.0 shows deprecation, although
   the registration API carries it. (§3, F2.)
5. **Issue intake is stale.** 21 of the 22 distinct source paths that the issue and PR templates route to were deleted
   in 1.x code. The UI-area options name 1.x surfaces, and blank issues are disabled, so this stale form is the only way
   to file an issue. (§3.3, F3.)

## 1. Method and sources

| # | Source | Command or URL | Reached |
|---|---|---|---|
| 1 | GitHub issues (all states) | `gh issue list --repo gasrulle/nuiget --state all --limit 200 --json number,title,state,labels,createdAt,closedAt,author,body,comments` | yes: 1 issue |
| 2 | GitHub PRs (all states) | `gh pr list --repo gasrulle/nuiget --state all --limit 100 --json …` | yes: 31 PRs |
| 3 | GitHub Discussions | `gh repo view gasrulle/nuiget --json hasDiscussionsEnabled,…` | yes: `hasDiscussionsEnabled: false` (no GraphQL query needed) |
| 4 | GitHub traffic | `gh api repos/gasrulle/nuiget/traffic/{views,clones,popular/referrers,popular/paths}` | yes |
| 5 | Marketplace listing | `npx --no-install vsce show Gasrulle.nuiget` and `--json` | yes |
| 6 | Marketplace gallery API | `curl -X POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery` (filterType 7, flags 914) | yes |
| 7 | Marketplace reviews API | `curl https://marketplace.visualstudio.com/_apis/public/gallery/publishers/Gasrulle/extensions/nuiget/reviews?count=100` | yes: `{"reviews":[],"totalReviewCount":0}` |
| 8 | Marketplace Q&A API | `curl …/publishers/Gasrulle/extensions/nuiget/qna?count=100&page=1&pageSize=100` | yes: `{"questions":[],"hasMoreQuestions":false}` |
| 9 | Marketplace Q&A web page | WebFetch `https://marketplace.visualstudio.com/items?itemName=Gasrulle.nuiget&ssr=false#qna` | page loads, but the Q&A and reviews are client-rendered and absent from the fetched text; covered by rows 7–8 |
| 10 | Open VSX | `curl https://open-vsx.org/api/Gasrulle/nuiget` | yes: `Extension not found: Gasrulle.nuiget` (not listed there) |
| 11 | Wayback Machine | `curl 'https://web.archive.org/cdx/search/cdx?url=marketplace.visualstudio.com/items%3FitemName%3DGasrulle.nuiget…'` | `[]` (no captures); a second wildcard query timed out |
| 12 | Web mentions | WebSearch "nUIget VS Code NuGet package manager extension Gasrulle" | no hit names nUIget |
| 13 | CHANGELOG.md | two scripted passes (§5.1) plus reading by hand of lines 137–920 | yes |
| 14 | git log of 1.x | `git log --oneline 0457c75 --reverse \| wc -l` → 117; `git log --format='%s' 0457c75 \| grep -ci fix` → 24 | yes |
| 15 | Owner's hands-on findings | `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:321-341`, `docs/plans/parity-audit-2026-10-16.md`, `docs/plans/STATUS.md:136-141,1127-1131`, `docs/plans/findings-ledger.md:188-192,461-473` | yes |
| 16 | NuGet registration API docs | WebFetch `https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource` | yes |

Evidence rule: every row in the tables below cites a `path:line` on `main@e4d6e97`, a command and its output, or a URL I
fetched. "Hypothesis" marks anything that does not.

## 2. Reach: who could have given a signal

| Metric | Value | Evidence |
|---|---|---|
| Marketplace installs | 83 | `vsce show Gasrulle.nuiget`: "⤓ 83 installs"; gallery API `install: 83` |
| Marketplace downloads / updates | 921 / 167 | gallery API `downloadCount: 921`, `updateCount: 167` |
| Marketplace trending (daily/weekly/monthly) | 0 / 0 / 0 | gallery API `trendingdaily/weekly/monthly: 0` |
| Ratings | **0** | reviews API `totalReviewCount: 0`. `weightedRating 4.4477` with 0 reviews is the Marketplace default, not a rating (the vsce text view prints "☆☆☆☆☆ (0)") |
| Marketplace Q&A | 0 questions | Q&A API `{"questions":[]}` |
| Latest Marketplace version | **1.18.9** (2026-10-10). 2.0.0 is not published | gallery API `versions[0] = 1.18.9`; `package.json` on main says 2.0.0; `gh release list` → 0 releases |
| Current listing created | 2026-03-09 (`publishedDate`), oldest listed version 1.11.0 | vsce `--json` `publishedDate: 2026-03-09T17:27:06Z`, versions 1.11.0 … 1.18.9 (25) |
| Open VSX | not listed | `open-vsx.org/api/Gasrulle/nuiget` → "Extension not found" |
| GitHub stars / forks / watchers | 0 / 0 / 0 | `gh repo view … stargazerCount 0, forkCount 0, watchers 0` |
| GitHub Discussions | disabled | `hasDiscussionsEnabled: false` |
| GitHub page views (14 days) | 93 views, **4 unique** | `traffic/views` |
| GitHub clones (14 days) | 4 469 clones, 543 unique, peaking 2026-10-12..17 | `traffic/clones`. The peak falls on the `labs/2.0` push days, so these are CI runners and Dependabot, not users (hypothesis by timing; GitHub does not split clones by actor) |
| Referrers | github.com only (3 views, 1 unique) | `traffic/popular/referrers` |
| Web mentions | none found | WebSearch result names no nUIget page |

Reach caveat: CHANGELOG 1.2.1 (2026-02-11) fixes "Marketplace showing 'Works with: Universal' instead of Desktop"
(`CHANGELOG.md:846`), and 1.7.0 mentions "marketplace rendering" (`CHANGELOG.md:684`). The extension was therefore
probably on the Marketplace in February under the same id (`git show 7f04a38:package.json` → `nuiget Gasrulle`). The
current listing starts on 2026-03-09 at 1.11.0, so the earlier listing history is unknown (not verified; Wayback has no
capture). 83 installs is therefore a lower bound since 2026-03-09, not lifetime reach.

## 3. GitHub: issues, pull requests, discussions

### 3.1 Every issue, classified

| # | Author | Opened → closed | Class | Area | Outcome |
|---|---|---|---|---|---|
| 11 | AGiorgetti (external) | 2026-07-30 → 2026-10-10 (72 days) | bug | Updates (correctness of update candidates) | fixed in 1.18.9 (`b28eead`; `CHANGELOG.md:141`); owner comment 2026-10-10 |

That is the complete list: `gh issue list --state all` returns one item. Issue numbers 1–10 and 12–31 are PRs.

The only external reporter ran .NET SDK 10.0, VS Code 1.132 Insiders and Windows. That is a single data point, but it
is consistent with the SDK 10 floor (D13) and is the only user evidence behind it.

Quotes from #11 (template fields filled in by the reporter):

- Bug: "When looking for packages update i see unlisted nuget packages as available updates."
- Expected: "Unlisted packages should not be displayed."
- Repro: "Mammoth.Extensions.DependencyInjection v0.7.1 -> … v6.0.0"; "v6.0.0 has been deprecated and unlisted and
  should not be displayed".
- Severity chosen: "High — major feature broken, no workaround". Component: "Main Panel (Browse / Installed / Updates
  tabs)". Environment: VS Code 1.132.0-insiders, extension 1.18.8, .NET SDK 10.0, Windows.
- Owner's reply (only comment): "Update suggestions in both the main panel and sidebar now use listed NuGet versions,
  with registration fallback, instead of treating every flat-container download as a listed release. Explicit version
  selection still supports downloadable unlisted versions."

What 2.0 does with it:

- Unlisted versions: handled. Update candidates come from a listed-only list (`src/core/feeds/registration.ts:2-3,131,144`;
  `src/core/feeds/updates.ts:78` passes `listedOnly: true`; `src/core/feeds/types.ts:88-89`).
- Deprecation: **not surfaced in 1.x or in 2.0.** `git grep -i deprecat 0457c75 -- src` → 0 files.
  `grep -rn -i deprecat src` on main → one hit, a comment in `src/core/http/ssrf.ts:115` about IPv4 address forms. The
  NuGet registration catalog entry has an optional `deprecation` object (`reasons` Legacy/CriticalBugs/Other,
  `message`, `alternatePackage`), per
  https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource §"Catalog entry" and §"Package
  deprecation". 2.0 already reads that document for versions and details (`registration.ts`).

Closed without a fix: **none.** #11 was fixed. PR #2 was closed unmerged, but its fix landed as `6931f78` (1.14.1,
`CHANGELOG.md:488`).

### 3.2 Pull requests as signal

| PR | Author | Signal |
|---|---|---|
| #2 (closed, 2026-03-19) | Copilot coding agent, prompted by the owner | The owner's own words in the prompt: "In the sidepanel when searching a package and installing the package by clicking the +. Sometimes i get a wildcard version instead of the latest version pinned." Fixed in 1.14.1 (`6931f78`, `CHANGELOG.md:488`). The same class is still a 2.0 gotcha ("A webview install without a version", `.github/copilot-instructions.md`, 2.0 gotcha table). |
| #12 (merged) | owner | `fix(search): preserve full NuGet prerelease versions` (`1821d0e`; `CHANGELOG.md:135`): version-string correctness again |
| #1, #3–#10, #13–#18, #26–#28, #30 | owner | Engineering, release and CI. The PR bodies of #6, #9 and #10 are the empty PR template (`gh pr view 6/9/10 --json body`), so there is no user-facing rationale in them |
| #19–#25, #29, #31 | Dependabot | dependency bumps, no signal |

### 3.3 The intake channel is stale

- `.github/ISSUE_TEMPLATE/config.yml:1` `blank_issues_enabled: false`. A reporter must use one of the five forms.
- The forms' "agent routing hints" name 22 distinct source paths across 33 lines (`01-bug-report.yml:16-24`,
  `02-feature-request.yml:15-31`, `03-performance-issue.yml:16-22`, `04-ui-ux-issue.yml:16-21`), and the PR template
  names the same kind at `.github/pull_request_template.md:43-45`. Only `src/extension.ts` exists on main. The other 21
  (`src/services/NuGetService.ts`, `src/webview/NuGetPanel.ts`, `src/webview/app/App.tsx`,
  `src/webview/sidebar/SidebarApp.tsx`, …) are 1.x files deleted at P8.2. Command:
  `grep -oh 'src/[A-Za-z0-9_./-]*' .github/ISSUE_TEMPLATE/*.yml .github/pull_request_template.md | … test -e`.
- The UI/UX form's "UI Area" options list 1.x surfaces: "Browse tab" (`04-ui-ux-issue.yml:62`), "Source settings
  overlay" (`:66`), "Sidebar — Search" (`:69`). 2.0 has no Browse tab (search results replace the tabs,
  `CHANGELOG.md:32`), and sources live in a dialog (`CHANGELOG.md:30`).
- Response latency on the only external issue: 72 days with no reply until the fix (#11 has one comment, on the closing
  day).

## 4. Marketplace Q&A and reviews

Both are empty (reviews API and Q&A API, §1 rows 7–8). The HTML page at `…&ssr=false#qna` renders those sections client
side, and WebFetch saw only the page chrome. Nothing in it contradicts the API results.

## 5. CHANGELOG history of 1.x (1.0.0 – 1.18.9)

### 5.1 Method

- Parser: `/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/scripts/changelog2.mjs`. It reads every `- **headline**` bullet under a `## [1.x]` heading and
  records version, section (`### Fixed`, `### Changed`, …) and line. Result: **413 entries in 46 versions; 199 under
  `### Fixed` in 34 versions** (the other sections: Changed 110, Added 81, Features 12, Removed 5, Security 4, none 2).
- Counting is on the **bold headline only** (the project's CHANGELOG rule makes the headline the summary). A first
  pass on headline plus description (`/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/scripts/changelog.mjs`)
  gave higher, noisier counts and is not used.
- The areas overlap: one headline can match several regexes ("Sidebar stuck loading spinner" counts as sidebar and as
  spinner). The regex for each area is in the parser above. The full list of matched headlines with
  `CHANGELOG.md:line` is `/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/changelog-areas.md`
  (588 lines). I checked that list by eye. Known noise: "CSP `img-src` … wildcards"
  (L561) counts as version handling, and "Centralized HTTP redirect handling" (L407/L428) counts as CPM. Treat the
  counts as ±10 %.
- Which versions shipped: the Marketplace lists 25 versions from 1.11.0 to 1.18.9. 23 of the 46 CHANGELOG versions are
  among them (254 entries, 121 Fixed). 1.0.0–1.10.0 and 1.17.3/1.17.4 are not in the current listing (159 entries, 78
  Fixed). 1.13.1 and 1.13.2 are on the Marketplace with no CHANGELOG entry. See the reach caveat in §2.

### 5.2 Areas by headline (1.x)

| Area | Headlines | of which Fixed | Versions touched | Versions with a Fixed headline |
|---|---|---|---|---|
| sidebar | 87 | **61** | 28 | **21** |
| performance / caching | 72 | 28 | 19 | 12 |
| refresh / sync / stale / flicker | 52 | 35 | 19 | 13 |
| all-projects / multi-project | 48 | 29 | 14 | 9 |
| updates (package updates) | 46 | 34 | 23 | 14 |
| theme / visual / layout | 36 | 17 | 14 | 7 |
| search | 32 | 17 | 13 | 7 |
| sources / credentials | 28 | 15 | 16 | 11 |
| icons / badges | 28 | 13 | 14 | 7 |
| bulk / batch operations | 28 | 19 | 16 | 10 |
| details / README | 22 | 9 | 10 | 6 |
| version handling | 19 | 15 | 12 | 11 |
| transitive | 14 | 9 | 8 | 6 |
| spinner / loading state | 14 | 12 | 10 | 8 |
| keyboard / a11y | 14 | 6 | 8 | 4 |
| notifications / output | 5 | 3 | 4 | 2 |
| restore | 4 | 2 | 3 | 2 |
| CPM / central | 3 | 0 | 3 | 0 (all three hits are noise: CPM support is a 2.0 feature) |

Reading: the sidebar appears in 31 % of all Fixed headlines (61/199). Package updates, refresh/sync and All Projects
follow. CPM, which 2.0 made a first-class area (`CHANGELOG.md:23-26`), has no 1.x history.

### 5.3 Literal duplicate headlines

Normalised headlines (lowercase, punctuation stripped) that appear twice in 1.x:

| Headline | Where | Meaning |
|---|---|---|
| "Activity Bar badge" | 1.15.2 Added L433; 1.17.2 Removed L346 | a real flip-flop (§5.5) |
| "Discriminated Union Message Types", "Shared Query Functions", "Centralized HTTP Redirect Handling", "NuGetLogger and NuGetCliService Extraction", "NuGetSourceService Extraction", "NuGetProjectService Extraction", "NuGetPackageService Extraction" | 1.15.2 L426-432 and 1.15.3 L405-411 | release notes copied into two versions, **not** recurring fixes |

No Fixed headline repeats word for word. The recurrences are thematic (§5.4).

### 5.4 Recurring problem themes (same problem fixed in several versions)

| Theme | Fixed headlines (version, line) | Count |
|---|---|---|
| Stuck or needless loading spinner | 1.1.0 L896; 1.7.0 L679; 1.11.0 L566; 1.15.2 L440, L441; 1.15.3 L417; 1.17.0 L374; 1.18.5 L218, L221, L229 | 10 in 7 versions |
| Sidebar and main panel out of sync | 1.7.0 L681; 1.11.0 L580, L581; 1.17.0 L368, L380, L385; 1.18.0 L310; 1.18.1 L290 | 8 in 5 versions |
| External `.csproj` change / file watcher not reflected | 1.5.0 L789; 1.5.2 L773; 1.11.0 L574; 1.18.1 L291; 1.18.5 L220, L227 (plus 1.18.8 Changed L154 "debounce 5s → 2s") | 6 in 5 versions |
| Flicker, flash, blanked rows on refresh | 1.18.4 L262; 1.18.5 L218, L219, L220, L223, L224 (plus 1.18.7 Changed L164, 1.18.8 Changed L152) | 6 in 2 versions |
| All Projects mode broken | 1.10.0 L614; 1.11.0 L577; 1.17.0 L369–L382, L384 (15 of the 18 Fixed in 1.17.0); 1.18.1 L289; 1.18.2 L282; 1.18.5 L229, L230; 1.18.8 L148 | 22 in 7 versions |
| Version written or offered wrongly (wildcard, empty, floating, semver, unlisted) | 1.5.2 L756; 1.10.0 L616; 1.11.0 L553; 1.14.1 L488; 1.15.1 L482; 1.18.5 L223; 1.18.9 L141; 2.0 L135 | 8 in 8 versions (L561 excluded as noise) |
| Slow or broken with unreachable sources | 1.1.1 L873; 1.2.0 L852, L853; 1.5.2 L772; 1.18.4 L252 (plus 1.13.0 Changed L513-514) | 5 in 4 versions |
| Notification or refresh spam during batch operations | 1.1.2 L867; 1.5.0 L792; 1.17.1 L352 | 3 in 3 versions |
| Bulk operation ordering and deferred restore | 1.5.1 L779; 1.9.2 L624, L625; 1.11.0 L567, L568; 1.14.0 L502 | 6 in 4 versions |
| Visual: invisible or misaligned controls | 1.6.0 L721 (gear barely visible), L722 (Verified badge not vertically aligned), L723 (update arrow misaligned); 1.7.0 L682 (remove-source icon invisible on dark themes); 1.18.0 L308 (Uninstall Selected invisible in light themes) | 5 in 3 versions |

Who reported these: none of the Fixed headlines cites an issue. The only external issue is #11 (§3.1). These themes
are the owner's own dogfooding (owner plus agents), not reports from users.

### 5.5 Flip-flops (seven decisions with three or more states) and 1.x features dropped in 2.0 (two)

Rows 1–5, 7 and 9 went through three or more states. Rows 6 and 8 (Collapse/Expand all, hover prefetch) have two
steps each, added in 1.x and dropped in 2.0, and are still open parity rows. They are listed here because the plan must
decide them too, but they are not flip-flops.

| Decision | History (version, line) | 2.0 state on main |
|---|---|---|
| Activity Bar update badge | added 1.4.0 L825/L827 → removed 1.4.2 L803 → added 1.15.2 L433 → fixed 1.16.0 L396 → removed 1.17.2 L346 ("redundant … eliminates significant complexity") | none (`grep -rnE '\.badge\s*=\|ViewBadge' src/host src/extension.ts` → empty) |
| What Refresh clears | 1.5.0 L786 "Refresh button not clearing stale update data" → 1.10.0 L617-618 "New package versions not found" / "Stale dotnet NuGet HTTP cache blocking version discovery" → 1.13.0 L515 "Refresh no longer clears NuGet HTTP cache" → 1.18.4 L245 "Refresh buttons now clear NuGet HTTP cache" → 1.18.5 L205 "no longer blocks on disk HTTP cache clear" | `refresh/all` invalidates the workspace in memory only (`src/host/handlers.ts:408-411`); HTTP cache cleared only by the command `nuiget.clearHttpCache` (`src/extension.ts:365-366`) |
| Browse as a tab or section | 1.0.0 L908 Browse tab → 1.4.0 L825 sidebar Browse section → 1.4.2 L804, L809 Browse section removed, Extensions-style search → 1.16.0 L391 main-panel Browse tab removed, unified search bar | search results replace the tabs (`CHANGELOG.md:32`) |
| Recent searches | 1.0.0 L918 → removed from the sidebar 1.4.2 L808 → in the main panel's unified search 1.16.0 L391 → removed 2.0 L17, L92 (D16 "stay removed") | removed |
| Operation notifications | spam fixed 1.1.2 L867, 1.5.0 L792, 1.17.1 L352 → 2.0 shipped with none (parity MU4, `parity-audit-2026-10-16.md:358`) → restored by D17 / P9.9 (`CHANGELOG.md:85`) | progress for bulk, toast per outcome (`CHANGELOG.md:85`) |
| Collapse all / Expand all | added 1.8.0 L659 (fixed hidden 1.8.0 L653) → "Not back from 1.x" 2.0 L92 | open: MI10, MU8 (`parity-audit-2026-10-16.md:28,38`) |
| All Projects representation | "Load all projects" checkbox 1.3.0 L836 → toolbar toggle icon 1.8.0 L658-659 → "All Projects (N)" entry in the project selector 1.17.0 L358 | a project-selector entry, grouped by workspace folder (`CHANGELOG.md:29`) |
| Hover prefetch | added 1.18.5 L192 → "Not back from 1.x" 2.0 L92 | open: MI11, MB13 (`parity-audit-2026-10-16.md:29,54`) |
| Restore toggle | `nuiget.noRestore` setting → UI toggle 1.18.5 L190, L199 → 2.0 header checkbox missing (MH1) → restored P9.7 (`parity-audit-2026-10-16.md:61`) | sidebar title-bar toggle plus main header checkbox |

### 5.6 Direction of 1.x visual changes (supports the owner's "native" direction)

1.x moved toward the workbench five times: Extensions-style sidebar search and native section headers (1.4.2 L802-804),
codicon SVGs instead of emoji (1.6.0 L694) with VS Code tab, widget and progress tokens (1.6.0 L706-716), native
progress bar and sash (1.12.0 L521-525), a filter funnel "matching VS Code's native Extensions sidebar" (1.14.0 L497),
and "VS Code-native sidebar styling" with 22 px rows (1.17.0 L364). The owner's memory note
`~/.claude/projects/-Users-mattias-github-nuiget/memory/sidebar-native-treeview-blocker.md` says the owner "has hit
this blocker repeatedly". The blocker is converting the sidebar to a native TreeView, which has no API for a search box
above the tree (microsoft/vscode#161753, as recorded 2026-10-13, not re-verified here).

### 5.7 CHANGELOG as a record: quality notes (not user signal)

- 1.13.0 is dated `2025-03-12` (L504); every neighbour is 2026.
- 1.15.0 (L445) comes before 1.15.1 (L477), out of order.
- 1.1.2 has bullets without a `###` section (L864-867).
- The 1.15.2/1.15.3 duplication (§5.3).
- 1.17.3/1.17.4 are in the CHANGELOG but not on the Marketplace; 1.13.1/1.13.2 are on the Marketplace with no entry.

## 6. git log of 1.x (to `0457c75`)

- `git log --oneline 0457c75 --reverse | wc -l` → **117** commits (2026-02-06 … 2026-10-11).
- `git log --format='%s' 0457c75 | grep -ci fix` → **24**.
- Six commits are squash merges with generic subjects ("Labs/redesign (#6)", "Labs/test suite (#7)", "Labs/playground
  search (#9)", "Labs/1.18.5 (#10)", "Labs/testing (#4)", "Labs/quality (#5)") whose PR bodies are empty templates.
  Commit subjects are therefore a low-resolution source, and the CHANGELOG (§5) is the primary one.

The 24 `fix` subjects, classified by hand
(`/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/git-1x-subjects.txt`):

| Area | Commits |
|---|---|
| Release, version or changelog housekeeping | 3e009c5, a38aeee, e7b7235, 57a2aa9 (also security), 6ae1e08, 232efe0, 075aa23, 85e76a9 (readme) |
| Build scripts | 58f245c, 2cde75a |
| Sidebar behaviour | 1f2323e (refresh on external .csproj changes), 8bcb494 (sidebar project package display), 646bbbb (sash position), 719c9be (tooltips) |
| Visual | 77db728 (top border "for better visibility"), 037b177 (colours and opacity of row actions) |
| Loading state | 876a3aa (stuck loading spinner on errors) |
| Version correctness | 6931f78 (wildcard version on sidebar install), b28eead (unlisted updates, #11), 1821d0e (prerelease versions) |
| Operations | 3b6c28b (batch uninstall and notifications), 4435a92 (project loading and updates) |
| Metadata | 69df3f8 (RegistrationsBaseUrl check) |
| Dependencies / security | 8a52b90 (npm audit) |

This is the same picture as §5: sidebar behaviour, version correctness, loading state and visual visibility. 35 of the
117 subjects contain "version" (`grep -ci version git-1x-subjects.txt` → 35), mostly in a release sense ("update
version to 1.x"), which makes a regex on "update" or "version" unusable for commit subjects.

## 7. The owner's hands-on findings (the only signal on 2.0)

### 7.1 Timeline

| When | Source | Verbatim or paraphrase | Content |
|---|---|---|---|
| 2026-03-19 | PR #2 prompt | **verbatim** | "Sometimes i get a wildcard version instead of the latest version pinned." (sidebar "+" install) |
| 2026-10-16 | owner's relayed words, `docs/plans/parity-audit-2026-10-16.md:1525` | **verbatim** | "the design is completely broken in 2.0, also the CI failed" |
| 2026-10-16 | plan §P9 "Why", `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:323-326` | paraphrase by the planning session | judged 2.0 "unusable next to 1.18.9": plain single-line rows with no icon, author or Verified badge; names truncated to "I [7.2.0]"; no transitive details; header toggles hidden; sparse details pane; sidebar rows losing the name behind long prerelease versions; no notifications or progress |
| 2026-10-16 | decisions D14–D19, plan :331-341 | owner decisions | D16 restores the 1.x keyboard and power paths: quick-search per-source grouping, ArrowRight version expansion, Ctrl+Enter quick install, Ctrl+Enter install on Browse rows, Multi Install from a single project, sidebar Update all. Recent searches stay removed |
| 2026-10-17 | owner's review of run 39017730043, `docs/plans/STATUS.md:1130` | **verbatim** | "content parity is restored; these layout defects remain" → P9.fix-2..6 (`docs/plans/STATUS.md:137-141`) |
| 2026-10-17 | D15 amended by the owner, plan :528 | owner decision | Installed and Updates rows go from two-line 66 px cards to three-line 78 px cards, check box and icon centred |
| 2026-10-17 | owner's `P9 approved` with V1–V5, `docs/plans/findings-ledger.md:188-192,461-473` | owner's findings (short form in the ledger) | V1 squeezed tab bar and bulk toolbar; V2 "Select all" and "Uninstall selected" misaligned with each other and with the list; V3 "provisional" badge overlaps the list's right border (All Projects header); V4 section headers with a small top and a large bottom margin; V5 spacing between header, toolbar, section headers and rows follows no single scale |

The parity audit itself warns not to borrow the owner's authority for computed wording
(`docs/plans/parity-audit-2026-10-16.md:1525`: "Severity should not borrow authority from the computed brief"). Only the
three verbatim rows above are the owner's words.

### 7.2 What the owner's fixes measured and what the owner saw next

| Owner's fix (2026-10-17) | Gate that closed it | What the owner filed after it | Gap between gate and perception |
|---|---|---|---|
| P9.fix-4: Update all / Uninstall selected right-aligned to the list edge (`STATUS.md:139`) | `Math.abs(button.right - list.right) <= 8` (`src/test/ui/v2/main-installed.ui.test.ts:92-102`, `main-updates.ui.test.ts:78-88`) | V2: "Select all" and "Uninstall selected" misaligned **with each other** and with the list | one horizontal edge of one element was measured; the relation between the two buttons (vertical centre or baseline, or left inset) was not. The ledger does not state the axis (not verified) |
| P9.fix-6: common left inset; every padding, margin and gap from the spacing scale (`STATUS.md:141`) | left edges of title, search box, tab label, Select all, section chevron and first row cell within ±1 px (`src/test/ui/v2/main-shell.ui.test.ts:64-84`); lint `pxSpacing` forbids px/em/rem in padding, margin and gap outside `tokens.css` (`src/test/lint/webview-stylesheets.test.ts:24,55,102`) | V4: small top / large bottom margin on section headers; V5: no single scale between header, toolbar, section headers and rows | the lint checks where a value comes from (a token), not the rendered distances. Six tokens 2/4/6/8/12/16 px plus a hairline (`src/webview/shared/tokens.css:14-23`) can still produce an uneven vertical rhythm. No gate measures vertical distances |
| P9.fix-3: three-line card, check box and icon centred (`STATUS.md:138`) | check box centre within 2 px of the card centre (`main-installed.ui.test.ts:52,78-89`) | V1: tab bar and toolbar "look squeezed" | row density was gated; the chrome above the list (tab bar, toolbar heights) was not |
| — | — | V3: provisional badge overlaps the list's right border | no gate checks overflow or containment of header content (`scrollWidth`, child box inside parent box) |

### 7.3 Still open from the owner's 2.0 audit (on main)

From the closure table (`docs/plans/parity-audit-2026-10-16.md:17-110`): **open** MI10 Collapse/Expand all (L28), MI11
hover prefetch (L29), MU8 All Projects Updates Collapse/Expand (L38), MB3 search waits for enrichment (L44), MB13 hover
prefetch (L54), MB16 version selector after the prerelease toggle (L57), MB17 HTML entities in descriptions (L58), MB18
ArrowLeft/Right between Details and README (L59), MB19 Browse first load announces nothing (L60), SB2 collapsed section
stays collapsed in filter mode (L75), SB7 no arrow-key bridge from the search box to the lists (L80), SB9 no Uninstall
on an installed Browse row / "+" when installed everywhere (L82), SB10 no provisional badge on sidebar All Projects
headers (L83), SB13 count badge shows 0 beside the spinner (L86), SB14 search box focused only on `ui/focusSearch`
(L87), DP8 (L96), DP10 (L98). **Partly**: MI7 (L25), MI12 (L30), DP3 (L91). The critic adds the header Restore action
and the details-pane contrast tolerance (L108-110).

## 8. Synthesis for the plan

1. **Who the user is.** With 83 installs, 0 reviews, one external issue and 2.0 unpublished, the only user with a
   documented voice on 2.0 is the owner. The owner is a keyboard-heavy power user who installs from search (PR #2, D16)
   and judges by looking at screenshots (three reviews in two days). Design for that user, and make the pre-release
   the first point where outside signal can arrive (F1, F3).
2. **What users trust or distrust.** The external issue and 8 Fixed version-correctness headlines say the same thing:
   whether the Updates list and the version an action writes can be trusted matters more than appearance. Deprecation
   is the open half of #11 (F2).
3. **Where 1.x broke.** The sidebar, the two surfaces staying in sync, All Projects and loading state. 2.0 rebuilt the
   state model (ADR-001 session store, query coordinator), so the *engineering* cause is addressed by architecture. The
   *IA* question remains: two surfaces show the same lists, and All Projects is a mode that every surface must render
   (F6, F7).
4. **What the plan must not inherit silently.** The flip-flops of §5.5 (F8).
5. **What the harness must measure.** Vertical rhythm, relations between siblings (shared centre line or baseline),
   chrome density and containment, under every theme in which a visibility regression has occurred. The owner's V rows
   are exactly what the 2.0 gates did not measure (F4, F5).

## 9. Reproducibility (scratchpad files)

- `/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/issues.json`: the raw `gh issue list` output.
- `/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/scripts/changelog2.mjs`: the headline parser and area table (run: `node changelog2.mjs /Users/mattias/github/nuiget/CHANGELOG.md <out.md>`).
- `/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/scripts/changelog.mjs`: the first, noisier pass (headline plus description), kept for comparison.
- `/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/changelog-areas.md`: every matched headline per area with `CHANGELOG.md:line`.
- `/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/git-1x-subjects.txt`: the 117 subjects with dates.

## 10. Findings

| Id | Letter | Sev | Decision-relevant | Claim | Evidence | Proposal |
|---|---|---|---|---|---|---|
| F1 | W | high | yes | No external signal on 2.0; almost none on 1.x. The only acceptance evidence available is the owner's review and the harness | §2 table; reviews API `totalReviewCount 0`; Q&A API empty; `hasDiscussionsEnabled false`; Marketplace latest 1.18.9; #11 the only issue; traffic 4 unique viewers | The plan names owner-as-proxy as the method, with V1–V5 and the owner's verbatim reviews as acceptance evidence, and plans the first outside signal at the 2.0.0 pre-release (intake ready, F3) |
| F2 | W | medium | yes | The only external issue is about trusting the Updates list. Its "deprecated" half is unaddressed in 1.x and 2.0 | #11 body; `registration.ts:131,144`, `updates.ts:78`; `git grep -i deprecat 0457c75 -- src` → 0; main grep → `ssrf.ts:115` only; NuGet registration docs §Package deprecation | The feature-gap dimension decides whether rows and details show deprecation (reasons, message, alternate package) from the registration that 2.0 already reads |
| F3 | W | medium | yes | Issue intake routes to 21 deleted 1.x paths, offers 1.x UI areas and is the only way to file (blank issues off). The one external issue waited 72 days for a reply | `config.yml:1`; `01-bug-report.yml:16-24`; `02-feature-request.yml:15-31`; `03-performance-issue.yml:16-22`; `04-ui-ux-issue.yml:16-21,62,66,69`; `pull_request_template.md:43-45`; #11 dates | A small plan item before the pre-release: rewrite the forms' routing hints and UI-area options for the 2.0 surfaces (main panel tabs, search results, details, sources dialog, sidebar sections), so the first outside reports arrive classified |
| F4 | W | high | yes | The owner's fixes were gated on horizontal edges and on which tokens are used; the owner then filed V2/V4/V5 on the same elements. Perceived alignment and rhythm are unmeasured | `STATUS.md:139,141,1130`; `main-installed.ui.test.ts:92-102`; `main-shell.ui.test.ts:64-84`; `webview-stylesheets.test.ts:24,55,102`; `tokens.css:14-23`; ledger `:188-192,469-473` | The measurement harness measures rendered vertical distances (header → toolbar → section header → first row), sibling centre lines and baselines (Select all against Uninstall selected), chrome heights against workbench equivalents, and containment (no child box outside its list). V1–V5 must turn red before any fix |
| F5 | W | medium | yes | Visibility and alignment regressions recur by theme in both generations | `CHANGELOG.md:308` (light), `:682` (dark), `:699` (HC), `:721-723` (alignment); parity MH6 (HC borders) `parity-audit-2026-10-16.md:66`; captures exist in light and HC for one state only (`main-installed-single-light/-hc.png`) | Run the harness's checks for each named state under Dark Modern, Light Modern and HC, not only `main-installed-single` |
| F6 | X | high | yes | "All Projects" is the most defect-dense concept of 1.x and still carries open 2.0 items | 22 Fixed headlines in 7 versions, 15 of 18 Fixed in 1.17.0 (`CHANGELOG.md:369-384`); three representations (`:836`, `:658-659`, `:358`); V3 (`findings-ledger.md:190`); SB10 (`parity-audit-2026-10-16.md:83`); MU8 (`:38`) | The IA design states once what All Projects scopes (lists, counts, actions, badges), how it is shown on both surfaces, and gives every named capture an All Projects twin |
| F7 | X | medium | yes | Sidebar and main panel duplicating the same lists was 1.x's largest defect source; the IA question (what each surface is for) was never written down | sidebar in 61/199 Fixed headlines; sync 8 Fixed in 5 versions; stuck spinner 10 in 7; external `.csproj` 6 in 5 (§5.4) | The plan states the job of each surface (for example a glance-and-act sidebar like the Source Control view, a manage-and-inspect panel like the Extensions editor) and keeps loading and empty states identical on both. This proposal is a hypothesis for the IA dimension to test |
| F8 | X | medium | yes | Seven IA decisions went through three or more states in 1.x / 2.0, and two 1.x features were dropped in 2.0 and remain open parity rows | §5.5 table (`CHANGELOG.md:346,433,825,803,245,515,617-618,205,391,808,659,192,867,792,352,190`; `handlers.ts:408-411`; `extension.ts:365`) | The plan settles each with a one-line rationale tied to a workbench precedent (Activity Bar badge, what Refresh clears, recent searches, Collapse/Expand all, notifications, hover prefetch), so the overhaul does not repeat the oscillation |
| F9 | W | medium | yes | The owner's documented workflows are keyboard and search-first installs | PR #2 prompt; D16 (plan :335-338); `CHANGELOG.md:22`; open SB7, MB18 (`parity-audit-2026-10-16.md:80,59`) | Keyboard paths (Ctrl+Enter install, ArrowRight versions, search → list arrow bridge) are non-regression requirements of every IA change, each with a test |
| F10 | W | low | no | Version correctness recurs in 8 versions and is still a 2.0 gotcha | §5.4 version row; PR #2; PR #12; `CHANGELOG.md:135` | Every control that writes a version shows that exact version; covered by the existing gotcha "A webview install without a version" |
| F11 | W | low | no | 1.x moved steadily toward workbench-native visuals, and the owner repeatedly hit the native TreeView blocker | `CHANGELOG.md:364,497,521-525,694,706-716,802-804`; memory note `sidebar-native-treeview-blocker.md` | Confirms the owner's "native-feeling" direction; the TreeView hybrid is for the sidebar dimension to re-check (#161753 not re-verified here) |
| F12 | W | low | yes | 17 owner-audit gaps are still open on main, and two critic items stay open | `parity-audit-2026-10-16.md:25-110` | The plan triages each open MI/MU/MB/SB/DP row: fold into the overhaul, defer with a CHANGELOG line, or close as not-a-gap |
| F13 | W | low | no | Reach numbers are unreliable as a user count: the current listing starts 2026-03-09 although the CHANGELOG fixes Marketplace display in February; clones are CI | `CHANGELOG.md:684,846`; vsce `publishedDate`; traffic clones vs views | Do not size or prioritise by install counts; record the measure after the pre-release |

## 11. Not reachable

- The Marketplace Q&A and reviews **HTML** sections (client-rendered; WebFetch saw page chrome only). The data was
  reached through the public APIs instead (empty).
- Wayback Machine: no captures of the listing (first CDX query `[]`; second query timed out after 30 s).
- The earlier (pre-2026-03-09) Marketplace listing history, if any.
- Marketplace install history over time (the API gives totals only).
- Per-actor split of GitHub clones (GitHub does not provide it).

## 12. Gaps (what this dimension did not cover)

- **Competitor user signal** (Marketplace reviews and GitHub issues of NuGet Gallery `patcx.vscode-nuget-gallery`,
  NuGet Package Manager GUI, C# Dev Kit's NuGet commands). These would be the only *external* voices about what NuGet
  users in VS Code want. Not done: it is outside the five sub-tasks, and its findings would be G (feature gap). A
  WebSearch shows that a newer "nuget-manager" (Managed Code) advertises a native Packages sidebar, which is relevant
  to the sidebar dimension (not verified beyond the search snippet).
- Reddit, Stack Overflow, Discord and Mastodon mentions: one WebSearch only; no targeted per-site search.
- The owner's 36 hands-on screenshots of 2026-10-16 (the parity audit cites 16 of 1.18.9 and 20 of 2.0, with the
  originals "with the owner"): only the 12 JPEG references in `docs/ux/reference-1.18.9/` are in the repo, and I did not
  view them. Nothing in this report rests on a PNG.
- I did not view the 15 capture PNGs: V1–V5 are taken from the ledger text, not judged.
- Commit bodies of the six squash merges were not mined (the PR bodies are empty templates; the commit bodies may hold
  more).

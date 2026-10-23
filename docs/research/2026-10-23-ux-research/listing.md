# Marketplace listing audit (research dimension: listing)

Date 2026-10-22. Repository `/Users/mattias/github/nuiget`, branch `main` at `e4d6e97`, read-only. Every probe output named
below is saved under the scratchpad
(`/private/tmp/claude-501/-Users-mattias-github-nuiget/d222be63-cd0e-406f-80db-8a5a6aa9b485/scratchpad/`, folders
`listing-probe/`, `gallery/`, `gallery2/`, `ghraw/`, `dl-gifs/`, scripts in `scripts/`).

## Summary

- **What users see today is the 1.x listing.** The Marketplace lists `Gasrulle.nuiget` 1.18.9 (2026-10-10) as the
  latest version; 2.0.0 is in `CHANGELOG.md:10` with a date but is not published. The live page shows the 1.x hero GIF
  (`docs/images/nuiget.gif`: 1765×1108, 921 frames, 77.6 s, 3.79 MB). 83 installs, 0 reviews, 0 Q & A questions.
- **The README on `main` is half user guide, half repository manual.** Lines 257–276 ("Development with Copilot") speak
  only to contributors and agents; requirements sit at line 246 of 280; no section below the hero has an image; there is
  no support section and no privacy statement.
- **The 2.0.0 CHANGELOG section is mostly developer history.** Of 115 bullets, 40 are user-facing, 24 state a user
  benefit in internal terms, 51 are developer-only (31 bullets name a `src/` path, 50 start with "2.0 ").
- **Three renderers show the README, and only one is open source.** vsce validates (marked 18 + parse5) and ships
  markdown; the Marketplace page renders server-side (markdown-it per a 2017 announcement; current library not
  verified); VS Code's Extensions view renders with marked 14.0.0 + DOMPurify and a fixed allow-list. A faithful,
  reproducible preview is VS Code's pipeline; GitHub is a fourth view, and its API HTML render strips `<video>` for a
  relative and a `…/raw/…` src (tested).
- **Hard rules for the README design:** no `<svg>` element, no SVG data URI, `.svg` images only from 32 trusted hosts
  plus GitHub Actions workflow badges, every image over HTTPS (README and CHANGELOG), icon not SVG; the repository's own
  `docs:check` requires the settings and commands tables in their exact form.
- **Premise corrections:** the keywords limit is **30**, not 5; the documented category list (17) is stale against VS
  Code's own list (20); vsce rewrites relative links to `HEAD`, not `main` as the docs say.

## 0. Method and sources

| Source | How it was read | Saved as |
|---|---|---|
| `README.md`, `CHANGELOG.md`, `package.json`, `.vscodeignore`, `scripts/check-docs-drift.mjs`, `docs/release-checklist.md` | `cat -n`, `grep -n` on `main` at `e4d6e97` | — |
| vsce 4.0.0 (the repository's own `node_modules/@vscode/vsce`, `package.json:330` `"@vscode/vsce": "^4.0.0"`) | `out/package.js` read and grepped | — |
| VS Code publishing docs and manifest reference | `gh api repos/microsoft/vscode-docs/contents/...` raw, last commit `7f0009b1` 2026-10-20; manifest page `DateApproved: 10/21/2026` | `listing-probe/docs-publishing-extension.md`, `listing-probe/docs-extension-manifest.md` |
| VS Code source (renderer of the Extensions view) | `gh api repos/microsoft/vscode/contents/...` at `main` `54d565d227` (2026-10-22) | `listing-probe/vscode-*.ts` |
| Marketplace metadata | `POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery` (flags 919) via `scripts/gallery.mjs`; `vsce show gasrulle.nuiget --json` | `gallery/summary.json`, `gallery2/summary.json`, `listing-probe/nuiget-show.json` |
| Published READMEs (what the Marketplace serves) | the `Microsoft.VisualStudio.Services.Content.Details` asset of each extension | `gallery/readme-*.md`, `gallery2/readme-*.md` |
| Marketplace item pages (server-side rendered HTML) | `curl` of `marketplace.visualstudio.com/items?itemName=…` | `listing-probe/item*.html` |
| GitHub READMEs of the eight named extensions | `gh api repos/<repo>/readme` raw | `ghraw/*.md` |
| Hero GIFs of ten listings | `curl` into `dl-gifs/`, parsed by `scripts/gifinfo.mjs` (block walk) | `dl-gifs/*.gif` |
| npm packages for GIF output | `npm view`, `api.npmjs.org/downloads` | — |

The published README asset and the GitHub README differ only by vsce's link rewriting and version drift (GitLens 37,159
B both; ESLint 32,184 vs 32,023; Thunder Client 3,392 vs 2,356), so section 4 measures the published asset: it is what
the Marketplace and VS Code show.

## 1. README.md today

### 1.1 Section map

| Lines | Section | Audience |
|---|---|---|
| 1–12 | Title, two badges (shields.io), one-liner, three PNGs | user |
| 14–74 | ✨ Features: 19 bullets, 59 lines, no image | user, with internal concepts (see 1.2) |
| 76–88 | 🚀 Quick Start, four tips | user |
| 90–97 | ⚙️ Settings table (4 rows) | user; guarded by `docs:check` |
| 99–105 | 📋 Commands table (3 rows) | user; guarded by `docs:check` |
| 107–135 | `<details>` Keyboard Shortcuts | user |
| 137–169 | `<details>` Configuration (NuGet sources) | user |
| 171–227 | `<details>` Private Feeds & Credentials | user (advanced) |
| 229–244 | 🔧 Troubleshooting table (12 rows) | user |
| 246–255 | Requirements | user, one developer sentence |
| 257–276 | Development with Copilot | **developer and agent only** |
| 278–280 | License | user |

18,839 bytes (`wc -c README.md`); the published 1.18.9 README is 8,357 bytes (`gallery/summary.json`).

### 1.2 Lines only a developer of the repository needs

| Line(s) | Text (abridged) | Why it is developer-only | Proposal |
|---|---|---|---|
| 257 | `## Development with Copilot` | Section for contributors and coding agents | Move to `CONTRIBUTING.md` (not shipped: `.vscodeignore` ships only listed files) |
| 259 | "Development uses Node.js 24 (see `.nvmrc`; 24.15.0 or newer) and npm 10 or newer." | Toolchain of the repository | same |
| 260–262 | `npm install`, `npm run compile`, `npm run package:vsix`, `npm test`, `npm run test:coverage`, `npm run bench`, `npm run test:e2e`, `npm run test:ui` | Build and test commands | same |
| 262–265 | UI tests download VS Code and ChromeDriver; macOS `--storage /tmp/nuiget-ui` | Test harness detail | same |
| 267–270 | Links to `.github/copilot-instructions.md`, `ARCHITECTURE.md`, `.github/instructions/` | Agent and architecture documents | same |
| 272–275 | Links to `.github/skills/github-actions-efficiency/SKILL.md`, `.github/skills/github-actions-hardening/SKILL.md`, `.github/agents/se-technical-writer.agent.md`, `.github/skills/git-commit/SKILL.md` | Agent skills | same |
| 276 | "Commit, push, and publish actions still require explicit authorization." | An instruction to agents, shown to every Marketplace visitor | delete from README |
| 255 | "The remote case is not verified by the test suite." | Test-suite statement | "Remote development is not tested." |
| 97 | `nuiget.enablePerformanceLogging`: "Writes the webviews' `[perf]` marks (webview ready, first useful render) … at Info level instead of Debug" | Developer phrasing; the same text is the setting's description in `package.json:282`, which VS Code's Settings editor shows | User phrasing in both places (the table row must stay, see §3.9) |
| 44–47 | "Provisional, then evaluated … MSBuild evaluation then replaces it with the authoritative list" | Internal state model named as a feature | Keep the user fact (list appears at once, refines; "unresolved" never changed) without the vocabulary |
| 61–63 | "One operation runs at a time and up to five wait behind it" | Queue capacity | Keep as one clause at most |
| 188–189 | "decrypts it with DPAPI for the current user, with the entropy `NuGet` that NuGet itself uses" | Implementation detail | drop the entropy clause |
| 201 | "Credentials found are kept for 30 minutes, and 'no credentials' for 5 minutes" | Cache lifetimes | keep only in Troubleshooting, if at all |

Links in lines 267–275 are relative; vsce rewrites them to `https://github.com/gasrulle/nuiget/blob/HEAD/…`
(`node_modules/@vscode/vsce/out/package.js:581-600`), so they work on the Marketplace but lead visitors into agent files.

### 1.3 What a user deciding whether to install needs and does not find

| Need | State today | Evidence | Peers |
|---|---|---|---|
| Requirements before features (SDK 10 floor, the 2.0 breaking change) | at line 246 of 280 (88 % down), after Troubleshooting | `README.md:246-255`; `CHANGELOG.md:15` | Go: Requirements is section 1 of 11; C# Dev Kit section 3 of 13; Remote Containers and vitest name Requirements (`gallery/measure2.json`) |
| What it does in one line, in VS Code's terms | "A Visual Studio-style NuGet package manager for VS Code with a modern split-panel UI and Activity Bar sidebar." | `README.md:6` | owner's direction: read as a built-in VS Code view |
| A screenshot per feature | 0 of 8 sections has an image; the three PNGs sit together at the top; none shows the sidebar, All Projects, CPM preview, transitive packages, the sources dialog or quick search | `scripts/measure2.mjs` row `nuiget-2.0.0-main`: sections 8, with image 0, images 3 (all in intro) | Playwright 10 of 11 sections with an image, vitest 3 of 5, Copilot 3 of 4, Continue 4 of 5 |
| Support and feedback | no section; the Issues link exists only in the Marketplace "Resources" sidebar (from `bugs`) | `package.json:18-20`; measure2 `support: -` | 21 of 31 measured published listings have a Questions/Issues/Feedback/Contributing section |
| Privacy and telemetry | nothing said | `grep -c -i telemetry README.md package.json` → 0, 0 | MS listings carry a Data/Telemetry section (C# Dev Kit, Jupyter, Go) |
| Upgrading from 1.x (state reset, SDK 10, removed features) | only in CHANGELOG | `CHANGELOG.md:14-17,92` | — |
| Known limitations in one place | scattered: `packages.config` (239), Restricted Mode and virtual workspaces (244, 252), remote (253–255) | lines cited | nuget-workbench, Go have explicit sections |
| Settings and commands tables | present and checked against the manifest | `README.md:90-105`; `scripts/check-docs-drift.mjs:104-128,186-205` | Error Lens, ESLint, vitest, nuget-workbench, Live Server have them |
| Keyboard reference | present, collapsed | `README.md:107-135` | — |
| That "Solution Explorer" means C# Dev Kit | not said | `README.md:84`; `package.json` menu `view == solutionExplorer` | — |

Facts the README can state truthfully (verified): nUIget has no telemetry code (`grep -rnE
'createTelemetryLogger|isTelemetryEnabled|applicationinsights|appInsights|@vscode/extension-telemetry' src package.json` →
no match) and opts the dotnet CLI out (`src/core/cli/DotnetRunner.ts:28` `DOTNET_CLI_TELEMETRY_OPTOUT: '1'`); a
configuration without nuget.org never contacts it, and a package mapped to a private feed never has its id sent to
nuget.org (`CHANGELOG.md:38`; not re-verified in code here).

### 1.4 Images in the README

| File | Size | Bytes | Content (judge-only) |
|---|---|---|---|
| `docs/images/nuiget-browse-details.png` | 1280×900 | 189,663 | full window: Explorer, search results, details of Newtonsoft.Json, "Sign In" button in the title bar |
| `docs/images/nuiget-installed-readme.png` | 1280×900 | 146,287 | two-package Installed tab, README of Json.NET |
| `docs/images/nuiget-updates.png` | 1280×900 | 72,001 | two update rows, half the image an empty details pane ("Select a package to see its details."), toast "nUIget: Restored 1 project." |
| `docs/images/nuiget.gif` (tracked, not linked from the 2.0 README; linked by the live 1.18.9 listing) | 1765×1108 | 3,974,687 | 1.x UI, 921 frames, 77.6 s |

The PNGs are the CI captures' format (all 15 captures are 1280×900, DPR 1, full VS Code window;
`src/test/ui/v2/sidebarWebview.ts:49-51` calls `VSBrowser.instance.takeScreenshot`, the whole window). VS Code's
Extensions view caps the README body at `max-width: 882px` with `padding: 10px 20px`
(`src/vs/workbench/contrib/markdown/browser/markdownDocumentRenderer.ts:20-22` in the VS Code repository), so a
1280-pixel image is drawn at most 842 CSS pixels wide, a 0.66 scale: 13-pixel UI text becomes about 8.6 pixels, and at
DPR 1 the image is upscaled on HiDPI screens. The Marketplace column width was not measured (its stylesheet is
external).

## 2. CHANGELOG.md today

87,581 bytes; the 2.0.0 section (`CHANGELOG.md:10-136`) is 26,244 bytes, 115 bullets, the longest 645 characters.
Both the Marketplace ("Changelog" link; the page JSON carries `"ChangelogText":"Changelog"`) and VS Code's Extensions
view ("Changelog" tab, `extensionEditor.ts:605-606`) show the whole file.

Hand classification of every bullet of 2.0.0 (U = user-facing, M = user benefit written in internal terms, D =
developer-only):

| Lines | Class | Note |
|---|---|---|
| 14–17 | U (4) | Breaking changes; line 14 says "main panel, sidebar and host are what the package ships" (internal wording) |
| 20, 21, 22, 23, 24, 28, 29, 30, 31, 32, 40, 42, 43 | U (13) | Added: user features; 50 bullets start with "2.0 " |
| 25, 26, 27, 33, 34, 35, 36, 37, 38, 39, 41, 44, 45, 46, 56, 57, 58, 59, 60, 62, 63, 67 | M (22) | Name `src/core/*` modules, `cpm/preview`, `--no-restore`, "host", "service index", "gzip-only registration hive"; the user fact inside (privacy of package ids 38, proxy and certificates 41, offline details 35, log redaction 67) is worth keeping |
| 47, 48, 49, 50, 51, 52, 53, 54, 55, 61, 64, 65, 66, 68, 69, 70, 71 | D (17) | bus, store, primitives, tokens, harness, composition root, build, protocol, hosts, catalog, project files, redirect guard, query coordinator, runner, cache, versioning, utilities, import fences |
| 74–92 | U (19) | Changed: rows, header, details, notifications, sidebar, high contrast, "Not back from 1.x" (92) |
| 99, 100, 129 | U (3) | Credential lookup order, Azure Artifacts provider, `nuiget.recentSearchesLimit` removed |
| 94, 127 | M (2) | "one msbuild run" (speed), "2.0 theme pass" (vague) |
| 93, 95, 96, 97, 98, 101–126, 128, 130, 131 | D (34) | benchmarks, `resources/invalidated`, CSP nonce, Copilot, Claude Code, Context7, MCP, Vitest, plan, ADRs, run protocol, P1.1b, probes, conformance table, agent gotchas, advisor agent, Node 18 typing, guard hooks, package-contents check, CI, Mocha, coverage, ARCHITECTURE.md, ledger, e2e port, 1.x deletion |
| 135 | U (1) | Fixed |

Totals: U 40, M 24, D 51 (115). 31 bullets name a `src/` path (`awk 'NR>=10&&NR<=136&&/^- /' CHANGELOG.md | grep -c
'src/'` → 31). "2.0 package sources" heads two different bullets (lines 30 and 57). The released sections below
(1.18.9 and older) follow the rule "never edit released sections" (`.github/copilot-instructions.md`, CHANGELOG rules);
`docs/release-checklist.md:106-107` already records their inconsistencies.

Whether the unpublished 2.0.0 section may still be rewritten is an **owner decision**: it is dated and merged to `main`
but no Marketplace user has seen it (gallery `versions[0]` = 1.18.9).

## 3. What the Marketplace renders and refuses

### 3.1 Three renderers (four views)

| View | Renderer | Sanitizer / allow-list | Evidence |
|---|---|---|---|
| `vsce package` / `publish` | `marked` (vsce dependency `^18.0.11`) + `parse5`, **validation only**; the VSIX carries the rewritten markdown as `extension/readme.md` | rejects, see 3.2 | `out/package.js:644-695`, `:744-746` |
| Marketplace web page (Overview tab) | server-side rendered; "moving its markdown parser to markdown-it which is based on the CommonMark specification", mandatory from 2017-12-01 (devblogs.microsoft.com, 2017). Current library **not verified**. `package.json` `markdown`: `github` (default) or `standard` → VSIX property `Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown` (`out/package.js:373,1202`; live value `true`) | not published. Observed keep-list: `<details>/<summary>` (6 on the nUIget page), tables, `<p align=center>`, `<img width=1200>` / `width="75%"`, `<figure>` (its `align="center"` was dropped on GitLens), `<video src=…>` kept (bierner.test-test); links get `rel=nofollow`; heading ids GitHub-style without emoji (`## ✨ Features` → `id=features`) | `listing-probe/item*.html`, `listing-probe/rendered-readme-1.18.9.html`, `listing-probe/bierner-test.html` |
| VS Code Extensions view (Details and Changelog tabs) | `marked` 14.0.0 (`src/vs/base/common/marked/cgmanifest.json`) + highlight + `markedGfmHeadingIdPlugin`, in a webview | DOMPurify: tags `basicMarkupHtmlTags` (`src/vs/base/browser/domSanitize.ts:15-83`: a, abbr, b, bdo, blockquote, br, caption, cite, code, col, colgroup, dd, del, details, dfn, div, dl, dt, em, figcaption, figure, h1–h6, hr, i, img, ins, kbd, label, li, mark, ol, p, pre, q, rp, rt, ruby, s, samp, small, source, span, strike, strong, sub, summary, sup, table, tbody, td, tfoot, th, thead, time, tr, tt, u, ul, var, video, wbr) + `input`; attributes `align autoplay alt colspan controls draggable height href loop muted playsinline poster rowspan src target title type width start checked disabled value data-code data-href data-severity`, `style` only on `span` (colour regex), `class` only codicon spans (`src/vs/base/browser/markdownRenderer.ts:705-760`), plus `name id class role tabindex placeholder` (`markdownDocumentRenderer.ts:177-186`); links http, https, mailto (`extensionEditor.ts:766-774`); CSP `default-src 'none'; img-src https: data:; media-src https:; script-src 'none'` (`extensionEditor.ts:791`). Not allowed: `picture`, `svg`, `style` blocks, `iframe`, `script` | VS Code `main` `54d565d227` |
| GitHub (repository README) | GitHub's own pipeline | its API HTML render strips `<video>` with both a relative and a `github.com/…/raw/…` src and keeps `<img>` (rendered `<img src="cat.gif" data-animated-image="">`, no `<video>`). Not tested: the github.com page itself, and a `github.com/user-attachments/…` video src (GitHub documents video uploads in markdown) | `gh api repos/mjbvz/test-vscode-ext/readme -H 'Accept: application/vnd.github.html'` → `listing-probe/gh-render-test-vscode-ext.html` |

**Preview recommendation (for the plan):** reproduce VS Code's pipeline: `marked@14.0.0` + `dompurify` with the tag and
attribute lists and the CSP above copied verbatim, `max-width: 882px`, light and dark. It is open, the strictest of the
measured views, and what an installed user sees. Add vsce's own validation by running `vsce package` (or `vsce ls` plus
the 3.2 rules) in the gate. Treat the Marketplace page as a looser superset checked after publishing by fetching back
`Content.Details` and the item page; GitHub's API render is the only view measured that drops `<video>`.

The Marketplace page JSON carries `"IsMDPruned":false,"PrunedMDLength":0,"OverviewMDLength":8357` for nUIget; no page
measured was pruned up to 37,135 bytes (GitLens), so a pruning threshold exists above that and was **not found**.

### 3.2 What vsce refuses (vsce 4.0.0, `out/package.js`)

| Rule | Line | Applies to |
|---|---|---|
| Any `<svg>` element: "SVG tags are not allowed" | 693-695 | README, CHANGELOG (unconditional) |
| `data:image/svg…` src: "SVG data URLs are not allowed" | 682-684 | images in README, CHANGELOG |
| Image src not `https:`: "Images in … must come from an HTTPS source" | 685-687 | same |
| Image path ending `.svg` from an untrusted host: "SVGs are restricted …; please use other file image formats, such as PNG" | 688-690 | same; the test is the path extension and the exact host |
| Image without `src` | 671-673 | same |
| The image checks above run only while relative-link rewriting is on (default) | 668 | `--no-rewrite-relative-links` skips them; the `<svg>` check still runs |
| README still containing "This is the README for your extension " | 577-579 | README |
| Icon ending `.svg`: "SVGs can't be used as icons" | 1046-1048 | `icon` |
| Manifest badge URL not https, or `.svg` from an untrusted host | 1049-1063 | `badges` |
| `sponsor.url` not http(s) | 1082-1093 | `sponsor` |
| `pricing` other than `Free`, `Trial` | 1010 | `pricing` |

The docs state the same four constraints (`docs-publishing-extension.md:49-58`: "vsce will not publish extensions that
contain user-provided SVG images").

**Trusted SVG hosts** (`out/package.js:186-219`, 32 hosts, exact host match `:229-231`): api.travis-ci.com,
app.fossa.io, badge.buildkite.com, badge.fury.io, badgen.net, badges.frapsoft.com, badges.gitter.im, cdn.travis-ci.com,
ci.appveyor.com, circleci.com, cla.opensource.microsoft.com, codacy.com, codeclimate.com, codecov.io, coveralls.io,
david-dm.org, deepscan.io, dev.azure.com, docs.rs, flat.badgen.net, gitlab.com, godoc.org, goreportcard.com,
img.shields.io, isitmaintained.com, marketplace.visualstudio.com, nodesecurity.io, opencollective.com, snyk.io,
travis-ci.com, visualstudio.com, vsmarketplacebadges.dev; plus GitHub Actions workflow badges matching
`^https://github.com/<owner>/<repo>/(actions/)?workflows/.*badge.svg` (`:226-228`). The docs list the same set with
"github.com (from Workflows only)" (`docs-extension-manifest.md:162-204`). nUIget's two badges use img.shields.io
(trusted).

### 3.3 Links and the repository field

- With `repository` on GitHub, vsce rewrites relative markdown links to `https://github.com/<owner>/<repo>/blob/HEAD/…`
  and relative images (markdown and `<img>`/`<video>` with a simple path) to `…/raw/HEAD/…`
  (`out/package.js:581-612,698-738`, `branchName = githostBranch ? githostBranch : 'HEAD'` at `:721`). The docs say "using
  the `main` branch by default" (`docs-publishing-extension.md:418`): **docs and code disagree**; the published 1.18.9
  README shows `blob/HEAD/LICENSE` (`listing-probe/published-readme-1.18.9.md:4`), confirming the code.
- `--githubBranch`, `--baseContentUrl`, `--baseImagesUrl` override (`:556-558`; docs `:418`). Go pins its images to a
  tag: `https://github.com/golang/vscode-go/raw/v0.59.0/docs/images/gettingstarted.gif` (`gallery/images.txt`).
- vsce also turns ` #123` and ` owner/repo#123` into issue links (`:615-640`); the README and CHANGELOG have no such
  pattern today (`grep -nE '(\s|^)([A-Za-z0-9_-]+/[A-Za-z0-9_-]+)?#[0-9]+\b'` → none).
- nUIget's README uses absolute `https://raw.githubusercontent.com/gasrulle/nuiget/main/docs/images/*.png`
  (`README.md:8,10,12`), so the published listing follows whatever `main` holds at view time, for every version.
- **Pinning works only on relative links.** vsce returns an absolute link unchanged (`out/package.js:594-596`: `if
  (!prefix || !isLinkRelative) return …`), so `--baseImagesUrl` does nothing for today's three absolute URLs. Pinning
  takes two changes: (a) relative paths `docs/images/*.png` in `README.md:8,10,12`; (b)
  `--baseImagesUrl https://github.com/gasrulle/nuiget/raw/<sha-or-tag>/` on the CI step `npx vsce package --out …`
  (`.github/workflows/ci.yml:354`) and in `package:vsix` (`package.json:301`). `docs/release-checklist.md:95-98` creates
  the tag after publishing, so a tag-pinned URL needs the tag first; the commit SHA (`${{ github.sha }}`) is known at
  package time. `.vscodeignore` excludes `docs/**`, `*.gif` and `*.mp4`, so hero media is hosted on GitHub either way:
  relative paths are rewritten at packaging, not shipped.

### 3.4 Video and GIF

- The publishing docs and the manifest reference say nothing about GIF or video (grep of both files for `gif|video`:
  no rule).
- Marketplace page: keeps `<video src=…>` (bierner.test-test page: `<video src=test.mp4>` and the absolute
  `<video src="https://github.com/mjbvz/test-vscode-ext/raw/main/test.mp4">`) and styles it (`.markdown video {
  max-width: 100%; }` in the page CSS). A relative video src is not rewritten by the Marketplace (vsmarketplace#494);
  vsce rewrites it since PR #920 (merged 2023-12-15, fixes vscode-vsce#780).
- VS Code Extensions view: `video` and `source` allowed with `autoplay controls loop muted playsinline poster`;
  `media-src https:` (3.1).
- GitHub: the API HTML render strips `<video>` for a relative and a `…/raw/…` src (3.1); the github.com page and a
  `user-attachments` src were not tested.
- Practice: 0 of 31 measured published READMEs uses `<video>`; GitLens links a PNG thumbnail to YouTube
  (`<figure><a href="https://www.youtube.com/watch?v=7cy4_M0lH6k"><img …get-started-video.png>`), Thunder Client has a
  "Videos" section of links. GIF is the only moving format that works in all four views.

### 3.5 Tabs, links and header

- **Changelog**: shown when `CHANGELOG.md` exists (asset `Microsoft.VisualStudio.Services.Content.Changelog`,
  `out/package.js:755-758`); in VS Code a "Changelog" tab (`extensionEditor.ts:605-606`).
- **Q & A**: `qna` = `marketplace` (default), a URL string, or `false` (`docs-extension-manifest.md:35`;
  `out/package.js:316-323`). nUIget sets none, so the Q & A tab is on (the page has `<button id="qna">Q &amp; A</button>`);
  0 questions (`…/publishers/gasrulle/extensions/nuiget/qna` → `{"questions":[]}`).
- **Resources**: Issues ← `bugs.url`, Repository ← `repository.url`, Homepage ← `homepage`, License ← `license`
  (`docs-extension-manifest.md:144-150`); vsce writes `Links.Support` from `bugs` (`out/package.js:1191`). The docs
  suggest a `SUPPORT.md` (`docs-publishing-extension.md:422`); vsce 4.0.0 has no code for it (grep `SUPPORT` → none) and
  nUIget has none. Whether the Marketplace reads it: **not verified**.
- **galleryBanner**: `color` hex and `theme` `dark`/`light` (the font colour) (`docs-extension-manifest.md:116-126`).
- **icon**: PNG of at least 128×128 (256×256 for Retina), not SVG (`docs-extension-manifest.md:43`;
  `docs-publishing-extension.md:424`).
- **badges** field: approved hosts only, `url`, `href`, `description`, shown in the page's sidebar
  (`docs-extension-manifest.md:33`).
- **sponsor**: `{ url }`, needs vsce ≥ 2.9.1 (`docs-publishing-extension.md:500-517`).
- **pricing**: `Free` (default) or `Trial` (`:483-498`).
- **"Works with"**: the live page says `"WorksWith":["Universal"]` for nUIget, ESLint and Go (desktop-only) and
  `"Universal, Web"` for GitLens, Prettier, YAML, Error Lens; `CHANGELOG.md:846` (1.2.1) records a "fix" of this label,
  which is the normal value.

### 3.6 Description, keywords, categories

- **description**: no length limit in the docs or in vsce (none found); observed 29 (Prettier) to 258 (GitLens)
  characters (`gallery/summary.json`). nUIget: 122.
- **keywords**: "currently limited to 30 keywords" (`docs-extension-manifest.md:26`); "You exceeded the number of allowed
  tags of 30" (`docs-publishing-extension.md:621-623`). vsce 4.0.0 does not count them (TagsProcessor `:434-535` merges
  keywords with derived tags). The **task's "5" is not in any source read.** nUIget: 14 keywords, 14 live tags.
- **categories**: docs list 17 (`docs-extension-manifest.md:25,154`); VS Code's `EXTENSION_CATEGORIES` has 20 (adds AI,
  Azure, Chat; `src/vs/platform/extensions/common/extensions.ts:327-348`); the gallery API returns 78 (with Visual
  Studio ones). GitHub Pull Requests uses `AI`, `Chat`. No package-management category exists; `Other` is the fit and 5
  of 6 NuGet peers use it (nuget-workbench uses `Programming Languages`).

### 3.7 Publishing, a date that bounds the listing work

"On December 1, 2026, global Personal Access Tokens (PATs) in Azure DevOps are retired. To keep publishing extensions,
use secure automated publishing with Microsoft Entra ID instead of PATs" (`docs-publishing-extension.md:65,158`).
`docs/release-checklist.md:83-92` publishes with `npx vsce publish` or the upload page. Manual upload of the VSIX on the
management page remains documented (`docs-publishing-extension.md:236`).

### 3.8 What the 1.18.9 listing looks like today

Published README (`listing-probe/published-readme-1.18.9.md`, 8,483 B): two badges, one-liner, the 1.x GIF from `main`,
19 emoji feature bullets, Quick Start, Settings, Commands, three `<details>`, Troubleshooting, Requirements, License. No
"Development" section. Page metadata: categories `Other`, 14 tags, banner `#512BD4 dark`, Links to GitHub, issues and
`#readme` (`listing-probe/nuiget-show.json`).

### 3.9 The repository's own gate on README.md

`npm run docs:check` (CI Lint job) runs `scripts/check-docs-drift.mjs`, which requires in README.md: a table headed
exactly `| Setting | Default | Description |` with one row per contributed setting and its default (`:104-128`), a table
headed exactly `| Command | Description |` listing every palette command by title and no other (`:186-205`), only real
`nuiget.*` names, and only paths that exist (`:290-311`). A redesign keeps those tables or changes the script (an
owner-approved item).

## 4. How top-rated and peer extensions structure their listing

Published README assets, measured by `scripts/measure2.mjs` (sections = h1 after the title plus h2; images exclude
badges; "hero" = images before the first section).

| Extension | Installs | Rating (n) | KB | Sections | with image | Images | GIFs | Badges | Hero | Req. | Start | Settings | Cmds | Support | Tables | details |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| eamodio.gitlens | 53.5 M | 3.38 (944) | 36.3 | 22 | 3 | 4 | 0 | 0 | 1 PNG (video thumbnail) | - | y | - | - | y | 0 | 0 |
| GitHub.vscode-pull-request-github | 37.1 M | 3.93 (148) | 5.7 | 7 | 0 | 2 | 2 | 1 | 2 GIF | - | y | y | - | y | 0 | 0 |
| ms-toolsai.jupyter | 110.6 M | 2.64 (371) | 12.4 | 11 | 1 | 3 | 0 | 0 | 1 PNG | - | - | - | y | y | 2 | 0 |
| rangav.vscode-thunder-client | 7.7 M | 2.37 (766) | 2.3 | 5 | 1 | 1 | 0 | 0 | — | - | y | - | - | - | 0 | 0 |
| usernamehw.errorlens | 10.2 M | 4.87 (188) | 23.0 | 6 | 0 | 1 | 0 | 4 | 1 PNG | - | - | y | y | y | 3 | 0 |
| esbenp.prettier-vscode | 72.5 M | 3.54 (492) | 17.3 | 7 | 0 | 0 | 0 | 5 | — | - | y | y | - | - | 0 | 0 |
| dbaeumer.vscode-eslint | 53.5 M | 4.29 (251) | 31.3 | 8 | 1 | 2 | 0 | 1 | — | - | - | y | y | - | 0 | 0 |
| ritwickdey.LiveServer | 83.7 M | 4.40 (519) | 6.8 | 9 | 2 | 7 | 2 | 6 | 1 GIF | - | y | y | y | y | 0 | 0 |
| golang.Go | 20.0 M | 4.28 (268) | 11.3 | 11 | 2 | 3 | 3 | 1 | — | y | y | y | - | y | 0 | 0 |
| ms-dotnettools.csdevkit | 18.4 M | 2.32 (307) | 9.1 | 13 | 1 | 2 | 2 | 0 | — | y | y | - | - | y | 0 | 0 |
| ms-playwright.playwright | — | — | 5.3 | 11 | 10 | 13 | 0 | 0 | 1 PNG | - | - | - | - | y | 0 | 0 |
| vitest.explorer | — | — | 14.1 | 5 | 3 | 9 | 0 | 0 | 1 PNG | y | y | y | - | y | 2 | 0 |
| **NuGet peers** | | | | | | | | | | | | | | | | |
| jmrog.vscode-nuget-package-manager | 1.65 M | 3.80 (10) | 2.9 | 5 | 1 | 2 | 2 | 0 | — | - | - | - | - | y | 0 | 0 |
| patcx.vscode-nuget-gallery | 747 k | 4.81 (37) | 1.8 | 1 | 1 | 3 | 3 | 0 | 1 GIF | - | - | - | - | - | 0 | 0 |
| aliasadidev.nugetpackagemanagergui | 297 k | 4.82 (28) | 8.1 | 20 | 2 | 2 | 1 | 6 | — | - | - | y | - | - | 0 | 0 |
| FullStackSpider.visual-nuget | 40.5 k | 4.91 (23) | 2.7 | 5 | 1 | 1 | 1 | 0 | — | - | y | - | - | y | 0 | 0 |
| nuget-workbench.nuget-workbench | 665 | 5.0 (3) | 20.6 | 16 | 1 | 5 | 1 | 4 | 1 GIF | y | y | y | y | y | 3 | 0 |
| **Gasrulle.nuiget 1.18.9 (live)** | 83 | — (0) | 8.2 | 7 | 0 | 1 | 1 | 2 | 1 GIF | y | y | y | y | - | 7 | 3 |
| **nUIget README on main (2.0)** | — | — | 18.4 | 8 | 0 | 3 | 0 | 2 | 3 PNG | y | y | y | y | - | 6 | 3 |

Full table for 31 published listings plus the README on main: `gallery/measure2.json` (the run also printed `gallery2`: Copilot, Copilot Chat, Python,
Docker, C#, C++, PowerShell, YAML, Remote Containers, Live Preview, Continue, Cline, Claude Code).

Patterns (measured):

- **Hero**: a single moving or still image right after a one-paragraph pitch (Live Server, NuGet Gallery,
  nuget-workbench, Remote Containers: GIF; GitLens, Error Lens, Playwright, vitest: PNG). Badges are optional: 19 of 31
  have none.
- **Feature sections with images**: the listings that explain UI give each feature a heading and an image (Playwright
  10 of 11, Copilot 3 of 4, Continue 4 of 5, vitest 3 of 5); the NuGet peers lead with an install-flow GIF.
- **Settings tables**: common for configuration-heavy extensions (Error Lens, ESLint, Live Server, nuget-workbench).
- **Support**: 21 of 31 have a Questions, Issues, Feedback or Contributing section.
- **Requirements**: present where an external toolchain is needed (Go, C# Dev Kit, Remote Containers, vitest,
  nuget-workbench).
- **Length**: NuGet peers are short (1.8–8.1 KB) except nuget-workbench (20.6 KB); nUIget on `main` is 18.4 KB.

## 5. package.json fields that feed the listing

| Field | Value (`package.json` line) | Rule | Verdict |
|---|---|---|---|
| `displayName` | "nUIget - A NuGet Package Manager" (3) | unique on the Marketplace; used for search in VS Code (`docs-extension-manifest.md:23,109`) | valid |
| `description` | "A NuGet package manager with Visual Studio-style UI. Search, install, update, and remove packages across multiple sources." (4), 122 chars | no limit found | valid; positions against Visual Studio, not VS Code (owner's direction) |
| `categories` | `["Other"]` (35-37) | 17 documented / 20 in VS Code | valid; best available |
| `keywords` | 14 (38-53): nuget, package manager, package management, nuget packages, dotnet packages, manage nuget, packages, dependencies, nuget.config, azure devops, dotnet, .NET, C#, csharp | ≤ 30 | valid; five near-duplicates; nothing for CPM, vulnerabilities, csproj/fsproj/vbproj, transitive, PackageReference |
| `galleryBanner` | `#512BD4`, `dark` (9-12) | hex + theme | valid (.NET brand purple) |
| `icon` | `resources/icon.png` 512×512 PNG, 170,836 B (8) | PNG ≥ 128, not SVG | valid; motif is a throttle grip (the publisher's name, hypothesis: Swedish "gasrulle"), not a package — judge-only |
| `badges` | absent | approved hosts | none |
| `qna` | absent → `marketplace` | — | Q & A tab on, a second inbox |
| `sponsor` | absent | http(s) URL | none |
| `homepage` | `https://github.com/gasrulle/nuiget#readme` (17) | Resources: Homepage | valid |
| `bugs` | `https://github.com/gasrulle/nuiget/issues` (18-20) | Resources: Issues; `Links.Support` | valid |
| `repository` | `https://github.com/gasrulle/nuiget` (13-16) | enables relative-link rewriting | valid |
| `license` | `MIT` (7) + `LICENSE` (1,065 B) | Resources: License | valid |
| `pricing`, `preview`, `markdown` | absent → Free, not preview, github | — | defaults |
| `capabilities` | untrusted and virtual workspaces unsupported (28-34) | shown in VS Code | valid; README repeats it (244, 252) |
| `engines.vscode` | `^1.85.0` (23) | "Engine" property | valid |

## 6. Hero GIF

### 6.1 Limits

| Limit | Value | Source |
|---|---|---|
| Marketplace image size | none documented; images are loaded from their own host (the nUIget page's `<img src>` is the raw.githubusercontent.com URL, no proxy); Remote Containers' 21.7 MB GIF is live | `listing-probe/rendered-readme-1.18.9.html`; `dl-gifs/remote-containers.gif` |
| VS Code Extensions view | none; `img-src https: data:`, `max-height: 100%`, `max-width: 100%`, body ≤ 882 px | `extensionEditor.ts:791`; `markdownDocumentRenderer.ts:22,31` |
| GitHub repository file | warning > 50 MiB, blocked > 100 MiB, browser upload ≤ 25 MiB | docs.github.com "About large files on GitHub" |
| GitHub image proxy (Camo) on github.com | not published; the open-source Camo default `CAMO_LENGTH_LIMIT` is 5,242,880 bytes (hypothesis for GitHub's deployment) | docs.github.com "About anonymized URLs" (no limit stated); github.com/atmos/camo README via search |

### 6.2 What the listings use (`scripts/gifinfo.mjs`)

| GIF | Size | Frames | Duration | MB |
|---|---|---|---|---|
| nUIget 1.x `docs/images/nuiget.gif` | 1765×1108 | 921 | 77.6 s | 3.79 |
| GitHub Pull Requests `demo.gif` | 2378×1452 | 218 | 24.0 s | 6.93 |
| Go `gettingstarted.gif` | 1516×928 (shown at `width="75%"`) | 44 | 8.8 s | 3.72 |
| Live Server `animated-demo.gif` | 896×480 | 249 | 10.0 s | 1.04 |
| Remote Containers | 1440×877 | 706 | 23.5 s | 21.74 |
| C# Dev Kit `07-add.existing.project.gif` | 1539×962 | 75 | 11.0 s | 0.18 |
| NuGet Gallery `run_extension.gif` | 1950×1049 (`width=1200`) | 75 | 5.3 s | 0.47 |
| NuGet Package Manager `add-package.gif` | 640×420 | 181 | 12.1 s | 1.55 |
| Visual NuGet `quick_peek.gif` | 1920×1080 | 342 | 38.0 s | 1.23 |
| NuGet Package Manager GUI `demo2` | 1024×802 | 881 | 44.0 s | 2.99 |
| nuget-workbench `demo.gif` | 1280×800 | **4** | 12.0 s (3 s per frame) | 0.10 |

Peers run 5.3–44 s (median of the ten: 12.05 s); nUIget's 77.6 s is 1.8–15× longer. nuget-workbench's hero is a
four-frame slideshow of screenshots: the pattern that a pipeline built on the CI's PNG captures produces directly.

### 6.3 Tools to render a GIF from PNG frames in Node

| Package | Version | License | Deps | Weekly downloads | Last publish | Fit |
|---|---|---|---|---|---|---|
| `gifenc` | 1.0.3 | MIT | 0 | 371,663 | 2022-05-03 | encoder + PnnQuant quantizer, per-frame `delay`, `repeat`; "no dithering support … best suited for simple flat-style vector graphics" (its README): UI screenshots are that |
| `pngjs` | 7.0.0 | MIT | 0 | 43,326,448 | 2023-02-20 | decode the PNG captures to RGBA for gifenc |
| `sharp` | 0.35.5 | Apache-2.0 (libvips binaries `@img/sharp-libvips-*` LGPL-3.0-or-later) | 3 + 25 optional native packages | 71,400,664 | 2026-09-27 | `sharp(images, { join: { animated: true } }).toFile('out.gif')` (sharp.pixelplumbing.com/api-constructor); Node ≥ 20.9.0 |
| `modern-gif` | 2.1.0 | MIT | 1 | 7,088 | 2026-04-16 | encoder/decoder |
| `gif-encoder-2` | 1.0.5 | Unlicense | 0 | 43,826 | 2022-05-03 | encoder with dithering |
| `omggif` | 1.0.10 | MIT | 0 | 2,277,009 | 2022-06-22 | low-level encoder/decoder |
| `upng-js` | 2.1.0 | MIT | 1 | 220,358 | 2022-06-28 | APNG/PNG, not GIF |
| `gifski` (npm) | 1.7.1 | AGPL-3.0+ | 0 | — | 2022-08-15 | license unsuitable |

`node_modules` of the repository holds none of them (`ls node_modules | grep -iE 'sharp|gif|pngjs|upng'` → none).
The repository installs with `npm ci` from the lockfile and earlier removed optional native `@emnapi/*` dependencies
(`.github/copilot-instructions.md`, Tooling table, "CI and `package:vsix` use `npm ci`"); a pure-JavaScript pair
(`pngjs` + `gifenc`, both MIT, zero dependencies) avoids sharp's 25 optional native packages. The 15 captures are
already 1280×900 PNG, so a slideshow needs no resize; a crop to the panel needs either a crop step or element
screenshots instead of `VSBrowser.instance.takeScreenshot` (whole window).

## 7. Findings

| # | Letter | Severity | DR | Claim | Evidence |
|---|---|---|---|---|---|
| 1 | H | high | yes | Three renderers show the README; only VS Code's is open (marked 14.0.0 + DOMPurify allow-list + CSP); build the preview on it | §3.1 |
| 2 | H | high | yes | No `<svg>` element, no SVG data URI, `.svg` only from 32 trusted hosts + workflow badges, HTTPS only, icon not SVG, in README and CHANGELOG | `out/package.js:186-231,668-695,1046-1063`; docs `:49-58` |
| 3 | W | high | yes | Users see 1.18.9 with the 77.6 s 1.x GIF; 2.0.0 is unpublished; 83 installs, 0 reviews, 0 Q & A | gallery summary; `qna`/`reviews` API |
| 4 | W | high | yes | README images are linked from mutable `main`; every published version's listing follows `main`; removing `docs/images/nuiget.gif` breaks the live 1.18.9 page | `README.md:8,10,12`; published 1.18.9 README line 8 |
| 5 | X | high | yes | README lines 257–276 (+255, 97) are developer and agent content shipped to the Marketplace and VS Code | §1.2 |
| 6 | X | high | yes | README lacks early requirements, per-feature images, support, privacy, upgrade notes, a limitations section | §1.3 |
| 7 | X | high | yes | CHANGELOG 2.0.0: 40 user, 24 mixed, 51 developer-only bullets; rewriting it before first publish is an owner decision | §2 |
| 8 | H | medium | yes | `<video>` is kept by the Marketplace and VS Code, stripped by GitHub's API render for repo-relative and raw srcs; no peer uses it; GIF works in all views | §3.4 |
| 9 | H | medium | yes | vsce rewrites relative links to `HEAD` (docs say `main`) and leaves absolute links alone; pinning needs relative image paths in README plus `--baseImagesUrl …/raw/<sha-or-tag>/` in the CI `vsce package` step (Go pins to its tag) | `out/package.js:594-596,721`; docs `:418`; `.github/workflows/ci.yml:354` |
| 10 | H | medium | yes | `docs:check` requires the exact settings and commands tables and existing paths in README | `scripts/check-docs-drift.mjs:104-128,186-205,290-311` |
| 11 | H | medium | yes | Keywords limit is 30 (task said 5); categories: docs 17, VS Code 20; `Other` is the fit | §3.6 |
| 12 | H | medium | yes | GIF pipeline: `pngjs` + `gifenc` (MIT, 0 deps) fits `npm ci`; sharp adds LGPL libvips and 25 optional native packages | §6.3 |
| 13 | H | medium | yes | Peer hero GIFs run 5.3–44 s; nUIget's is 77.6 s; a 4-frame slideshow (nuget-workbench) is the cheapest pattern from PNG captures | §6.2 |
| 14 | H | medium | yes | Global Azure DevOps PATs retire 2026-12-01; the release checklist publishes with `vsce publish` | docs `:65,158`; `docs/release-checklist.md:83-92` |
| 15 | X | medium | yes | The README feature list is a 59-line wall of 19 bullets; listings that explain UI use a heading and an image per feature | `README.md:16-74`; §4 |
| 16 | X | medium | yes | displayName, description and README:6 position nUIget as "Visual Studio-style", against the owner's direction (built-in VS Code views) | `package.json:3-4`; `README.md:6` |
| 17 | H | medium | no | README PNGs are 1280-px full-window captures shown ≤ 842 px wide in VS Code (0.66 scale, ~8.6 px text), DPR 1 | §1.4 |
| 18 | X | low | no | (judge-only) README PNGs show the test workspace, a "Sign In" button, an empty details pane and an unrelated toast | `docs/images/*.png` |
| 19 | X | low | no | `qna` absent: Marketplace Q & A tab is a second inbox; peers point it to GitHub or turn it off | `out/package.js:316-323`; gallery summary |
| 20 | X | low | no | Keywords: five near-duplicates, nothing for CPM, vulnerabilities, project file types | `package.json:38-53` |
| 21 | H | low | no | No description length limit found (29–258 chars observed) | §3.6 |
| 22 | H | low | no | Marketplace prunes long READMEs (`IsMDPruned`); none pruned up to 37,135 B; threshold not found | `listing-probe/item*.html` |
| 23 | H | low | no | Docs recommend `SUPPORT.md`; vsce 4.0.0 has no code for it; nUIget has none | docs `:422`; grep |
| 24 | X | low | no | README:84 "Solution Explorer" tip does not say it needs C# Dev Kit | `README.md:84`; `package.json` menus |
| 25 | X | low | no | CHANGELOG 2.0.0: "2.0 package sources" heads two bullets; 50 bullets start with "2.0 " | `CHANGELOG.md:30,57` |
| 26 | W | low | no | "Works with: Universal" is the normal label (ESLint, Go); CHANGELOG 1.2.1 records a fix of a non-defect | `CHANGELOG.md:846`; item pages |
| 27 | W | medium | yes | NuGet peers: NuGet Package Manager 1.65 M installs, NuGet Gallery 747 k (4.81, 37), GUI 297 k; their listings are short and lead with an install GIF; nuget-workbench (665) is the closest feature peer with 16 sections and a settings table | §4 |
| 28 | X | low | no | (judge-only) The icon (a throttle grip) does not say "packages"; banner is .NET purple; the owner's brand | `resources/icon.png` |

## 8. Not reachable

- `api/references/extension-guidelines.md` in microsoft/vscode-docs: HTTP 404 under that path.
- The Marketplace's server-side markdown renderer and sanitizer: closed source; identified only by the 2017 devblogs
  announcement (markdown-it) and observed output.
- The Marketplace page's external stylesheet (README column width).
- GitHub's production Camo size limit (not in docs.github.com).

## 9. Gaps

- The Marketplace keep-list is observed, not enumerated: `<picture>`, `<source media>`, `<kbd>`, inline `style`, and
  `<video controls autoplay muted loop>` attributes were not tested on a live page.
- GitHub: whether content inside a stripped `<video>` (an `<img>` fallback) survives was not tested; the github.com page
  render (as opposed to the API render) and a `github.com/user-attachments/…` video src were not tested.
- The README pruning threshold of the Marketplace.
- Whether `SUPPORT.md` is read by the Marketplace.
- Search ranking effect of keywords and description in VS Code's Extensions view and on the Marketplace.
- Whether C# Dev Kit ships NuGet add/update/remove commands (its README mentions only "Automatic NuGet Restore",
  `gallery/readme-ms-dotnettools.csdevkit.md:31`); a positioning question for the README.
- Open VSX listing (not examined).
- Whether VS Code's `--force-device-scale-factor=2` works under the CI's xvfb ExTester run for HiDPI captures
  (hypothesis, not tried).

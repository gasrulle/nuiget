# Feature-gap analysis: nUIget 2.0 against Visual Studio, Rider, C# Dev Kit and the VS Code Marketplace

Research sweep of the UX overhaul, dimension **feature-gaps**, 2026-10-22. Repository `main` at `e4d6e97`, read-only.

## 0. Summary

- nUIget 2.0 is ahead of every VS Code competitor on the data path. It applies package source mapping to every
  metadata read. It walks the credential chain without logging secrets. It works through VS Code's proxy, keeps a
  provisional list and replaces it with the MSBuild-evaluated one, previews a CPM change across the projects it
  reaches, and reports an unreachable source as unreachable rather than as an empty list. Microsoft's own page says
  the Visual Studio Package Manager UI does **not** apply source mapping to browse and update lookups
  (NuGet/Home#12783).
- The largest gaps are in the **vulnerability and deprecation workflow**, which is where Visual Studio, C# Dev Kit 11
  and the 2026 crop of Marketplace extensions compete:
  - Deprecation is shown nowhere (G1).
  - Transitive vulnerabilities are invisible until the user expands a collapsed section, and they are never counted
    (G2). `NuGetAuditMode` defaults to `all` on net10.0.
  - `auditSources` and `NuGetAuditSuppress` are ignored. Worse, when no allowed source offers `VulnerabilityInfo`,
    nUIget records "no vulnerabilities" (`[]`), not "unknown", and `@vulnerable` says "No vulnerable packages." (G3,
    high, read from the code).
  - Nothing marks vulnerable versions or offers "update the vulnerable ones" (G4).
- Two solution-level features of Visual Studio are absent: **Consolidate** (G5) and **promoting a transitive package
  to a direct reference** (G6). Both need no protocol change: `ops/bulkUpdateAllProjects` and `ops/install` exist.
- **Native integration** with VS Code is thin. There are no Command Palette flows beyond "Manage NuGet Packages" (G9).
  There is no right-click menu in the main panel, although the Listbox primitive supports one (X1). The sidebar shows
  no vulnerability mark although it fetches the data (X2). There is no CodeLens or Problems entry in project files
  (G10). There is no keybinding (G19). The interaction model promises a header **Restore** that does not exist (G13).
- Of the 20 parity-audit rows that are still open, 4 are medium: SB2, SB7, SB9 and MB3. Two more are also
  decision-relevant: DP3 (high, partly closed) and MI7 (medium, which folds into the vulnerability work together with
  DP8).

## 1. Method and evidence legend

| Tag | Meaning |
|---|---|
| `path:line` | Read in the repository at `e4d6e97` (read-only). |
| `[F:key]` | A web page fetched with WebFetch in this session. WebFetch returns a small model's summary of the page; labels in quotation marks were quoted by that summary. The URLs are in §8. |
| `[MKT]` | VS Code Marketplace gallery API (`POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery`, filterType 10, sortBy install count), run on 2026-10-22. Raw JSON is in `scratchpad/research/mkt/`. |
| `[RM:id]` | The extension's own README, changelog or `package.json`, downloaded from the Marketplace CDN through the asset URLs of `[MKT]` into `scratchpad/research/mkt/dl/`. These are **self-reported claims**: no competitor was installed or run. |
| `[GH:repo path]` | A source file read with `gh api` (read-only). |
| `n/v` | Not verified. Treat it as a hypothesis. |

Costs are in session-days of an Opus implementing session under RUN.md and include tests and documentation duties.
"Protocol change" means an edit under `src/protocol/**` (`messages.ts`, `domain.ts`, `guards.ts`) or
`src/core/contracts.ts`. These are frozen contracts under D6 and need the `.claude/.contract-change` sentinel and an
advisor ruling.

## 2. nUIget 2.0 capability baseline

| Capability | nUIget 2.0 | Evidence |
|---|---|---|
| Search | Enter searches every selected source, results are merged and ranked by id match; quick-search suggestions are grouped per source; the query text goes to the search service as `q` | `README.md:21`; `messages.ts:134-135`; `src/core/feeds/search.ts:151-152,227` |
| Search syntax and filters | `@installed`, `@updates`, `@vulnerable` (main panel); `@installed`, `@updates` (sidebar). NuGet's own `owner:`/`tags:` syntax probably passes through in `q` but is neither documented nor hinted (n/v at runtime) | `interaction-model.md:27-35`; `SidebarView.tsx:46,120-121` |
| Browse without a query, paging | No: an empty box is the Installed/Updates mode; a search returns at most `searchResultLimit` (default 20, max 100) with no "load more" | `interaction-model.md:29`; `handlers.ts:303`; `package.json` configuration |
| Prerelease | Shared session toggle (header checkbox, sidebar title-bar beaker) | `interaction-model.md:14-21`; `package.json` view/title |
| Version selection | Dropdown with "(installed)"; the button reads Install, Update or Downgrade | `interaction-model.md:143-146`; `DetailsPane.tsx:185` |
| Floating and range versions | Shown with badges; the details pane will not change them ("A floating or ranged version is changed in the project file"). This is **parity with 1.18.9**, whose button was also disabled (`0457c75:PackageDetailsPanel.tsx:282-287`). Exact pins are never offered as updates | `DetailsPane.tsx:107,119`; `domain.ts:13-22`; ledger N6 |
| Pinning or ignoring updates | No action to pin, unpin or ignore a package's updates | grep, no hit |
| Dependency view | Dependencies per target framework in the details pane, collapsed with counts. Transitive packages per framework, each with "Required by" top-level ids (first 5, plus `fullChain`) | `DetailsInfo.tsx:83-103`; `domain.ts` `TransitivePackage`; `TransitiveSection.tsx:27-33` |
| Vulnerabilities | From each allowed source's `VulnerabilityInfo`. Direct rows carry a "Vulnerable" badge. The details pane gives severity in words, an icon and the advisory link. `@vulnerable` filters direct rows. The Installed tab counts vulnerable **direct** packages. Transitive rows carry the badge only once the section is expanded | `vulnerability.ts:2,107-108`; `InstalledProjectSection.tsx:42-58,147`; `DetailsInfo.tsx:153-161`; `MainShell.tsx:187-190`; `TransitiveSection.tsx:159` |
| Deprecation | **None.** The only `deprecat` hit in `src` is a comment in `src/core/http/ssrf.ts:115` | grep |
| License | Expression or "View license" link | `DetailsInfo.tsx:53-55` |
| README and changelog | README tab: sanitized Markdown, host-fetched images, copy buttons. No release notes or changelog | `messages.ts:140-142`; `ReadmeView.tsx`; `domain.ts:113-133` (no `releaseNotes`) |
| Other details fields | Version, Author(s) with Verified, License, Downloads, Package size, Date published, Project URL, Report abuse (nuget.org only). No owners or tags | `DetailsInfo.tsx:48-70,141` |
| Update all | Updates tab Update all and Update selected; sidebar Update all; All Projects Update all | `README.md:36-37`; `messages.ts:160,162`; CHANGELOG 2.0.0 Added |
| Consolidate | **None** (no `consolidat` in `src`) | grep |
| Sources and credentials | List, enable/disable, add (with config file, credentials, insecure flag), remove with confirmation. **No edit.** Credentials come from environment variables, `nuget.config` (ClearText and DPAPI-encrypted `Password`) and the Azure Artifacts credential provider. Package source mapping is applied to every metadata read. No mapping UI | `messages.ts:146-152`; `SourceSettingsDialog.tsx:43-55,126-170`; `README.md:146,175-205`; `src/core/feeds/policy.test.ts:124,134` |
| CPM | CPM badge; central version preview listing the reached projects; `VersionOverride` updates in place; uninstall keeps the central entry; bulk install skips central entries | `messages.ts:166-167`; `README.md:38-43`; `interaction-model.md:69,85` |
| Offline and cache | Details from the global-packages folder, marked offline. "Clear NuGet HTTP Cache" (http-cache only). Persisted feed cache (8 MiB) | `domain.ts:131-132`; `README.md:104` |
| Install into several projects | All Projects picker, plus Install in projects… from a single project | `messages.ts:159`; `interaction-model.md:49-57`; `DetailsPane.tsx:212` |
| Restore | Restore-after-operations toggle; Restore on the transitive banner. The interaction model also promises a header Restore that the code does not render | `MainShell.tsx:237`; `TransitiveSection.tsx:84`; `interaction-model.md:87` |
| Details links | Project URL, license URL, Report abuse. No link to the package's page on its source | `DetailsInfo.tsx:53-67` |
| Keyboard | Full listbox model and documented keys. **No contributed keybinding** | `README.md` Keyboard Shortcuts; `package.json` `contributes.keybindings` = null |
| Context menus | Explorer, Solution Explorer and editor title open the manager. The sidebar rows open an actions QuickPick (right-click or Shift+F10). **The main panel lists have no menu** | `package.json` menus; `pickers.ts:104-127`; `Listbox.tsx:40-41,168-171,218-222`; `SidebarHost.ts:27` |
| Command Palette | Manage NuGet Packages, Clear NuGet HTTP Cache, Clear SDK Version Cache. Every other command is hidden (`when: false`) | `package.json` `menus.commandPalette` |
| Telemetry | None of its own. Every `dotnet` call sets `DOTNET_CLI_TELEMETRY_OPTOUT=1` | `src/core/cli/DotnetRunner.ts:28`; grep `telemetry` |
| Localization | English only (D11) | `docs/adr/000-release-and-compatibility-policy.md:42` |
| Project formats and scope | SDK-style `PackageReference` only. `packages.config` and non-SDK projects are shown as unsupported. All Projects = discovered projects by workspace folder; no solution parsing (D2) | `docs/adr/000-...md:40-44` |
| Host baseline | VS Code 1.85 (Node 18.15, Chromium 114) | `package.json` engines; D10 |

## 3. Competitor feature tables

### 3.1 The IDEs and Microsoft's VS Code extension

Legend: ✓ present, – absent on the fetched evidence, n/v not verified.

| Feature | nUIget 2.0 | Visual Studio 2026 PM UI | Rider 2026.2 NuGet window | C# Dev Kit (stable 3.40 / prerelease 11.x) |
|---|---|---|---|---|
| Search | ✓ multi-source, ranked | ✓ Browse tab; popular packages on an empty query; owners shown as profile links since 17.11 [F:vs-install] | ✓ name, `T:` types, `N:` namespaces; source selector [F:rider-using] | ✓ QuickPick search in "NuGet: Add NuGet Package" [F:csdk-pm] |
| Filters and tabs | `@installed/@updates/@vulnerable` | Browse/Installed/Updates (+ Consolidate for a solution) [F:vs-install] | Installed/Discover/Implicitly Installed categories; scope selector [F:rider-ref] | – (commands only) [F:csdk-pm] |
| Prerelease | ✓ | ✓ "Include prerelease" [F:vs-install] | ✓ checkbox [F:rider-using] | ✓ setting `nuget.includePrereleasePackageVersions` [F:csdk-pm][RM:csdevkit manifest] |
| Version pinning or floating | Floating shown, not editable; no pin | n/v | Implicit versions in parentheses, not changeable [F:rider-ref] | n/v |
| Dependency view | ✓ per TFM + transitive with Required by | ✓ transitive section; tooltip names one direct package [F:vs-auditing]; promote a transitive package to top level [F:vs-transitive-blog] | ✓ Implicitly Installed; Frameworks/Dependencies preview [F:rider-using] | Solution Explorer Dependencies node [F:csdk-pm] |
| Vulnerabilities | ✓ direct rows; transitive after expand | ✓ incl. transitive (17.8, #8756), Solution Explorer infobar (#12398), vulnerable label in the version dropdown (#12623 fix) [F:vs-6.8]; AuditSources honored in the PM UI (NuGet 7.0) [F:vs-auditing] | Not on the fetched pages. Editor inspection "Vulnerable API usage" (Mend.io) [F:rider-vulnapi] | ✓ "Add nuget security vulnerability check to workspace requirements"; command "Ask Copilot to fix vulnerabilities"; 11.x package CodeLens with vulnerabilities [RM:csdevkit changelog l.39,605; manifest] |
| Deprecation | **–** | ✓ Installed tab warning with reason and alternate since 16.3 [F:vs-deprecate] | Not on the fetched pages; "deprecation messages" in 2020.2 EAP per search snippet (blog 403, n/v) | n/v |
| License | link | ✓ details + license acceptance prompt on install [F:vs-install]; View License dialog (#12060) [F:vs-6.8] | n/v | n/v |
| README / changelog | README | README tab [F:vs-install] | `readme.txt` opens after install [F:rider-using] | – |
| Update all | ✓ | ✓ select several + Update [F:vs-install] | ✓ "Upgrade all packages in Solution" [F:rider-ref] | – (one package per command) [F:csdk-pm] |
| Consolidate | **–** | ✓ Consolidate tab [F:vs-install] | not found [F:rider-ref] | – |
| Sources + credentials | add/remove/toggle, no edit; full credential chain | Options: Add/Edit/Remove, enabled, Allow Insecure, machine-wide, Audit Sources, Config Files list with Open [F:vs-options] | Sources tab per config file, add/remove/edit, open file; password store; credential-provider plugins [F:rider-using][F:rider-ref] | – |
| Package source mapping | applied to all reads, no UI | Options page Add/Edit/Remove; status in the details pane ("Package source mapping is off" + Configure, 17.7); automatic mappings on install (17.8). Browse/update lookups do **not** honor mappings (#12783) [F:vs-psm][F:vs-options] | n/v | n/v |
| CPM | ✓ with impact preview | n/v (not on the fetched pages) | CPM since 2022.3 per search snippet (blog 403, n/v) | n/v (changelog l.512 mentions CPM-related fixes) |
| Offline / cache | offline details; http-cache clear | "Clear NuGet Local Resources" (http-cache, global-packages, temp, plugins-cache) [F:vs-options] | Folders tab: sizes, clear selected caches, open folder [F:rider-ref] | – |
| Install into several projects | ✓ | ✓ solution window, project checkboxes [F:vs-install] | ✓ per project in details [F:rider-using] | – (one project per command) [F:csdk-pm] |
| Restore | toggle + banner | "Restore NuGet Packages" command; restore on build [F:vs-options] | Restore Normal/Force/Light auto-restore [F:rider-using] | automatic restore [F:csdk-pm] |
| Install options | – | Dependency behavior, File conflict action, Show preview window, Remove dependencies, Force uninstall [F:vs-install] | PMC `-IgnoreDependencies` [F:rider-using] | – |
| Keyboard shortcuts | in-list keys, no keybinding | n/v | Alt+Shift+7, Ctrl+P N, Alt+Enter, Ctrl+Q [F:rider-ref] | palette commands [F:csdk-pm] |
| Context menus | sidebar only | Solution Explorer "Manage NuGet Packages" [F:vs-install] | right-click / Alt+Enter on rows [F:rider-using] | Solution Explorer right-click → NuGet commands [F:csdk-pm] |
| Package Manager Console | – | ✓ (n/v here) | ✓ PMC tab [F:rider-using] | – |
| Telemetry | none | n/v | n/v | follows VS Code telemetry (issue "Disable Telemetry" #985 in changelog; n/v) |
| Localization | English | n/v | n/v | ✓ manifest strings `%commands.addNuGetPackage%` [RM:csdevkit manifest] |

### 3.2 VS Code Marketplace: NuGet-related extensions

Query `[MKT]` "nuget" (122 hits over two pages), "csproj" (47) and "dotnet package" (100); sorted by installs.
Install counts as reported by the gallery API on 2026-10-22.

#### 3.2a Full-UI package managers whose README, manifest or source was read

| Extension id | Installs | Last update | Surface | Highlights (self-reported unless marked GH) | Weak spots seen |
|---|---|---|---|---|---|
| `patcx.vscode-nuget-gallery` (NuGet Gallery) | 746 850 | 2026-05-19 (1.2.6) | Panel area webview view | BROWSE and INSTALLED tabs only [GH:packages-view.ts:34-36]; infinite scroll [GH:packages-view.ts]; details with Author(s), License link, Project Url, Tags, Dependencies [GH:package-details.ts]; per-project install, update and uninstall buttons [GH:project-row.ts]; reads `nuget.config`, ClearTextPassword only [RM]; OpenTelemetry gated on `vscode.env.isTelemetryEnabled` [GH:telemetry.ts:17-23] | No Updates tab; CPM versions read as null (reads the `Version` attribute only) [GH:project-parser.ts:20-28]; verb-first `dotnet add … package` through a `ShellExecution` task [GH:update-project.ts] |
| `aliasadidev.nugetpackagemanagergui` (NuGet Package Manager GUI) | 296 698 | 2024-08-27 (2.1.1) | Editor webview | Multi-project, "Update all packages with one click", search/install, BaGet/GitLab/Nexus/Azure/ProGet [RM] | Sources and **basic-auth passwords in `settings.json`**; edits the project XML itself [RM] |
| `jmrog.vscode-nuget-package-manager` | 1 648 203 | 2017-12-02 (1.1.6) | Command Palette | Add or remove a PackageReference via the palette [RM] | Strips XML comments (known issue); unmaintained since 2017 [RM] |
| `FullStackSpider.visual-nuget` (Visual NuGet) | 40 526 | 2024-08-30 | Editor webview | VS-like, forwards to the dotnet CLI [RM] | Author says it is unmaintained [RM] |
| `nuget-workbench.nuget-workbench` | 665 | 2026-10-13 | Panel webview | Browse/Installed/Updates/**Vulnerabilities**/**Consolidate** tabs; **deprecation banner with alternative**; transitive with "through which reference"; CPM version source labels (`CPM`, `override`); inline update hints in project files; project tree with checkboxes; credential provider and password scripts; VS Code proxy [RM] | Sources in `settings.json`; VS Code ≥ 1.87 [RM] |
| `I-Synergy.i-synergy-nugetpackagemanager` | 24 | 2026-03-26 | Panel webview | Same feature table as NuGet Workbench (fork lineage) [RM] | VS Code ≥ 1.110 [RM] |
| `sockless-coding.vs-code-nuget-manager` | 28 | 2026-08-31 | Editor webview | Browse/Installed/Updates/**Consolidate**; dependency tree; deprecation and vulnerability badges incl. transitive; **cool-down for freshly published versions in Update All**; **Pin/Unpin** (`[x.y.z]`); **Convert to CPM** [RM] | Falls back to editing project files directly without an SDK [RM] |
| `Averenium.averenium-nuget-manager` (AVE NuGet Manager) | 31 | 2026-09-20 | Panel webview (movable; "Open in New Window") | Package **families** and update groups with rollback on NU1605; vulnerabilities from `dotnet list package --vulnerable`; **licence-change warnings**; per-framework versions; **nuget.config chain editor incl. packageSourceMapping**; **Block updates**; agent skill for breaking-change review; "no telemetry"; HC/forced-colours borders [RM] | Licence data behind an experimental flag [RM] |
| `coresync.nuggy` (Nuggy) | 11 | 2026-08-06 | Panel webview | Upgrade badges by **target-framework compatibility**; CPM writes `PackageVersion`; byte-exact edits; runs `dotnet nuget why` on restore failures; `packages.config` read-only; **UI in 4 languages** (`nuggy.language`) [RM] | Needs `.sln`/`.slnx`; VS Code ≥ 1.106 [RM] |
| `itskarmaoff.vscode-nuget-manager` (Nugget) | 137 | 2026-07-16 | Editor webview | VS-like Browse/Installed/Updates; README preview; vulnerabilities tab with fixed versions; **warning markers in the version picker**; credentials in VS Code SecretStorage; local folder feeds [RM] | – |
| `baliestri.nuget-code` (NuGet Manager for VS Code) | 166 | 2026-10-01 | Panel webview, Rider-style | Installed/Discover; Sources incl. **effective configuration** and edit; **cache folders with sizes and clear**; integrated log with level filters; own proxy setting [RM] | Own proxy setting rather than VS Code's alone [RM] |
| `nifty.nifty-nuget` | 28 | 2026-10-10 | Palette + list | Patch/minor/major update labels; **Update all with "skip majors"**; vulnerability report incl. transitive; "no telemetry", sets the dotnet CLI opt-out [RM] | nuget.org only [RM] |
| `JRBye.vscode-dotnet-cpm` | 146 | 2026-07-14 | Webviews | CPM-first: categories in `Directory.Packages.props`; **pre-install vulnerability warning**; transitive conflict detection (NU1608) [RM] | CPM only [RM] |
| `ManagedCode.managedcode-nuget-package-manager` | 6 | 2026-10-12 | Sidebar webview | Update whole **package families** (`Microsoft.*`); version policy (All/Stable/…); bundled .NET 10 engine and CLI tool [RM] | Does not add or remove references [RM] |
| `FinstadProductions.nuget-pilot` | 5 | 2026-06-25 | Activity bar webview + pop-out | Read-only CPM diagnostics (missing central versions, project-level versions in CPM, unused central versions) as VS Code diagnostics [RM] | Write actions on the roadmap [RM] |
| `Wutname1.nuget-compass` | 23 | 2026-06-17 | – | Versions filtered to those **compatible with the project's TFM**; patch/minor/major update level [RM] | Early development [RM] |
| `onurkarakus.package-hub`, `PiyushDoorwar.getll`, `vctdev.easy-nuget-manager`, `nlabs.nlabs-nuget-manager`, `KaruhutKomol.yet-another-nuget-package-manager`, `RL-Dev.nuget-manager`, `kavod-io.vscode-nuget-installer`, `MAXMA.nuget-vscode` | 3–911 | 2024–2026 | webviews | Install, update and remove variants; nothing beyond the rows above in their READMEs (skimmed) | – |

#### 3.2a-matrix Marketplace managers against the same feature rows

✓ present, – absent from what was read, n/v not stated. Sources: `[RM]` README or changelog; `[GH]` source of NuGet
Gallery. "Absent" means only that the README or the source read does not claim it.

| Feature | NuGet Gallery `[GH]` | aliasadidev `[RM]` | jmrog `[RM]` | NuGet Workbench `[RM]` | sockless `[RM]` | Averenium `[RM]` | Nuggy `[RM]` | Nugget `[RM]` |
|---|---|---|---|---|---|---|---|---|
| Search | ✓ + infinite scroll | ✓ | ✓ palette | ✓ as you type, page size | ✓ all feeds | ✓ catalog | ✓ nuget.org | ✓ |
| Prerelease | ✓ | per source setting | n/v | ✓ | ✓ | ✓ setting | n/v | ✓ |
| Version pinning / floating | – | `*` supported (2.1.0) | – | n/v | ✓ Pin `[x.y.z]` | ✓ Block updates | n/v | n/v |
| Dependency view | ✓ details deps | – | – | ✓ transitive + via | ✓ tree | ✓ restore graph | `dotnet nuget why` on failure | ✓ transitive |
| Vulnerabilities | – | – | – | ✓ tab, severity, transitive | ✓ incl. transitive | ✓ `--vulnerable` | n/v | ✓ tab + picker marks |
| Deprecation | – | – | – | ✓ banner + alternative | ✓ | n/v | n/v | n/v |
| License | link | – | – | ✓ details | n/v | ✓ change warning | n/v | n/v |
| README / changelog | – | – | – | n/v | n/v | n/v (release-notes agent skill) | n/v | ✓ README |
| Update all | – | ✓ | – | ✓ | ✓ with cool-down | ✓ groups / families | n/v | n/v |
| Consolidate | – | – | – | ✓ tab | ✓ tab | n/v | n/v | n/v |
| Sources + credentials | config read, ClearText only | settings.json basic auth | – | NuGet.config, cred provider, password script | ✓ authenticated feeds | ✓ chain editor incl. mapping | n/v | ✓ SecretStorage, local folders |
| CPM | – (reads `Version` attr only) | n/v | – | ✓ version-source labels | ✓ + Convert to CPM | n/v | ✓ writes PackageVersion | n/v |
| Offline / cache | – | – | – | n/v | n/v | n/v | analysis offline | README from local cache |
| Multi-project install | ✓ per project | ✓ | ✓ choose project | ✓ project tree | ✓ checkboxes | ✓ scope | per project | project picker |
| Restore | skipRestore setting | – | – | n/v | n/v | ✓ rollback on NU1605 | ✓ debounced | n/v |
| Keyboard / context menu | – | – | palette | "full keyboard + ARIA" | n/v | Explorer context menu | – | Explorer context menu, editor title |
| Telemetry | OTel, gated on VS Code | n/v | n/v | n/v | n/v | "no telemetry" | n/v | n/v |
| Localization | – | – | – | n/v | n/v | n/v | ✓ en/fr/es/de | n/v |

#### 3.2b Adjacent tools (not package managers, but users compare them)

| Extension id | Installs | Relevance |
|---|---|---|
| `ms-dotnettools.csdevkit` | 18 426 214 | See §3.1. The de-facto default; ships NuGet commands, the C# Project Details view and (11.x) package CodeLens. |
| `pflannery.vscode-versionlens` | 2 554 803 | CodeLens with latest versions in project files; README sections on vulnerabilities, deprecations and unlisted versions [RM]. |
| `tintoy.msbuild-project-tools` | 680 675 | PackageReference id and version completion [RM]. |
| `fill-labs.dependi` | 768 939 | Multi-ecosystem version hints incl. C#/F#; paid tier for vulnerability reports [RM]. |
| `TimHeuer.nuget-config-editor` | 249 | Table editor for `nuget.config` sources and **package source mappings** [RM]. |
| `TimHeuer.nupkg-viewer`, `eridem.vscode-nupkg` | 1 210 / 63 876 | View a `.nupkg` [MKT]. |
| `RuanduPlessis.dependency-explorer` | 20 | Full tree with OSV.dev vulnerability flags, "Why Is This Here?", Fix All Vulnerabilities across projects [RM]. |
| `JFrog.jfrog-vscode-extension` | 97 356 | Security scanning incl. NuGet [MKT]. |
| `Streamlined.nuget-explorer`, `sgryt.nuget-dependency-graph`, `VinayD24.slimdep` | 92 / 521 / 10 | Dependency tree, 3D graph, unused-reference detection [MKT]. |

#### 3.2c Listed only (name and description from `[MKT]`; README not read)

`leo-labs.dotnet`, `matijarmk.dotnet-core-commands`, `jesschadwick.nuget-reverse-package-search`, `Ionide.Ionide-Paket`,
`JakubKozera.csharp-dev-tools`, `maxbrister.vscode-nuget-package-manager-improved`, `BogdanTasciuc.nuget-gallery-mgr`,
`fforjan.nuget4code`, `9paradox.nuget-package-source`, `nosa.nugetmanager`, `sorvy.nuget-package-tool`,
`reswob.nuget-package-manager`, `itn3000.open-nuget-site`, `EmreCebeci.nuget-quickfix`, `Cloudsmith.cloudsmith-vsc`,
`elltg.elltg-nuget-package-manager` ("Update and Unify", i.e. consolidate), `NuGet-Package-Upgrade.nuget-package-upgrade`,
`RamtejDevLabs.nuget-lens`, `nulifyer.guget` (TUI), `nickprotop.lazynuget` (TUI), `ckob.lazydotnet` (TUI),
`zero8urn.octothorpe-package-manager`, `semic.dotnet-nuget`, `danisss9.dotnet-cli-plus`, `jackcoral.package-nuget-upgrade`,
`AbYzzX.aoh-nuget-intellisense`, `slobodan-dusanic.vscode-nuget-switcher`, `ReadyStack.nuget-commercial-license-gate`,
`nifty.nifty-licenses`, `RustyDaemon.code-licenses`, `xsyetopz.versionlens-redux`, `koltyakov.fresh-deps`,
`djain912.depcart`, `CyberXYZ.cyberxyz-vulnerability-scanner`, `HuntedLabs.depsdiver-assist`, `Arcane-Spark.ubel-vscode`,
`benjdiasaad.dep-health-dashboard`, `Kontra.pacmon`, plus Business Central AL feeds (`eos-solutions.gordon`,
`jeffreybulanadi.al-packagist`, `365businessdevelopment.365businessdev-alget`, `PatrickSchiefer.al-nuget-helper`,
`AxiansInfoma.bc-symbols-downloader`). Two hits are spam ("…Crack…", "…License-Key").

Context, not a finding: `[MKT]` lists `Gasrulle.nuiget` at 1.18.9 (2026-10-10) with 83 installs; 2.0.0 is not
published yet (D9).

### 3.3 What the field converges on

Visual Studio, C# Dev Kit 11 and at least six 2026 Marketplace extensions add the same four things on top of
install, update and remove:
1. a vulnerability view that includes transitive packages;
2. deprecation with the suggested alternative;
3. consolidation of version drift across projects;
4. in-file signals in `.csproj` and `Directory.Packages.props` (CodeLens, inline hints, diagnostics).

nUIget 2.0 has a partial (1) and none of (2) to (4).

## 4. Gaps: features they have that nUIget lacks

Each row: user benefit · evidence · cost · protocol or ADR change · risk · decision relevance for 2.0.0.

### G1 — Deprecation is shown nowhere (medium, decision-relevant)
- **Benefit:** a team learns that a package it uses is legacy, has critical bugs or has a named successor, and sees
  the alternate package. VS has warned about this on the Installed tab since 16.3.
- **Evidence:** [F:vs-deprecate] ("Visual Studio warns about a deprecated package's usage on the `Installed` tab …
  reason … alternate package"). Competitors: NuGet Workbench "Deprecation banner" [RM]; sockless [RM]; Version Lens
  README section "Can I see package deprecations?" [RM]. The Extensions view exemplar has `@deprecated`
  [F:vscode-ext]. nUIget has no `deprecat` hit in `src` (grep); `PackageMetadata` and `PackageMetadataLite` have no
  field for it (`src/protocol/domain.ts:113-133,189-197`).
- **Cost:** 1.5–2 d. Breakdown: registration catalogEntry `deprecation` parse 0.5; domain fields and generated
  `docs/protocol.md` 0.25; Installed and Updates badge, details section with alternate link, `@deprecated` filter 0.75;
  tests 0.25.
- **Protocol/ADR:** **yes**. `domain.ts` (`PackageMetadata`, `PackageMetadataLite`) is under `src/protocol/**`. No new
  request.
- **Risk:** the lite metadata for installed rows comes from a search `packageid:` lookup (`search.ts:260`). Whether
  nuget.org's search response carries deprecation is n/v. If it does not, each installed package needs a registration
  read: more requests on the Installed tab (perf gate). Clients do not show the publisher's custom message
  [F:vs-deprecate].

### G2 — Transitive vulnerabilities are invisible until expanded and never counted (medium, decision-relevant)
- **Benefit:** the vulnerability signal agrees with what `dotnet restore` reports. `NuGetAuditMode` defaults to `all`
  for net10.0 ([F:vs-auditing] footnote 1), so the build warns NU1901–NU1904 for a transitive package while nUIget's
  Installed tab shows no count and `@vulnerable` lists nothing.
- **Evidence:**
  - VS 17.8 "Show vulnerabilities in transitive packages … in PMUI" (#8756) and the Solution Explorer infobar (#12398)
    [F:vs-6.8]. NuGet Workbench, sockless and nifty scan transitive packages [RM].
  - nUIget's transitive section starts collapsed and loads on expand (`TransitiveSection.tsx:36-50`, `useState(false)`
    then `transitive.enable()`).
  - The count covers direct packages only (`MainShell.tsx:187-190`), and `@vulnerable` filters direct rows only
    (`InstalledProjectSection.tsx:46-58`). `TransitiveSection` takes no filter (`InstalledTab.tsx:225`).
- **Cost:** 1 d. Load the transitive list eagerly (it reads the assets file, no `dotnet` call), ask
  `transitive/metadata` for it, count and filter transitive rows, auto-expand the transitive section under
  `@vulnerable`.
- **Protocol/ADR:** no. `transitive/get` and `transitive/metadata` exist (`messages.ts:125-126`). The interaction
  model §2 and §4 need edits.
- **Risk:** hundreds of transitive ids per project mean one vulnerability match each. Each source's advisory index
  is cached for an hour (`vulnerability.ts`), so the cost is local after one download. Lite enrichment also fetches
  icons for them: measure with `npm run bench` and the perf marks.

### G3 — Vulnerability data ignores `auditSources` and `NuGetAuditSuppress`; without a vulnerability resource nUIget reports "none" (high, decision-relevant)
- **Benefit:** Microsoft recommends using a single upstreaming private feed in place of nuget.org. In such an
  organisation the private feed often has no `VulnerabilityInfo`, and the audit data comes from `auditSources`
  (`https://data.nuget.org/v3/index.json`). Today nUIget tells such users there are **no** vulnerabilities, where
  `dotnet restore` warns. Advisories the repository suppressed with `NuGetAuditSuppress` still show as Vulnerable.
- **Why "none" and not "unknown"** (code reading; not executed):
  1. `DefaultVulnerabilityClient.forPackage` keeps only the allowed sources that have a `vulnerabilityInfoUrl`
     (`vulnerability.ts:107-108`). When none has one, `data` is `[]` and it returns
     `{ vulnerabilities: [], sourcesUnavailable: false }`, because `[].some(…)` is false (`vulnerability.ts:122`).
  2. The enricher then writes `lite.vulnerabilities = []` (`enricher.ts:71-73`).
  3. `@vulnerable` takes the `'No vulnerable packages.'` branch, because the metadata map is not empty
     (`InstalledProjectSection.tsx:49-58`).

  This contradicts the repository's own rule "Empty is not unknown … leave `vulnerabilities` absent, never `[]`"
  (gotcha table, P4.6–P4.8). The same happens per package under package source mapping: a package mapped only to
  sources without the resource gets `[]`. No test covers a source set without vulnerability data: the only
  `withData = false` source in `vulnerability.test.ts:54` sits beside two that have data.
- **Evidence:** [F:vs-auditing] (Audit Sources; "NuGet AuditSources support in the Visual Studio Package Manager UI",
  NuGet 7.0 / VS 2026; NuGetAuditSuppress). VS Options has a "Use separate sources for vulnerability audit" table
  [F:vs-options]. nUIget asks only the package's allowed sources (`vulnerability.ts:107-108`); no `auditSource` or
  `NuGetAudit` hit in `src` (grep).
- **Quick fix inside 2.0 rules (no contract change, 0.25 d):** return `sourcesUnavailable: true`, or a distinct "no
  data" outcome, when no allowed source offers `VulnerabilityInfo`, so the field stays absent ("unknown"). Add the
  test. Whether Azure Artifacts, GitHub Packages or other private feeds publish `VulnerabilityInfo` is n/v.
- **Cost:** 1–1.5 d. Read `<auditSources>` in `NuGetConfigReader`, carry it in the project's feed context, query
  those sources for vulnerability data. `NuGetAuditSuppress` items need the MSBuild evaluation (an item type in
  `MsBuildProjectEvaluator`): +0.5 d.
- **Protocol/ADR:** webview protocol no. The core context (`src/core/contracts.ts:301-312`,
  `ProjectExecutionContext.sourceUrls`) probably needs an audit-source field: a contracts.ts change under D6 (n/v until
  designed). ADR-005's outbound policy should state that audit sources receive package ids (the mapping does not apply
  to them).
- **Risk:** sending every installed id to the audit source is what NuGet restore does. It has to be documented,
  because nUIget markets "a package mapped to a private feed never has its id sent to nuget.org" (CHANGELOG 2.0.0
  line 38).

### G4 — No remediation path: vulnerable versions unmarked, no "update vulnerable" (low–medium, decision-relevant)
- **Benefit:** the user can pick a safe version and fix every vulnerable package in one step.
- **Evidence:**
  - VS marks vulnerable versions in the version dropdown (fix #12623) [F:vs-6.8].
  - `dotnet package update --vulnerable` updates "to the first version without known vulnerabilities" (NuGet 7.0 /
    SDK 10) [F:vs-auditing].
  - Nugget has warning markers in the version picker [RM]; RuanduPlessis has "Fix All Vulnerabilities" [RM].
  - In nUIget the version list is plain strings (`messages.ts:138`), and the Updates rows do not say whether the update
    removes an advisory (`domain.ts:96-104`).
- **Cost:** 1–1.5 d (versions with vulnerable flags, a dropdown marker, an "Update vulnerable" bulk action through the
  existing bulk dialog).
- **Protocol/ADR:** **yes** (the `package/versions` result gains per-version flags; or a new request).
  `dotnet package update --vulnerable` could serve the bulk action through the runner (ADR-003 command builder
  addition, n/v whether its CPM behaviour matches the mutator's rules).
- **Risk:** CPM projects (N77 preview rules apply); multi-source advisory merge.

### G5 — No Consolidate (medium, decision-relevant)
- **Benefit:** find and fix projects that reference different versions of the same package, which Microsoft calls
  bad practice.
- **Evidence:** VS "Consolidate tab" [F:vs-install]. NuGet Workbench and I-Synergy Consolidate tab [RM]; sockless [RM];
  `elltg` "Update and Unify" [MKT]. Rider: not found [F:rider-ref]. nUIget: no `consolidat` in `src` (grep).
- **Cost:** 1.5 d. A webview view (an `@consolidate` filter or a third tab under All Projects) computed from the
  `allProjects/installed` chunks, a dialog that lists the target version per project, tests and interaction model.
- **Protocol/ADR:** **no**. `ops/bulkUpdateAllProjects` takes `ProjectBulkUpdate[]` = project + `{id, version}`
  (`messages.ts:47-51,162`), and the data is already streamed (`messages.ts:129`).
- **Risk:**
  - Central rows are consistent by construction. `central-override` rows go through plain `ops/update` (gotcha
    table).
  - Conditioned references (`targetFrameworks`, `domain.ts:58-59`) can differ on purpose.
  - A downgrade can raise NU1605.
  - Floating and range rows must be excluded (as the details pane does, `DetailsPane.tsx:107`).

### G6 — A transitive package cannot be promoted to a direct reference (medium, decision-relevant)
- **Benefit:** override a vulnerable transitive version until the top-level package is fixed. This is Microsoft's own
  recommended remediation ("Add the fixed package version as a direct package reference") [F:vs-auditing].
- **Evidence:** VS: "promote any transitive dependency to a top-level dependency at any time"
  [F:vs-transitive-blog]. nUIget's transitive view has "no version selector, no actions" (`interaction-model.md:156-158`).
- **Cost:** 0.75–1 d (version selector and Install on the transitive view, reusing `useInstallAction`).
- **Protocol/ADR:** no (`ops/install`, `cpm/preview` exist). The interaction model §7 must change.
- **Risk:** in a CPM project the install creates or uses a central entry (preview path N77). CPM transitive pinning
  (`CentralPackageTransitivePinningEnabled`) is not modelled (n/v). Pairs with G2.

### G7 — Browse has no paging and no empty-query listing (low)
- **Benefit:** browse beyond the first 20 to 100 hits; discover popular packages.
- **Evidence:**
  - VS Browse displays "packages by popularity" before any query [F:vs-install]. Infinite scroll in VS is n/v.
  - NuGet Gallery pages on scroll (`PackagesScrollEvent`, `noMorePackages`) [GH:packages-view.ts].
  - NuGet Workbench `pageSize` 50 [RM].
  - nUIget: `search/query` has `take` only (`messages.ts:134`), default 20 (`handlers.ts:303`).
- **Cost:** 1.5 d.
- **Protocol/ADR:** **yes** (`skip`, or a cursor).
- **Risk:** results are merged and ranked across sources and then sliced (`search.ts:227`), so a stable second page
  needs a per-source cursor. Medium.

### G8 — Package source mapping is invisible and cannot be edited (low, decision-relevant)
- **Benefit:** nUIget's strongest security property becomes visible: which source(s) a package may come from, and
  which mapping is missing. Editing mappings needs no XML.
- **Evidence:**
  - VS shows the status in the details pane ("Package source mapping is off" / "Package source mapping found",
    Configure, 17.7), creates mappings automatically on install (17.8), and has an Options page with Add/Edit/Remove
    [F:vs-psm][F:vs-options].
  - `TimHeuer.nuget-config-editor` and Averenium edit mappings [RM].
  - nUIget reads mappings (`NuGetConfigReader.ts:21,76`), but `NuGetSource` carries no patterns (`domain.ts`
    `NuGetSource`).
  - "There are no nuget.exe or dotnet.exe commands for managing the package source mapping configuration"
    (NuGet/Home#10735) [F:vs-psm].
- **Cost:** status in details 0.5–1 d; mapping editor 2–3 d.
- **Protocol/ADR:** status **yes** (a field or a request). Editing **yes** plus an **ADR-003 amendment**: there is no
  CLI to do it, so nUIget would have to write `nuget.config` XML itself.
- **Risk:** XML round-trip fidelity (TimHeuer's README admits best-effort comment preservation [RM]).

### G9 — No Command Palette workflows (medium, decision-relevant)
- **Benefit:** a keyboard-first, workbench-native path that works without opening the panel: add a package to a
  project, update one, update all, remove one, restore, open the package in the manager.
- **Evidence:**
  - C# Dev Kit "NuGet: Add NuGet Package" / "Update" / "Remove" QuickPick flows [F:csdk-pm][RM:csdevkit manifest].
  - jmrog (1.6 M installs) is palette-only [RM]; nifty [RM]; NuGet Workbench commands [RM].
  - The Extensions view exemplar has "Update All Extensions" and "Show Extension Updates" commands [F:vscode-ext].
  - nUIget's palette shows 3 commands; the rest are hidden (`package.json` `menus.commandPalette`).
- **Cost:** 1–1.5 d. Host-only commands over the Catalog and the operation queue, reusing the QuickPicks of
  `pickers.ts`.
- **Protocol/ADR:** no (extension-host commands; `package.json` contributes).
- **Risk:** low. CPM installs must keep the `cpm/preview` gate (N77), as the sidebar's modal does.

### G10 — No signals in project files (low–medium, decision-relevant with caveat)
- **Benefit:** outdated, vulnerable or deprecated references are visible where they are declared. A row can open the
  file and line that declares its version (`definedIn`).
- **Evidence:**
  - C# Dev Kit 11 prerelease: "Package CodeLens actions highlight available updates and known vulnerabilities"
    [RM:csdevkit changelog l.605].
  - Version Lens CodeLens, 2.55 M installs [RM][MKT]; NuGet Workbench inline hints [RM]; NugetPilot diagnostics
    [RM].
  - nUIget has no `showTextDocument` or `openTextDocument` in `src/host` or `src/extension.ts` (grep), although
    `InstalledPackage.definedIn` exists (`domain.ts:56-57`).
- **Cost:** open-declaring-file 0.5 d; Problems diagnostics for vulnerable/deprecated 1.5 d; CodeLens 2 d (needs
  element offsets; whether the project inspector keeps them is n/v).
- **Protocol/ADR:** open-file **yes** (a new request such as `ui/openFile`, and `guards.ts`). Diagnostics and CodeLens
  are host-only: no protocol change.
- **Risk:** duplicate lenses next to C# Dev Kit and Version Lens. It sits outside the "built-in views" direction, so
  the owner has to decide whether it belongs there. Diagnostics are the most native of the three.

### G11 — Sources cannot be edited (low)
- **Benefit:** rotate a PAT or change a URL without removing and re-adding the source, which loses its position.
- **Evidence:** VS Options "Add, Edit, and Remove" [F:vs-options]; Rider edit [F:rider-using]; baliestri edit [RM].
  nUIget: add, remove, enable, disable only (`messages.ts:149-152`; `SourceSettingsDialog.tsx`).
- **Cost:** 1 d.
- **Protocol/ADR:** **yes** (`sources/update`, `guards.ts`). The command is `dotnet nuget update source` (CLI command
  n/v in this session; it fits ADR-003's dotnet-only mutation).
- **Risk:** DPAPI-encrypted passwords on Windows; renaming a source breaks mappings keyed by name.

### G12 — License: no acceptance prompt, no licence text, no licence-change warning (low)
- **Evidence:** VS "You might be prompted to accept license terms" [F:vs-install]; View License dialog (#12060)
  [F:vs-6.8]. Averenium warns when an update changes the licence [RM]. nUIget: link only (`DetailsInfo.tsx:53-55`); no
  `requireLicenseAcceptance` in `src` (grep).
- **Cost:** 1–1.5 d.
- **Protocol/ADR:** **yes** (`PackageMetadata` fields).
- **Risk:** n/v whether `dotnet package add` enforces acceptance. If it does not, nUIget would be the only gate.

### G13 — No Restore action outside the transitive banner; the interaction model promises one in the header (low, decision-relevant)
- **Evidence:** `interaction-model.md:87` ("Restore project(s) | Transitive banner, header"); the header renders only
  the Restore-after-operations checkbox (`MainShell.tsx:237`); no restore command in `package.json`. The parity audit
  closure note keeps "the header Restore action" open (`parity-audit-2026-10-16.md:109-111`). VS has the "Restore NuGet
  Packages" command [F:vs-options]; Rider has a toolbar Restore with Force [F:rider-ref].
- **Cost:** 0.25–0.5 d.
- **Protocol/ADR:** no (`ops/restore`, `messages.ts:158`).
- **Risk:** low. This is documentation-versus-tree drift, which `docs:check` does not catch.

### G14 — Details lack owners, tags, release notes and a package-page link (low)
- **Evidence:** VS 17.11 owners as profile links [F:vs-install]; NuGet Gallery shows Tags and links the nuget.org page
  [GH:package-details.ts, packages-view.ts]; the Extensions view exemplar has a "Changelog" section [F:vscode-ext].
  nUIget: `DetailsInfo.tsx:48-70`, with no owners, tags or releaseNotes in `domain.ts:113-133`.
- **Cost:** 0.5–1 d.
- **Protocol/ADR:** **yes** for owners, tags and release notes. No for a package-page link, which can be built from id
  and source in the webview for nuget.org.

### G15 — No update policies: semver labels, skip majors, ignore or pin, cool-down (low)
- **Evidence:** nifty "skip major versions" [RM]; Compass and ManagedCode update levels [RM]; Averenium Block updates
  [RM]; sockless Pin and the fresh-version cool-down [RM]; Extensions view per-item "Auto Update" toggle
  [F:vscode-ext].
- **Cost:** patch/minor/major label on update rows 0.25 d (no protocol: `PackageUpdate` has both versions,
  `domain.ts:96-104`); ignore list 1 d.
- **Protocol/ADR:** the ignore list needs persisted state (layout or settings), so probably a protocol change.

### G16 — No solution scope (.sln/.slnx) (low–medium, decision-relevant: reopens D2)
- **Evidence:** ADR-000 "2.0 does not parse solution files" (`docs/adr/000-...md:40-41`). VS manages "for the
  solution" [F:vs-install]; Rider "Installed packages across the solution", "Upgrade all packages in Solution"
  [F:rider-using]; Nuggy, Averenium and baliestri pick a solution [RM].
- **Cost:** 2 d (`dotnet sln list` for `.sln`/`.slnx`, a session scope).
- **Protocol/ADR:** **yes** (session/project domain) plus an ADR-000 amendment.
- **Risk:** medium. All Projects semantics and the harness scenarios change.

### G17 — Cache management beyond the HTTP cache (low)
- **Evidence:** VS "Clear NuGet Local Resources" (http-cache, global-packages, temp, plugins-cache) [F:vs-options];
  Rider Folders tab with sizes [F:rider-ref]; baliestri [RM]. nUIget has "Clear NuGet HTTP Cache" (`README.md:104`).
- **Cost:** 0.25–0.5 d (a QuickPick over `dotnet nuget locals <kind> --clear`).
- **Protocol/ADR:** no.

### G18 — No preview of the whole change and no dependency-behaviour options (low)
- **Evidence:** VS "Show preview window", Dependency behavior, File conflict action, Remove dependencies [F:vs-install].
  nUIget previews CPM impact only (`messages.ts:166-167`).
- **Cost:** high (a restore dry run). Not worth it for SDK-style `PackageReference`, where most of these options do
  not apply ("only for certain project types" [F:vs-install]).

### G19 — No contributed keybinding (low)
- **Evidence:** `package.json` `contributes.keybindings` is null; the Extensions view is ⇧⌘X / Ctrl+Shift+X
  [F:vscode-ext]; Rider Alt+Shift+7 [F:rider-ref].
- **Cost:** 0.1 d.
- **Protocol/ADR:** no.
- **Risk:** collisions with built-in or popular keybindings. Pick an unbound chord, or contribute none and document
  `workbench.view.extension.nuiget-sidebar`.

### G20 — English only (low; D11)
- **Evidence:** ADR-000:42. C# Dev Kit localizes its manifest [RM:csdevkit manifest]; Nuggy ships 4 languages [RM].
- **Cost:** manifest `package.nls.json` 0.5 d; webview strings 3–5 d.
- **Decision:** deferred by D11; noted, not scored.

### G21 — No target-framework compatibility filter for versions (low)
- **Evidence:** Compass and Nuggy [RM]; VS n/v. nUIget shows dependency groups per framework only
  (`DetailsInfo.tsx:83-103`).
- **Cost:** 2–3 d (NuGet framework-compatibility rules in TypeScript).
- **Risk:** high (correctness of the compatibility reducer).

Out of scope, recorded for completeness: the Package Manager Console (VS, Rider [F:rider-using]); `packages.config`
and non-SDK projects (VS supports both [F:vs-install]; ADR-000:43 rules them unsupported); Rider's `T:`/`N:` type
search (a nuget.org type index is n/v today).

### X findings found while checking the gaps (interaction, not missing data)

- **X1 — The main panel has no right-click or Shift+F10 menu** (medium, decision-relevant).
  - `Listbox` supports `onContextMenu` (`Listbox.tsx:40-41,168-171,218-222`), but only sidebar lists pass it
    (`BrowseResults.tsx:151`, `ProjectPackages.tsx:94`, `ProjectUpdates.tsx:102`), and `ui/contextMenu` is handled by
    `SidebarHost.ts:27` alone.
  - In the main panel, copy id, install another version, uninstall from a Browse row and open on nuget.org are
    therefore pointer-and-pane only.
  - Workbench exemplar: the Extensions view's right-click "Install Another Version", "Auto Update", … [F:vscode-ext].
  - The native mechanism is `contributes.menus["webview/context"]` with `data-vscode-context` on the row
    [context7 /websites/code_visualstudio_api, webview guide]. It was proposed in July 2022 (1.70, issue #156224);
    the exact stable version is n/v but believed below the 1.85 floor.
  - Cost 0.5–1 d. No protocol change (manifest menus plus host commands, or the existing `ui/contextMenu` registered
    on the main host).
- **X2 — The sidebar never shows a vulnerability** (medium, decision-relevant).
  - The only `vulnerab` hits in `src/webview/sidebar` are the `@vulnerable` exclusion (`SidebarView.tsx:46,120-121`),
    while the shared `InstalledProvider` fetches the lite metadata that carries vulnerabilities (parity row DP10).
  - Rendering a compact warning mark on sidebar rows makes DP10's cost worthwhile instead of removing it.
  - Cost 0.5 d. No protocol change.

## 5. Parity-audit rows still open (`docs/plans/parity-audit-2026-10-16.md`, closure table lines 25-98)

All 20 rows were re-checked on `main` at `e4d6e97`. Each is still open as written. The checks:
- `SidebarView.tsx:177,198` (SB2);
- `SectionHeader.tsx:51` (SB13);
- `SidebarView.tsx:108` (SB14);
- no `prewarm` caller in `src/webview` (MI11, MB13);
- `BrowseResults.tsx:5,183` has no TrashIcon or onDelete (SB9);
- `InstalledSection.tsx:135` keeps the `!all.active` guard (SB10);
- no entity decoding in `BrowseList.tsx`/`DetailsInfo.tsx` (MB17);
- no ArrowLeft/ArrowRight in `Listbox.tsx` (MB18);
- no `onExitTop`/`onArrowDown` (SB7).

| Id (audit line) | Gap | Letter | Sev | Cost (audit's) | Protocol/ADR | Risk | 2.0.0? |
|---|---|---|---|---|---|---|---|
| SB2 (970) | `@installed`/`@updates` in the sidebar shows a collapsed, empty section if the user had collapsed it | X | medium (verified OK by the audit) | 0.1 d | no | low | **yes** |
| SB7 (1050) | No ArrowDown from the sidebar search box into the list, no ArrowUp back | X | medium | 0.5 d | no | low | **yes** |
| SB9 (1070) | Sidebar Browse: no Uninstall action or Delete key on an installed result; `+` shown when installed everywhere | X | medium | 0.5 d | no | low | **yes** |
| MB3 (521) | Search results wait for icon and lookup enrichment of every row before the first row renders | X | medium | 1 d | **yes** (a `found` chunk on `search/query`, D6 ⚑); revisit trigger "two consecutive over-target cold runs" (`docs/perf-baseline.md:49`) | medium | **yes** (owner ruling) |
| DP3 (1205) | Icon breaker: five real 404s still silence a source until Refresh (partly closed) | X | high (residue lower) | 0.5 d | no (ADR-006 silent on it) | low | **yes** |
| MI7 (215) / DP8 (1287) | Vulnerable badge has no severity or count on the row (the tab count is done) | X | medium / low | 0.5 d / 0.25 d | no (`severity` is in `PackageVulnerability`, `domain.ts:136-141`) | low; colour kept out on purpose | **yes** (bundle with G2) |
| DP10 (1307) | The sidebar pays for lite enrichment it never renders | X | low | 0.5 d | no | low | via X2 |
| MI10 (245) / MU8 (420) | No Collapse all / Expand all on the Installed and All Projects Updates toolbars | X | low | 0.5 d each | no | low | no |
| MI11 (255) / MB13 (661) | No hover prefetch; `package/prewarm` has no caller | X | low | 0.5 d each | no | low | no |
| MI12 (265) | All Projects headers: count always shown, no hover background (partly) | X | low | 0.25 d | no | low | no |
| MB16 (691) | After the prerelease toggle the version selector keeps its version; the list is unbounded | X | low | 0.25 d | no | low | no |
| MB17 (701) | HTML entities in search and registration descriptions shown literally (n/v that feeds send them) | X | low | 0.25 d | no | low | no |
| MB18 (711) | ArrowLeft/ArrowRight no longer switch Details/README from the list | X | low | 0.5 d | no | low | no |
| MB19 (721) | Browse first load announces nothing (accessibility-adjacent) | X | low | 0.25 d | no | low | no |
| SB10 (1080) | No provisional badge on All Projects project headers in the sidebar | X | low | 0.25 d | no | low | no |
| SB13 (1110) | Sidebar count badge shows 0 and sits beside the spinner (a deliberate 2.0 choice) | X | low | 0.1 d | no | low | owner choice |
| SB14 (1120) | The sidebar search box is focused only on `ui/focusSearch` | X | low | 0.1 d | no | low | no |

## 6. What nUIget has that they lack: keep it and market it

| Strength | Evidence in nUIget | Contrast |
|---|---|---|
| Package source mapping applied to **every** metadata read (search, versions, details, icons, updates, vulnerabilities); a private-only config never contacts nuget.org | `README.md:146`; `src/core/feeds/policy.test.ts:124,134`; CHANGELOG 2.0.0 line 38 | VS PM UI browse and update lookups "send the requested package IDs to all configured sources" (#12783) [F:vs-psm]; `dotnet list package --deprecated` ignores mapping [F:vs-deprecate]. No Marketplace README claims it. |
| Per-project source resolution through the SDK (`dotnet nuget list source` in the project's directory, `<clear/>` honoured) | `README.md:141-144` | NuGet Gallery merges configs itself [RM]; NuGet Workbench merges like NuGet [RM]; aliasadidev keeps sources in `settings.json` [RM] |
| Credential chain: environment endpoints, ClearText with `%VAR%`, **DPAPI `Password` with the `NuGet` entropy**, Azure Artifacts provider (netcore, non-interactive); never logged | `README.md:175-205`; gotcha table | NuGet Gallery skips encrypted `Password` [RM]; aliasadidev stores plaintext passwords in settings [RM] |
| CPM done safely: impact preview, `VersionOverride`, refuses edits with unsaved files, never `--no-restore` on CPM | `README.md:38-43`; `messages.ts:166-167`; D7 | NuGet Gallery reads no central version [GH:project-parser.ts]; most READMEs only "detect" CPM |
| Provisional then MSBuild-evaluated lists (conditions, imports, SDK implicit references) | `README.md:44-47`; ADR-009 | Competitors parse XML (NuGet Gallery [GH]) |
| An unreachable source is never "no updates" or "no results" | `README.md:52-55`; interaction-model §4 | n/v elsewhere |
| VS Code proxy, PAC and OS certificates; no own proxy setting | `README.md:56-58`; ADR-005 | baliestri has its own proxy setting [RM] |
| No telemetry; `DOTNET_CLI_TELEMETRY_OPTOUT=1` | `DotnetRunner.ts:28` | NuGet Gallery ships OpenTelemetry [GH:telemetry.ts] (gated on VS Code's setting) |
| One shared context for panel and sidebar, an operation queue in the status bar, outcome toasts, the output channel | `README.md:59-63,73` | – |
| Unlisted versions skipped in update suggestions; exact pins never offered | `README.md:69`; ledger N6 | – |
| Accessibility: listbox semantics, every action on a key, HC and forced colours, reduced motion, axe checks in CI | `README.md:71-72`; interaction-model §5; `src/test/lint/*` | Averenium and NuGet Workbench make similar claims [RM] |
| Lowest host floor: VS Code 1.85 | `package.json` engines | Workbench 1.87, Nuggy 1.106, I-Synergy 1.110, baliestri 1.100 [RM] |
| Security hardening: SSRF and redirect guard, nuspec DOCTYPE refusal, host-side README images under CSP | gotcha table; ADR-006 | n/v elsewhere |
| Multi-root grouping by workspace folder; remote-ready (`extensionKind: workspace`) | `README.md:30-33,253-256` | Remote not verified by nUIget's own tests (`README.md:256`) |
| Transitive "Required by" lists every top-level id per framework | `domain.ts` `TransitivePackage` | VS tooltip names "one direct package" [F:vs-auditing] |

## 7. Recommendations for the plan (for the owner; not decisions)

1. **2.0.0 candidates.** None needs a protocol change. Total about 2.75–4.25 d:
   - the G3 quick fix: "no vulnerability resource" must read as unknown, not none;
   - G2 together with MI7/DP8 (severity and count, transitive included);
   - X2 (sidebar vulnerability mark, which turns DP10 to use);
   - G13 (header Restore, which closes doc drift);
   - SB2, SB7, SB9;
   - G19 if a free chord exists.
2. **2.0.x with a contract-change item.** One D6 item covering G1 (deprecation), G4 (vulnerable version flags) and the
   MB3 `found` chunk would share one `domain.ts`/`messages.ts` edit and one `docs/protocol.md` regeneration.
3. **The UX overhaul, native-first.** G9 (palette flows), X1 (`webview/context` menus), G5 (Consolidate), G6 (promote
   transitive), G10 diagnostics before CodeLens.
4. **Needs a ruling first.** G3 (audit sources: an outbound-policy and ADR-005 wording change), G8 editing (ADR-003),
   G16 (D2).

## 8. Sources fetched

| Key | URL | Date on page |
|---|---|---|
| vs-install | https://learn.microsoft.com/en-us/nuget/consume-packages/install-use-packages-visual-studio | ms.date 2026-04-10 |
| vs-auditing | https://learn.microsoft.com/en-us/nuget/concepts/auditing-packages | updated 2026-07-07 |
| vs-deprecate | https://learn.microsoft.com/nuget/nuget-org/deprecate-packages | ms.date 2026-07-16 |
| vs-options | https://learn.microsoft.com/en-us/nuget/consume-packages/nuget-visual-studio-options | ms.date 2026-09-29 |
| vs-psm | https://learn.microsoft.com/en-us/nuget/consume-packages/package-source-mapping | ms.date 2026-07-16 |
| vs-6.8 | https://learn.microsoft.com/nuget/release-notes/nuget-6.8 | ms.date 2026-04-14 |
| vs-transitive-blog | https://devblogs.microsoft.com/nuget/introducing-transitive-dependencies-in-visual-studio/ | 2022-08-09 |
| rider-using | https://www.jetbrains.com/help/rider/Using_NuGet.html | Rider 2026.2, 2026-08-10 |
| rider-ref | https://www.jetbrains.com/help/rider/Reference_Windows_NuGet.html | Rider 2026.2, 2026-06-22 |
| rider-vulnapi | https://jetbrains.com/help/rider/VulnerableApi.html | 2024-02-11 (2026.2 help) |
| csdk-pm | https://code.visualstudio.com/docs/csharp/package-management | 2024-12-13 (predates C# Dev Kit 11) |
| vscode-ext | https://code.visualstudio.com/docs/configure/extensions/extension-marketplace | n/v |
| context7 | `/websites/code_visualstudio_api` "webview/context" | — |
| MKT | gallery extensionquery API, terms "nuget" (pages 1–2), "csproj", "dotnet package" | 2026-10-22 |
| GH | `gh api repos/pcislo/vscode-nuget-gallery` (HEAD pushed 2026-06-16; 89 stars, 24 open issues, MIT) | 2026-10-22 |
| search snippets | WebSearch results for Rider deprecation (2020.2) and CPM (2022.3) blog posts | snippets only |

## 9. Not reachable

- https://blog.jetbrains.com/dotnet/2024/05/29/9-things-you-didn-t-know-about-jetbrains-rider-s-nuget-support/ (HTTP 403)
- https://blog.jetbrains.com/dotnet/2022/11/07/nuget-central-package-management-comes-to-jetbrains-rider/ (HTTP 403;
  linked from the search results, not fetched again)
- https://www.jetbrains.com/help/rider/VulnerablePackage.html (HTTP 404)
- The Marketplace web item pages (JavaScript-rendered); the gallery API was used instead.
- VS Code 1.70 release notes for webview context menus (not in the search results; issue #156224 named by a search
  snippet only).

## 10. Known gaps in this research

- No competitor was installed or run. Every `[RM]` claim is the author's own description.
- Visual Studio keyboard shortcuts, context menus, telemetry and localization were not verified; nor were CPM support
  in the VS PM UI and Rider, Rider's vulnerability and deprecation display, or VS infinite scroll.
- Whether nuget.org's search response carries `deprecation` (it decides G1's request cost) was not checked.
- `dotnet nuget update source` and `dotnet package update --vulnerable` behaviour under CPM were not probed.
- Open VSX was not searched; Marketplace terms were limited to "nuget", "csproj" and "dotnet package".
- No GitHub issue scan of nUIget or the competitors (user signals are another dimension's letter, W).
- The 2.0 PNG captures and the 1.18.9 screenshots were not opened: no finding here rests on a picture.
- Cost figures are estimates by analogy with the parity audit's own estimates, not measurements.

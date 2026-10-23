# Architecture constraints for the nUIget UX overhaul

Research sweep of 2026-10-22, dimension **architecture**. Repository `/Users/mattias/github/nuiget`, branch `main` at
`e4d6e97`, read-only: no file under the repository was changed (`git status --porcelain --untracked-files=all` empty
after every command, including the bundle measurement, which built into the scratchpad).

Question answered: what the 2.0 protocol, the store slices, the primitives, the host and the build make cheap or
expensive to change, and which overhaul proposals need a change of a frozen contract (`src/protocol/**`,
`src/core/contracts.ts`, `docs/adr/**`, plan D6).

Evidence legend: `path:line` = read in the repository at `e4d6e97`. `[1.85:file:line]` = VS Code `release/1.85` source
fetched with `gh api` into `scratchpad/research/arch-src/` (or, for `r185/index.html`, the copy another agent fetched
into `scratchpad/research/vscode-src/r185/`). `[doc:…]` = a page fetched in this session (URLs in §11). `[cmd]` = a
command run in this session, output quoted. "Hypothesis" marks anything not verified.

---

## 0. Summary

1. **Most of the overhaul is webview-only.** §8 assesses every proposal (about 70 rows, some duplicated across the
   two input reports). The data the visible IA fixes need (keyboard model, Enter/Delete semantics, Restore button,
   Consolidate, promote transitive, transitive vulnerabilities, severity on badges, collapse/expand all, hover
   prefetch, search↔list keys, sidebar vulnerability marks, sidebar Update all per project, "this update fixes the
   advisory") is already on the wire. Host- or manifest-only: native menus, editor-title actions, sidebar
   description/badge, keybindings and categories, palette flows, diagnostics, cache commands, a panel serializer,
   fewer toasts. **A frozen-contract change is needed only for:** new row or details fields (downloads, deprecation,
   license and size on rows, owners, tags, release notes, license acceptance, mapping status), any new setting the
   webviews read (density, row style, ignore list), per-version vulnerability flags, Browse paging, the MB3 `found`
   chunk, source editing, precise cross-surface navigation, `ui/contextMenu` on the main panel, audit sources, and
   solution scope (rows marked `C:` in §8).
2. **The native-chrome levers need no protocol change, and they are verified on the 1.85 floor.**
   - `webview/context` menus work in the main panel **and** in the sidebar view: the webview's context keys are the
     merged `data-vscode-context` objects plus `webviewId = providedViewType` `[1.85:webviewElement.ts:279-301]`, and a
     webview view's `providedViewType` is its view id `[1.85:webviewViewPane.ts:178]`. The command receives the
     context object as its argument (`shouldForwardArgs`, `getActionsContext`).
   - Today the native menu is **blocked by nUIget's own code, not by the platform**: `Listbox` calls
     `event.preventDefault()` on a row's `contextmenu` (`src/webview/shared/primitives/Listbox.tsx:218-223`), and the
     1.85 webview bootstrap returns early on `e.defaultPrevented` (`[1.85:r185/index.html:1104-1108]`).
   - Editor-title actions for the panel: `activeWebviewPanelId` is bound to the panel's `providedViewType`
     `[1.85:webviewWorkbenchService.ts:266]`, documented `[doc:when-clause-contexts:270]`.
   - The sidebar can show the source as a view **description** and a count as a view **badge**: `WebviewView`
     exposes both at 1.85 `[1.85:webviewViewPane.ts:224-228]`; `SidebarHost.updateTitle` sets only `title`
     (`src/host/SidebarHost.ts:298-310`).
3. **Every new user-facing setting the webviews read is a contract change.** `ExtensionConfig` lives in
   `src/protocol/domain.ts:340-349`. A density or row-style setting therefore costs a D6 item even though it is
   "only a setting"; the only contract-free alternatives are per-webview `getState` (not shared, not in the Settings
   UI) or a value baked into the HTML at render time (`renderWebviewHtml`'s `dataset`, `src/host/services.ts:103-110`),
   which updates only when the webview is rendered again.
4. **New row content is a contract change, but often a cheap one in data.** `PackageMetadataLite`
   (`domain.ts:189-197`) has no downloads, deprecation, license or size. Download counts are **already fetched and
   then dropped**: the lite lookup reads the search entry (`src/core/feeds/search.ts:269-272`) whose `totalDownloads`
   the row mapping keeps (`search.ts:304`), but `toLiteMetadata` copies only id, version, authors, description and
   verified (`search.ts:377-383`). Deprecation of the **latest** version is in the same search response
   (`[doc:search-api]`: "The deprecation associated with the latest package version"); the installed version's
   deprecation is in the registration `catalogEntry` (`[doc:registration-api]`), which costs a registration read per
   package on the Installed tab.
5. **Contract-change procedure dominates small contract items.** A domain-only optional field touches no guard
   (`guards.ts` validates type names and `isRecord(payload)` only, `src/protocol/guards.ts:16-40,61-67`) and no
   generated doc row (domain types appear by name in `docs/protocol.md`), but it still needs an advisor ruling and the
   `.claude/.contract-change` sentinel (plan D6, `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:50`; hook
   `scripts/hooks/guard.mjs:9,36`). A new request or event additionally needs the guard record, ADR-007, a regenerated
   `docs/protocol.md`, the count test and payload table in `src/host/handlers.test.ts` and the count in
   `ARCHITECTURE.md:41` (the P9.9 checklist, `src/protocol/STATUS.md:5-29`). **Bundle every contract need of the
   overhaul into one or two D6 items.**
6. **Two hidden contracts:** a new Catalog read is an ADR-009 amendment ("no use case is added to the Catalog
   without amending this record", `docs/adr/009-catalog.md:18`), and a new `ResourceKey` kind is a `domain.ts` change
   plus the ADR-002 scope table plus `src/core/queries/scopes.ts`, which must equal it (`docs/adr/002-query-coordinator.md:20-47`).
   Webview-side aggregates (Consolidate over `allProjects/installed` chunks) avoid both.
7. **The bundles have about 5 % headroom and no shared chunk.** Measured `[cmd]`: `webview.js` 548,943 / 577,766
   (28,823 left), `sidebar.js` 333,252 / 351,245 (17,993 left), `extension.js` 297,018 / 322,502 (25,484 left). Both
   webviews are separate `iife` bundles (`esbuild.mjs:68-89`); 313,766 bytes of `webview.js` are inputs it shares with
   the sidebar, 209,855 of them `react-dom`. A component library or a second icon set crosses a ceiling (the
   component-base dimension measured +113.7 kB for option B). CSS output and fonts are **not** measured
   (`esbuild.mjs:23`).
8. **The CSP was never the obstacle to codicons.** `font-src ${cspSource}` admits bundled fonts
   (`src/host/services.ts:111-118`, asserted verbatim at `src/host/handlers.test.ts:605-608`), and `resources/**`
   passes the VSIX allow-list (`scripts/check-vsix-contents.mjs:10-18`). An `@font-face` in the bundled CSS is
   blocked by the build (esbuild would need a loader or an external for `url()`, and `dist/*.ttf` is not allowed);
   the build-free route is a font URI from `asWebviewUri` handed over through `renderWebviewHtml`'s `dataset` (the
   `data-package-icon` precedent, `services.ts:106-108`) and loaded with the `FontFace` API (not exercised).
9. **Native menus executed host-side leave rows not-busy while queued.** A command run from `webview/context` or a
   QuickPick submits through `operations.*` and `settleOperation` (as `SidebarHost.showContextMenu` does,
   `SidebarHost.ts:117-238`); the webview learns of it only through `ops/progress` (running) and `ops/completed`,
   because a queued operation has no `ops/progress` and only `useOpsActions().run()` marks a row busy from the call
   (`src/webview/shared/store/ops.tsx:204-209`). This is the one UX compromise the native menu forces, unless the
   command hands the action back to the webview, which needs a new event (contract).

---

## 1. The frozen contracts and what a change costs

### 1.1 What is frozen and how it is enforced

| Item | Evidence |
|---|---|
| Frozen paths: `src/protocol/**`, `src/core/contracts.ts`, `docs/adr/**` | plan D6 `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:50`; hook predicate `scripts/hooks/guard.mjs:36` (`lower === 'src/core/contracts.ts' \|\| lower.startsWith('src/protocol/') \|\| lower.startsWith('docs/adr/')`) |
| Unlock: sentinel `.claude/.contract-change` holding the item id, created **after** the advisor's recorded approval, deleted before commit; `git commit` is denied while it exists | plan D6 `:50`, L2 `:92`; `scripts/hooks/guard.mjs:9` |
| Not frozen, but generated and CI-checked: `docs/protocol.md` (from `messages.ts`) | `docs/protocol.md:1`; ADR-007 `docs/adr/007-protocol.md:26-27` |
| Not frozen, but CI-checked for drift: `ARCHITECTURE.md` 2.0 section, `docs/ux/interaction-model.md`, gotcha table, `README.md` settings/commands tables | gotcha "A document names something that does not exist" (`.github/copilot-instructions.md`), `npm run docs:check` |

### 1.2 Cost of the kinds of contract change (procedure, not code)

The real checklist is the last request added, `ui/reportError` at P9.9 (`src/protocol/STATUS.md:5-29`).

| Kind of change | Files that must change | Procedure | Order of magnitude |
|---|---|---|---|
| Optional field on a domain type (`PackageMetadataLite.totalDownloads`, `ExtensionConfig.density`) | `domain.ts`; producers in `src/core` or `src/host`; consumers in the webviews | advisor ruling + sentinel; no guard change (guards check only `isRecord(payload)` and the type name, `guards.ts:61-67`); `docs/protocol.md` usually unchanged because domain types are rendered by name (`docs/protocol.md:17-30`) | 0.25 d procedure + the code |
| Optional field on a request payload or result inline in `messages.ts` (`package/versions` result gains `vulnerable?`) | `messages.ts`, producers, consumers, `docs/protocol.md` regenerated | as above + `npm run docs:protocol` | 0.25–0.5 d procedure + code |
| New request | `messages.ts`, `guards.ts` (`REQUEST_TYPE_RECORD`, enforced by `satisfies`, `guards.ts:16-34`), handler in `src/host/handlers.ts` or a host, `docs/protocol.md`, ADR-007 bullet ("the 46th request"), `src/host/handlers.test.ts` payload table (`:120-166`), count test and `hostOnly`/`resourceReads` lists (`:170-173`), `ARCHITECTURE.md:41` count | full D6 item; P9.9 needed a follow-up ruling for the count test alone (`src/protocol/STATUS.md:43-68`) | 0.5 d procedure + code |
| New event | `messages.ts` `EventMap`, `guards.ts` `EVENT_TYPE_RECORD` (`:36-40`), `ARCHITECTURE.md:41` ("11 events"), ADR-007 | full D6 item | 0.5 d procedure + code |
| New Catalog read (host-side use case) | `src/core/catalog/Catalog.ts`, **ADR-009 amendment** ("no use case is added to the Catalog without amending this record", `docs/adr/009-catalog.md:18`) | D6 for the ADR | 0.25 d procedure + code |
| New `ResourceKey` kind | `resourceKeys` in `domain.ts:224-238`, ADR-002 scope table (`docs/adr/002-query-coordinator.md:20-28`), merge table (`:33-45`), `src/core/queries/scopes.ts` "must equal them" (`:47`) | D6, two frozen files | 0.5–1 d |
| `contracts.ts` interface (e.g. `SourceProvider.update`, an audit-source field on `ProjectExecutionContext`) | `src/core/contracts.ts:281-312` and all implementations and fakes | D6 | 0.25 d procedure + code |
| Comment-only edit in a frozen file that drives a generated artefact (`// sidebar` → `both` on `ui/contextMenu`) | `messages.ts:173` (the trailing comment feeds the Surface column, `scripts/gen-protocol-docs.mjs:47`), `docs/protocol.md:56` | D6 even though no type changes | 0.25 d |

Recommendation for the plan (not a decision): collect every field the overhaul needs (§8 "C" rows) into **one** D6
item early, so one ruling, one sentinel window and one regeneration cover them.

---

## 2. The protocol as it stands

| Fact | Evidence |
|---|---|
| 45 requests, 11 events, one envelope set (request, cancel, stream, response, event) | `src/protocol/messages.ts:108-183,192-206`; `ARCHITECTURE.md:41`; `src/protocol/envelope.ts:1-9` |
| Exactly one terminal response per request; unknown type → `unsupported`; dispose → `disposed`; cancel → `cancelled` | `src/host/WebviewHost.ts:127-162` |
| A request not registered on a host answers `unsupported`: `ui/contextMenu`, `ui/openSourceSettings`, `ui/viewPackage` are host-only | `WebviewHost.ts:128-131`; `src/host/handlers.test.ts:170` |
| Both surfaces register the same shared handlers; only the three `ui/*` above differ | `src/host/MainPanelHost.ts:69-77`; `src/host/SidebarHost.ts:26-29` |
| Resource responses carry `generation`; `resources/invalidated` lists keys with their generations; the webview drops a stale answer | `envelope.ts:48-54`; `messages.ts:195-196`; `src/webview/shared/store/useResource.ts:84-95` |
| `package/versions` returns `string[]` only; `package/metadata` returns `PackageMetadata \| null`; neither carries a generation (N70) | `messages.ts:138-139`; `src/host/handlers.ts:310-318` |
| Lite metadata (`transitive/metadata`) answers any list of `{id, version}`; it is not a cached resource | `messages.ts:126`; `docs/adr/009-catalog.md:11`; `src/core/catalog/Catalog.ts:285-289` |
| `package/prewarm` warms the credentials and service index of a **source**, not a package; it has no caller in the webviews | `src/core/catalog/Catalog.ts:529-538`; feature-gaps parity rows MI11/MB13 |
| `ui/focusSearch` exists as an event and the main panel listens, but only `SidebarHost` sends it | `messages.ts:204`; `src/webview/main/MainShell.tsx:138`; `SidebarHost.ts:58-62` |
| `ui/selectProject { projectPath, initialTab }` exists (host → main) | `messages.ts:205`; `MainPanelHost.ts:36-39` |
| `ui/navigateToPackage { packageId, version? }` always lands in Browse with an exact search | `messages.ts:202`; `src/webview/main/features/search/useSearchTyping.ts:129-138` (ux-inventory D-18) |
| `LayoutPreferences` = `splitPosition` (global state) and `sidebarSectionSplit` (workspace state); the latter has **no webview reader or writer** (the sidebar keeps its split in webview state) | `domain.ts:333-338`; `src/host/handlers.ts:244-258`; `grep -rn sidebarSectionSplit src` → only `handlers.ts`, `domain.ts`, `legacyState.ts`, a STATUS note |
| `ExtensionConfig` = 4 `nuiget.*` settings + `workbench.tree.indent` + `isWindows`; `config/changed` fires on `nuiget` or `workbench.tree.indent` changes | `domain.ts:340-349`; `src/host/services.ts:88-100`; `src/extension.ts:338-341` |
| `NuGetSource` has name, url, enabled, configFile, isLocal: no mapping patterns, no credentials state, no audit flag | `domain.ts:143-150` |
| `PackageUpdate` has ids, both versions, icon, verified, authors, sourceUrl: no vulnerability or deprecation | `domain.ts:96-104` |

---

## 3. The store slices: what is cheap to change in the webviews

| Slice | What it holds | Cheap | Expensive / constraint | Evidence |
|---|---|---|---|---|
| `session` | committed snapshot + pending intents | reading committed vs presented state | features must request with `committed`, render toggles from `session`; never clear pending on any snapshot (gotchas) | `src/webview/shared/store/session.tsx:12-60` |
| `projects` | `projects/list`, follows `projects/changed` | — | must not re-request on `projects` invalidation (gotcha) | `projects.tsx:37-64` |
| `installed` | one `useResource` on `installed:<path>` + two-phase lite metadata via `transitive/metadata` | new row content derived from `result` + `metadata` | metadata is keyed by lower-case id only, for the shown project; new lite fields arrive for free once the contract carries them | `installed.tsx:37-100` |
| `updates` | `updates/get` with `found` chunks; retries on source recovery | per-row derived content (semver label from both versions) | no lite metadata of the **target** version is asked today; "update fixes the advisory" needs an extra `transitive/metadata` ask for `{id, latestVersion}` (existing request) | `updates.tsx:44-95` |
| `transitive` | `transitive/get` **prefetched 500 ms after the installed list is ready** (main panel only), then `transitive/metadata` for every row | counting/filtering transitive vulnerabilities in the single-project view needs no new request: the data is already loaded | the sidebar mounts with `prefetch={false}` (`src/webview/sidebar/index.tsx:30-34`); All Projects transitive is asked only on `enableTransitive()` | `transitive.tsx:37-65,80-100`; `TRANSITIVE_PREFETCH_MS` `:38` |
| `allProjects` | streamed installed chunks + metadata, updates, transitive | Consolidate, sidebar per-project Update all, cross-project views are reducers over these chunks | active only while the committed selection is All Projects; a single-project feature that needs every project's list must run its own stream (the multi-install dialog already does: `EMPTY_ALL_PROJECTS`, `allProjectsReducer` exported "the project picker keeps one of its own outside All Projects") | `allProjects.tsx:1-120` |
| `search` | `search/query` + `metadata` chunk, quick-search | UI over results | no paging (`take` only) | `search.tsx:16-80`; `messages.ts:134` |
| `details` | per-view selection, versions, metadata, README, stale flag | new sections that read existing `PackageMetadata` fields (license, size, published, dependencies, vulnerabilities) | new fields need the contract; versions are plain strings | `details.tsx:33-64,230-252` |
| `sources` | lazy `sources/list` + mutations | a redesigned dialog over the same 7 requests | edit, mapping, audit sources need new requests or fields | `sources.tsx:55-121`; `messages.ts:146-152` |
| `config` | lazy `config/get` + `config/changed` | reading the existing 6 fields | a new field is a `domain.ts` change | `config.tsx:15-41` |
| `ops` | busy set from `run()` (queued) and `ops/progress` (running) | busy marks for webview-started ops | host-started ops (QuickPick, native menu, palette) are busy only while **running** | `ops.tsx:186-230` |

Two shared rules make webview changes safe and cheap: `useResource` handles invalidation, staleness and retry for
every keyed read (`useResource.ts:51-117`), and each slice has its own context, so a new consumer re-renders only
for the slice it reads (`StoreProvider.tsx:16-21`; ADR-008 `docs/adr/008-webview-architecture.md:25-28`).

---

## 4. The CSP and what it forbids

**Exact string** (`src/host/services.ts:111-118`, asserted at `src/host/handlers.test.ts:605-608` with
`not.toContain('unsafe-inline')`):

```text
default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}'; connect-src 'none'
```

The nonce is 16 random bytes per render (`services.ts:135-138`); ADR-006 records the same string
(`docs/adr/006-icons-and-csp.md:19-23`).

| Directive | Forbids | Allows | Consequence for the overhaul |
|---|---|---|---|
| `default-src 'none'` | everything not listed (frames, media, workers, manifests, objects) | — | no `<iframe>` preview of a package page, no web worker for heavy parsing (hypothesis: a worker would need `worker-src`; not tested) |
| `img-src ${cspSource} data:` | any remote image | extension files and `data:` URIs | icons and README images must be fetched host-side and sent as `data:` (`readme/image`, `messages.ts:141-142`); any new image (owner avatars, badges from shields.io in READMEs) costs a host fetch through `Transport` |
| `style-src ${cspSource}` without `'unsafe-inline'` | `<style>` elements and `style="…"` attributes in parsed HTML | the bundled stylesheets; style changes through the CSSOM (React's `style` prop sets properties through the CSSOM) | README HTML from DOMPurify cannot keep inline `style` attributes (they are dropped by the browser); **repository convention is stricter than the CSP**: only `cssVars()` with `--nuiget-*` custom properties may go into a `style` prop (gotcha "Inline style in 2.0 webviews", ADR-006 `:20-22`), enforced by the primitive tests. A library that writes `style` attributes through `setAttribute('style', …)` would be blocked; one that adopts constructable stylesheets (Lit) is not, per the component-base dimension (`scratchpad/research/component-base.md:148-170`) |
| `font-src ${cspSource}` | remote fonts (Google Fonts, CDN codicons) | fonts shipped inside the extension | **codicon font is allowed by the CSP**; the font file goes in `resources/` (passes `ALLOWED_PATTERNS`, `scripts/check-vsix-contents.mjs:10-18`; `localResourceRoots` is the extension root, `MainPanelHost.ts:32`, `SidebarHost.ts:49`). Two routes: (a) `@font-face` in the bundled CSS: `esbuild` resolves the `url()`, so it needs a `file` loader (emits `dist/*.ttf`, which the allow-list rejects) or an `external` for `../resources/*`, and whether a relative `url()` in `dist/webview.css` resolves to `resources/` under the 1.85 resource scheme is **not verified**; (b) **contract-free and build-free**: the host already hands the webview an `asWebviewUri` resource through `renderWebviewHtml`'s `dataset` (`services.ts:106-108`, the `data-package-icon` precedent), and the webview can load a font from such a URI with the `FontFace` API, subject only to `font-src ${cspSource}` (this step is **not exercised**). Font bytes do not count toward the JS ceilings. The component-base dimension recommends regenerated inline SVGs instead (`component-base.md:330-334`) |
| `script-src 'nonce-…'` | inline scripts, `eval`, scripts without the nonce | the one bundle `<script nonce>` per page (`services.ts:130`) | a split bundle (ES modules + chunks) needs every chunk loaded by a nonce'd tag or by `import()` from the nonce'd module (hypothesis: a dynamic `import()` of a same-origin module inherits the nonce's trust in Chromium 114 — not verified); the build is `iife` today |
| `connect-src 'none'` | `fetch`, XHR, WebSocket from the webview | nothing | every byte of data crosses `postMessage`; a webview-side cache of feed data is the only "network" a feature can add |

---

## 5. What the host decides and the webview cannot

| Decision | Owner | Evidence | Implication |
|---|---|---|---|
| Committed project, source, prerelease, restore | host `SessionStore`, only writer | ADR-001 `docs/adr/001-session-store.md:13-22`; `handlers.ts:242` | webviews send intents; editor-title or palette commands can change the session host-side and both webviews follow `session/changed` |
| Normalisation (All Projects downgrade, missing project fallback, source validation) | host | ADR-001 `:19-21` | a "remember last project per workspace" or "solution scope" proposal is a session/ADR-001 change |
| Which directory a project-less read resolves sources for: the selected project's directory, else the **first workspace folder** | host `sourceDirectory` | `src/host/handlers.ts:32-39` | under All Projects in a multi-root workspace with different `nuget.config` files, Browse, versions, metadata and lite enrichment use the first folder's sources. A per-project details view under All Projects would need a `projectPath` (or directory) on `package/*` payloads: contract |
| Sidebar title, title-bar icons, QuickPicks (project, source, actions, version, projects-for-install, single project), CPM modal, toasts, progress notification, status bar | host (`SidebarHost.ts:81-110,117-296`; `pickers.ts:10-129`; `feedback.ts`; `extension.ts:274-284`) | — | any change to these is host-only, no contract |
| Main panel title "nUIget", icon, column, `retainContextWhenHidden` | host | `MainPanelHost.ts:29-33,61` | — |
| Main panel restore after a window reload | **nobody**: no `registerWebviewPanelSerializer` | `grep -n registerWebviewPanelSerializer src/extension.ts` → none; `extension.ts:149` registers only the view provider | the panel's tab, selection and split survive hide/show (`retainContextWhenHidden`) but the panel itself is not restored after a reload; adding a serializer is host-only (`package.json` activation event `onWebviewPanel:nugetManager`) |
| Sidebar webview state across reloads | VS Code, via the view's saved state | `[1.85:webviewViewPane.ts:144-150,184,196]` | `getState/setState` in the sidebar persists across window reloads; in the main panel it lasts for the panel's life |
| Which operations exist and their gates (CPM preview N77, `requireProject`) | host + core | `handlers.ts:21-26,56-147,403-405` | a new kind of operation (e.g. `dotnet package update --vulnerable`) is a new `ops/*` request (contract) + ADR-003 command builder |

### 5.1 Native chrome reachable without any protocol change (verified on 1.85)

| Lever | Verified fact | Evidence | Fits proposals |
|---|---|---|---|
| `webview/context` menu in the **main panel** | context = merged `data-vscode-context` objects, plus `webviewId = providedViewType`; command args = `{ ...context, webview: providedViewType }` | `[1.85:webviewElement.ts:279-301]`; `[1.85:r185/index.html:1104-1141]`; `[doc:webview-guide]` "data-vscode-context" | main actions menu (X1/D-01), overflow menu, open declaring file |
| `webview/context` menu in the **sidebar view** | a webview view is created with `providedViewType: this.id` | `[1.85:webviewViewPane.ts:176-182]` | replace the sidebar's actions QuickPick with a native menu (the ux-inventory left this open) |
| Native menu from a button or a key | dispatching a synthetic `contextmenu` event opens the native menu (the guide's split-button pattern); the 1.85 handler does not check `isTrusted` | `[doc:webview-guide]` "Dispatch contextmenu event on primary click"; `[1.85:r185/index.html:1104-1141]` | Shift+F10 / ContextMenu key on a row; a `…` overflow button on a toolbar |
| What blocks it today | `Listbox` prevents the default on a row's `contextmenu`; the 1.85 handler returns on `defaultPrevented` | `Listbox.tsx:218-223`; `[1.85:r185/index.html:1105-1108]` | the primitive must stop preventing the default where a native menu is wanted |
| Default Cut/Copy/Paste items | hidden by `preventDefaultContextMenuItems: true` in the context | `[doc:webview-guide]` | — |
| Editor-title actions on the panel | `activeWebviewPanelId` = the active panel's `providedViewType` | `[1.85:webviewWorkbenchService.ts:266]`; `[doc:when-clause-contexts:270]` | Refresh, Restore, Sources, prerelease toggle as native title-bar icons; the toggles' context keys `nuiget.prereleaseEnabled` / `nuiget.restoreEnabled` are already set (`SidebarHost.ts:35-36,43-44`) |
| Sidebar view description and badge | `WebviewView.description`, `.badge` (`{ value, tooltip }`) | `[1.85:webviewViewPane.ts:224-228,251-266]` | show the source name (D-04); an Activity Bar count (hypothesis: the workbench shows a view badge on the container icon as for Extensions; not verified) |
| Keybindings | `focusedView == 'nuiget.sidebarView'`, `activeWebviewPanelId == 'nugetManager'` | `[doc:when-clause-contexts:270]`; `[context7 when-clause-contexts]` (`focusedView`) | focus-search command; the host sends the existing `ui/focusSearch` event to the panel |

Rows carry data attributes already: the `Row` wrapper is `role="presentation"` with `data-index` and `data-testid`
(`src/webview/shared/primitives/Row.tsx:113-115`), and the gotcha "Attributes on the row wrapper" allows `data-*` there,
so a per-row `data-vscode-context` fits the existing rule.

---

## 6. The build: two bundles, no shared chunk, ceilings

| Fact | Evidence |
|---|---|
| Three esbuild builds: `extension` (node18, cjs), `webview` and `sidebar` (chrome114, **iife**) | `esbuild.mjs:9-17,49-61,68-95` |
| No code splitting: `format: 'iife'` cannot split; ADR-008 keeps separate bundles, "shared chunks only if a metafile shows a win" | `esbuild.mjs:75`; `docs/adr/008-webview-architecture.md:16-18` |
| Ceilings = measured × 1.1 at P8.2b; a crossing is a stop-and-ask, never a raise without a new measurement; CSS is not measured | `esbuild.mjs:19-24` |
| Measured now (`node scripts/measure.cjs` in the scratchpad, production options of `esbuild.mjs`, identical to `dist/` of 2026-10-17) | `webview.js 548943 / 577766 headroom 28823`, `sidebar.js 333252 / 351245 headroom 17993`, `extension.js 297018 / 322502 headroom 25484`; CSS `webview.css 36949`, `sidebar.css 26825` |
| Shared inputs between the two webview bundles | 313,766 bytes of `webview.js` output: `react-dom` 209,855, `shared/store` 29,935, `@tanstack/virtual-core` 25,003, `shared/primitives` 23,191, `react` 8,479 |
| Main-only weight | `highlight.js` 78,516 (core + 15 languages, `src/webview/main/features/details/markdown.ts:13-28`), `marked` 45,965, `dompurify` 30,089, `features/details` 22,996, `features/updates` 16,537, `features/installed` 16,053 |
| Sidebar-only weight | 22,469 bytes |
| VSIX allow-list | `dist/*.js`, `dist/*.css`, `resources/**`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE` (`scripts/check-vsix-contents.mjs:10-18`) |

Implications:
- The **sidebar has 18 kB**: rendering Consolidate, deprecation or severity in the sidebar costs bytes from the
  same budget as any new sidebar primitive. Moving a feature from main-only to shared code moves its bytes into both
  bundles.
- A **shared chunk** would need `format: 'esm'` + `splitting: true`, module scripts with the nonce, new ceiling keys
  in `esbuild.mjs`, `check:vsix` patterns for chunk names, and an ADR-008 amendment (frozen). Splitting moves
  `react-dom` and the shared store/primitives out of `dist/webview.js` and `dist/sidebar.js` into a chunk the ceiling
  table does not key, so the two measured files shrink while each page still loads the same bytes. That is headroom
  by redefinition of what the ceiling measures (entry file vs. entry plus its chunks per page), which the ratchet
  rule forbids without a new measurement ("never a raise without a new measurement", `esbuild.mjs:19-23`). It buys
  no per-page byte reduction: a ruling item, not a fix for the ceiling problem.
- If the overhaul needs main-panel bytes, the README stack (`highlight.js` + `marked` + `dompurify` = 154,570) is the
  only large main-only block; lazy-loading it needs code splitting (above) or moving README rendering to the host
  (`package/readme` would return sanitised HTML: contract change of the result's meaning and of ADR-006's
  "README images" path).

---

## 7. Persisted state

| State | Where | Evidence |
|---|---|---|
| Main list/details split | host `globalState` `nuiget.layout.splitPosition` via `layout/get`/`layout/set` | `handlers.ts:244-258`; `MainShell.tsx:109-114,297` |
| Sidebar Installed/Updates split | webview state (`getState/setState`), not the protocol's `sidebarSectionSplit` | `SidebarView.tsx:30-44,92-103`; `handlers.ts:246,252-257` (unused field) |
| Main tab | webview state | `MainShell.tsx:118-128` |
| Sidebar expanded sections | webview state | `SidebarView.tsx:92-103` |
| Main section collapse, details tab, filters | not persisted | ux-inventory §2.2 |
| Session | host `workspaceState` through `SessionStore` | ADR-001 `:22-23` |

Rule: ADR-001 puts surface-local state in the webview (`docs/adr/001-session-store.md:28-29`). So collapse-all,
remembered sections, density **per surface** and filters can persist with no contract change; anything that must be
shared between the two surfaces or shown in the Settings UI goes through `LayoutPreferences` or `ExtensionConfig`,
both in `domain.ts` (contract). The unused `sidebarSectionSplit` slot is evidence that host-kept layout was planned
and then not needed.

---

## 8. Every proposal: data, wire, slice, host, core, contract, cost

Legend for **Contract**: `—` none; `C:<file>` frozen file(s) to change; `ADR-n` frozen ADR to amend. **Cost** is
code in session-days (procedure for a contract item is extra, §1.2: about 0.25 d for a domain field, 0.5 d for a new
request or event, less when bundled). "W" = webview-only, "H" = host/manifest-only.

### 8.1 Proposals from the UX inventory (`scratchpad/research/ux-inventory.md` §6)

| # | Proposal | Data needed | On the wire today | Slice / webview change | Host change | Core | Contract | Cost |
|---|---|---|---|---|---|---|---|---|
| U1a | Main actions menu as native `webview/context` | row identity: id, versions, projectPath, origin, flags (implicit, props, central, floating) | yes: all in the row data the webview renders (`InstalledPackage`, `PackageUpdate`, `PackageSearchResult`) | `Row` gets `data-vscode-context` (wrapper accepts `data-*`, `Row.tsx:113-115`); `Listbox` stops `preventDefault` on rows and dispatches a synthetic `contextmenu` for Shift+F10 (`Listbox.tsx:168-171,218-223`) | `package.json` `webview/context` items with `when: webviewId == 'nugetManager' && …`; commands reuse `SidebarHost.showContextMenu` logic moved to a shared host module | — | — | 1–1.5 d. **UX compromise:** host-run ops are not busy while queued (§0.9); CPM confirmation becomes the host modal, not `CentralUpdateDialog` |
| U1b | Main actions menu through the existing `ui/contextMenu` QuickPick | same | yes: `ContextMenuRequest` (`messages.ts:90-100`) | wire `onContextMenu` in the three main lists | register `ui/contextMenu` on `MainPanelHost` (code only) | — | `C:messages.ts:173` trailing `// sidebar` → generated Surface column (`docs/protocol.md:56`); `handlers.test.ts:170` `hostOnly` | 0.5 d + 0.25 d procedure. QuickPick, not a menu: less native than U1a |
| U1c | In-webview menu (role `menu` primitive in a `Popover`) | same | yes | new primitive + layers stack | — | — | — | 1.5 d + bytes in both bundles if shared; least native |
| U2 | Enter shows details on main Updates; update moves to a secondary key or the menu | — | yes | `UpdatesTab.tsx:185`, `AllProjectsUpdates.tsx:106`; tests named `UpdatesTab.test.tsx:89` change behaviour (owner's call, not "weakening") | — | — | — | 0.25 d |
| U3 | One meaning of Enter on package rows across surfaces | — | yes | `ProjectPackages.tsx:91`, `BrowseResults.tsx:149`, `ProjectUpdates.tsx:100`, hints | — | — | — | 0.25–0.5 d |
| U4 | Delete key scope per list | — | yes (`ops/remove`) | `onDelete` on Updates lists | — | — | — | 0.1 d |
| U5a | Sidebar shows the source as the view description | source name for `selectedSource` | host has it (`catalog.sources`, `SidebarHost.ts:89-91`) | — | `this.view.description = …` in `updateTitle` (`SidebarHost.ts:298-310`); API at 1.85 `[1.85:webviewViewPane.ts:224-225]` | — | — | 0.1 d |
| U5b | Sidebar header line in the webview with project and source | session + sources | yes (`session`, lazy `sources` slice) | new header row | — | — | — | 0.25 d + sidebar bytes |
| U6 | Keybindings, command `category`, focus-search command | — | `ui/focusSearch` exists (`messages.ts:204`), main listens (`MainShell.tsx:138`) | — | `package.json` `keybindings`, `category`; `MainPanelHost` sends `ui/focusSearch` | — | — | 0.25 d |
| U7a | "View package details" from a sidebar row opens the matching tab and row | `origin` (installed/updates/browse), `projectPath` | no: `ui/viewPackage` and `ui/navigateToPackage` carry `{ packageId, version? }` only (`messages.ts:175,202`) | details/search slices select by origin | `MainPanelHost.navigateToPackage` passes it on | — | `C:messages.ts` (payload of one request + one event; `docs/protocol.md`) | 0.5 d + 0.25 d procedure |
| U7b | Same, by heuristic, no contract | — | yes | webview decides: if the committed project lists the id, select it in Installed (or Updates when it has an update) | — | — | — | 0.5 d; ambiguous when a package is both installed and updatable |
| U8 | Explicit Restore action (header and palette) | project paths | yes (`ops/restore`, `messages.ts:158`) | header button | palette command → `operations.restore` (`handlers.ts:84-94`) | — | — | 0.25 d |
| U9 | Details primary button semantics (D-06) | — | yes | `DetailsPane.tsx:37-44,201` | — | — | — | 0.25 d |
| U10 | Loading/busy announcements (D-07…D-09) | — | yes | primitives/features | — | — | — | 0.5 d |
| U11 | Microcopy consistency (§5.3 M1–M18) | — | — | strings | `pickers.ts`, `feedback.ts`, `package.json` | — | — (no user string lives in a frozen file; checked: `outcomes.ts` is `src/webview/shared/store`) | 0.5 d |
| U12 | Operation feedback: fewer toasts (D17 reopened) | — | — | live region stays | `src/host/feedback.ts` only | — | — | 0.25 d |
| U13 | Captures of non-happy states | harness | — | — | — | — | — | test harness work, other dimension (H) |

### 8.2 Proposals from the feature-gap analysis (`scratchpad/research/feature-gaps.md` §4–§5)

| # | Proposal | Data needed | On the wire today | Slice / webview | Host | Core | Contract | Cost |
|---|---|---|---|---|---|---|---|---|
| G1 | Deprecation badge, details section, `@deprecated` | `{ reasons, message?, alternatePackage? }` per installed version | no field anywhere (`domain.ts:116-134,189-197`); search entry type has none (`src/core/feeds/wire.ts:35-63`) | badge + details section + filter | — | parse `deprecation` in `registration.ts` (details: the catalogEntry is already read for `package/metadata`) and, for rows, either the search entry's **latest-version** deprecation (free: same lookup, `search.ts:269-272`) or a registration read per package (exact, one request per id; perf gate) | `C:domain.ts` (`PackageMetadata`, `PackageMetadataLite`) | 1.5–2 d (feature-gaps' estimate holds); the "n/v whether search carries deprecation" is **resolved: yes, latest version only** `[doc:search-api]` |
| G2 | Transitive vulnerabilities counted and filtered | lite `vulnerabilities` of transitive rows | **already fetched in the single-project main panel**: the slice prefetches `transitive/get` 500 ms after Installed is ready and then asks `transitive/metadata` for every row (`transitive.tsx:37-65,80-100`) | count in `MainShell.tsx:187-190`, filter in `TransitiveSection`, open under `@vulnerable`; All Projects must call `enableTransitive()` (stream exists, `messages.ts:131`) | — | — | — | **0.5 d** single-project (no new request), +0.5 d All Projects; cheaper than the 1 d estimated in feature-gaps G2 |
| G3a | No vulnerability resource ⇒ unknown, not none | — | — | — | — | `vulnerability.ts:107-122` returns "no data" → `enricher.ts:71-73` leaves the field absent | — | 0.25 d |
| G3b | Honour `auditSources` and `NuGetAuditSuppress` | audit source URLs per project; suppressed advisory URLs | no | — | — | `NuGetConfigReader`, feed context, evaluator item type | `C:contracts.ts` (`ProjectExecutionContext`, `:301-312`), `ADR-005` (audit sources receive ids regardless of mapping), possibly `ADR-004` (new evaluated item type) | 1.5–2 d |
| G4a | "This update fixes the advisory" on Updates rows | lite vulnerabilities of `{id, latestVersion}` | yes, through the existing `transitive/metadata` request | updates slice asks it for the target versions | — | — | — | 0.5 d; **perf gate**: the enricher does the search lookup, the icon and the vulnerability check together per `{id, version}` (`src/core/feeds/enricher.ts:51-56`), and the icon is resolved per version, so each Updates row adds an icon fetch; the vulnerability index itself is cached per source (feature-gaps G2 risk). A vulnerability-only ask would be a new request (contract) |
| G4b | Vulnerable versions marked in the version dropdown | per-version flags | no: `package/versions` → `string[]` (`messages.ts:138`) | details | — | flag versions against the cached advisory index | `C:messages.ts` (result field) + `docs/protocol.md` | 1 d |
| G4c | "Update vulnerable packages" bulk action | first non-vulnerable version per package | partly: with G4b the webview can pick versions and use `ops/bulkUpdate` (`messages.ts:160`) | dialog reuse (`UpdateAllDialog`) | — | — | via G4b only; using `dotnet package update --vulnerable` instead is a new `ops/*` request (C:messages.ts, guards.ts) + `ADR-003` | 0.5 d on top of G4b |
| G5 | Consolidate | every project's installed version per id | yes: `allProjects/installed` chunks (`messages.ts:129`); write via `ops/bulkUpdateAllProjects` (`:162`) | a reducer over chunks (the multi-install dialog's own stream pattern, `allProjects.tsx` exports `allProjectsReducer`); a webview aggregate needs **no new `ResourceKey`** | — | — | — (a core-cached "drift" resource would be `domain.ts` + ADR-002 + ADR-009) | 1.5 d; exclude `central`, floating, range and conditioned rows (N76/N77 gotchas) |
| G6 | Promote a transitive package to a direct reference | id, chosen version | yes: `ops/install` + `cpm/preview` | `TransitiveDetails` gets a version selector via `details` slice (today it asks no feeds for transitive rows, `details.tsx:213-214`) | — | — | — | 0.75–1 d |
| G7 | Browse paging / empty-query listing | `skip` or a cursor; per-source cursors | no: `take` only (`messages.ts:134`) | search slice pages | handler passes `skip` | merged ranking needs per-source cursors (`search.ts:227`) | `C:messages.ts` | 1.5 d |
| G8a | Package source mapping status in details | which sources a package may come from | no | details | — | `OutboundPolicy.allowedSourcesFor` exists (`contracts.ts:294-296`) | `C:domain.ts` or `C:messages.ts` (new field or request) | 0.5–1 d |
| G8b | Edit package source mapping | config XML write | no | dialog | — | XML writer (no CLI exists) | `C:messages.ts` + `ADR-003` (dotnet-only mutation) | 2–3 d |
| G9 | Command Palette workflows | catalog reads + queue | n/a (host) | — | commands over existing `Catalog` methods and `operations.*`, QuickPicks from `pickers.ts` | — | — (a **new** Catalog read would be ADR-009) | 1–1.5 d |
| G10a | Open the file that declares a reference | `definedIn` / project path | yes: `InstalledPackage.definedIn` (`domain.ts:57-58`) | row context | **via `webview/context` command args: no new request**; a webview button instead needs `ui/openFile` (C:messages.ts, guards.ts) | — | — (menu route) | 0.5 d; validate the path against the installed result, never trust webview input |
| G10b | Problems diagnostics / CodeLens in project files | installed + lite metadata | host-side | — | `DiagnosticCollection`, `CodeLensProvider` | element offsets (n/v whether the inspector keeps them) | — (if it reuses `catalog.installed` and `transitiveMetadata`) | 1.5–2 d |
| G11 | Edit a source | name, url, credentials | no (`messages.ts:149-152`) | dialog | handler | `SourceProvider.update` | `C:messages.ts`, `C:guards.ts`, `C:contracts.ts` (`SourceProvider`, `:281-291`) | 1 d + 0.5 d procedure |
| G12 | License acceptance prompt / text / change warning | `requireLicenseAcceptance`, license text, previous license | no (`PackageMetadata` has `license`, `licenseUrl` only, `domain.ts:121-122`) | dialog | — | catalogEntry field; license file from the nupkg | `C:domain.ts`; license text = new request `C:messages.ts` + ADR-006-style policy | 1–1.5 d |
| G13 | Restore action | as U8 | yes | — | — | — | — | 0.25 d |
| G14a | Owners, tags in details | search entry `owners`, `tags` | no field (`domain.ts:116-134`) | details | — | lookup keeps them | `C:domain.ts` | 0.5 d |
| G14b | Release notes | nuspec `releaseNotes` | no | details | — | `parseNuspec` field | `C:domain.ts` | 0.5 d |
| G14c | Link to the package page on its source | id, version, source URL | yes | build the nuget.org URL in the webview | `ui/openExternal` exists (`handlers.ts:417-424`) | — | — | 0.1 d |
| G15a | Patch/minor/major label on update rows | both versions | yes (`PackageUpdate`) | updates rows | — | — | — | 0.25 d |
| G15b | Ignore/pin updates | persisted ignore list | no | — | — | filter in `catalog.updates` or in the webview | `C:domain.ts` (`LayoutPreferences` or `ExtensionConfig`) unless kept per surface in webview state | 1 d |
| G16 | Solution scope | solution projects | no | session | session | `dotnet sln list` | `C:domain.ts` (session), `ADR-000` (D2), `ADR-001` | 2 d |
| G17 | Cache management | — | n/a | — | QuickPick over `dotnet nuget locals` | runner args | — (ADR-003 allows dotnet commands) | 0.25–0.5 d |
| G19 | Keybinding | — | — | — | `package.json` | — | — | 0.1 d |
| G21 | TFM-compatible versions | project TFMs, package TFMs | partly | details | — | compatibility reducer | `C:messages.ts` if filtered host-side | 2–3 d |
| X1 | = U1a/U1b/U1c | | | | | | | |
| X2 | Sidebar vulnerability mark | lite `vulnerabilities` | yes: the sidebar's `InstalledProvider` already asks `transitive/metadata` (`installed.tsx:62-87`) | render a compact mark | — | — | — | 0.5 d (+ sidebar bytes, 18 kB headroom) |
| SB2, SB7, SB9, SB10, SB13, SB14 | sidebar parity rows | — | yes | sidebar | — | — | — | 0.1–0.5 d each |
| MB3 | Search results stream before enrichment | a `found` chunk on `search/query` | no: the chunk is `metadata` only (`messages.ts:134`) | search slice | handler emits | Catalog search streams | `C:messages.ts` (chunk union) | 1 d |
| DP3 | Icon breaker residue | — | — | — | — | `icons.ts` | — | 0.5 d |
| MI7/DP8 | Severity and count on the Vulnerable badge | `PackageVulnerability.severity` | yes (`domain.ts:136-141`, in lite) | badge | — | — | — | 0.25–0.5 d |
| DP10 | Sidebar pays for lite enrichment it never shows | — | — | X2 uses it | — | — | — | via X2 |
| MI10/MU8 | Collapse all / Expand all | — | — | toolbar + section state; persist in webview state | — | — | — | 0.5 d |
| MI11/MB13 | Hover prefetch | metadata/versions of the hovered row | yes (`package/metadata`, `package/versions`); `package/prewarm` is per source only (`Catalog.ts:529-538`) | details slice prefetch | — | — | — | 0.5 d; perf gate (one registration read per hover) |
| MI12, MB16–MB19 | details/browse parity rows | — | yes | webview | — | MB17 HTML entities: core or webview | — | 0.25–0.5 d each |

### 8.3 The obvious design proposals named in the task

| # | Proposal | Data needed | On the wire today | Webview | Host | Core | Contract | Cost |
|---|---|---|---|---|---|---|---|---|
| P1 | Download counts on Installed rows | `totalDownloads` | **fetched and dropped**: the lookup's search row has it (`search.ts:304`), `toLiteMetadata` drops it (`search.ts:377-383`); `PackageMetadataLite` has no field (`domain.ts:189-197`) | row meta | — | 2 lines in `toLiteMetadata` | `C:domain.ts` | 0.25 d, zero extra requests |
| P2 | Deprecation badges on Installed rows | = G1 | | | | | `C:domain.ts` | = G1 |
| P3 | Details pane with more fields (owners, tags, release notes, deprecation, mapping status, license acceptance) | per field | `PackageMetadata` has description, authors, license, licenseUrl, projectUrl, totalDownloads, published, dependencies, readme, packageSize, vulnerabilities, offline, sourceUrl (`domain.ts:116-134`) | details | — | per field | `C:domain.ts` for every field not in that list | 0.5–1.5 d bundled |
| P4 | Overflow menu for toolbars | toolbar actions | n/a | a `…` button that dispatches a synthetic `contextmenu` with `data-vscode-context` (`webviewSection: 'installedToolbar'`) → native menu | `webview/context` items + commands; actions that need webview state (selected rows) must pass ids in the context, or stay as webview buttons | — | — | 0.5 d; same queued-busy compromise as U1a |
| P5 | Collapse / expand all | = MI10 | | | | | — | 0.5 d |
| P6 | Hover prefetch | = MI11 | | | | | — | 0.5 d |
| P7 | Keyboard bridge search ↔ lists | — | — | `SearchBox` + `Listbox` focus hand-off (SB7) | — | — | — | 0.5 d |
| P8 | Density setting | a setting both surfaces read live | no | tokens switch on a root attribute | `readExtensionConfig` (`services.ts:88-100`) | — | `C:domain.ts` (`ExtensionConfig`) + `package.json` setting + README settings table (docs:check). Contract-free variants: per-surface toggle in webview state, or a `data-*` attribute from `renderWebviewHtml`'s `dataset` (`services.ts:103-110`) that changes only when the HTML is rendered again (hypothesis: re-assigning `webview.html` keeps `getState`; not verified) | 0.5 d + procedure |
| P9 | User-facing setting for row style (comfortable/compact) | = P8 | | | | | `C:domain.ts` | = P8, bundle with it |
| P10 | Sidebar "Update all" per project (All Projects) | per-project updates | yes: `allProjects/updates` chunks; `ops/bulkUpdate` per project (`messages.ts:160`) | sidebar section header action | — | — | — | 0.25–0.5 d; exclude central rows (N76) |
| P11 | Consolidate versions across projects | = G5 | | | | | — | 1.5 d |
| P12 | Vulnerability counts on badges | = MI7/DP8 (+ G2 for transitive) | | | | | — | 0.25–0.5 d |
| P13 | Deprecation display | = G1 | | | | | `C:domain.ts` | 1.5–2 d |
| P14 | License display | rows: license expression | details: yes (`domain.ts:121-122`); rows: no (lite lacks it); the search entry carries `licenseUrl` (`wire.ts:57-60`) | row or details | — | lite mapping | rows: `C:domain.ts`; details: — | 0.25 d (details) / 0.5 d (rows) |
| P15 | Package size | `packageSize` | details: yes (`domain.ts:128`); rows: no | — | — | rows need a flat-container HEAD per package (perf) | rows: `C:domain.ts` | 0.25 d details (exists) / 0.75 d rows + perf gate |
| P16 | README images | images as `data:` | yes: `readme/image` (`messages.ts:141-142`), host fetch with auth, cap, policy (ADR-006) | eager vs lazy loading, placeholders; the capture `main-details-readme` shows alt texts while pending | — | — | — | 0.25–0.5 d |
| P17 | Sources dialog redesign | same 7 requests | yes (`messages.ts:146-152`) | webview layout | — | — | — for layout; edit = G11 (C), mapping = G8 (C), audit sources = G3b (C) | 1 d layout |
| P18 | Sources managed through native QuickPick/InputBox flows instead of a dialog | — | n/a | — | commands; password through `InputBox` with `password: true` (hypothesis on UX fit) | `SourceProvider` exists | — | 1 d |
| P19 | Main panel header actions as editor-title icons | — | n/a | header shrinks | `package.json` `editor/title` with `activeWebviewPanelId == 'nugetManager'`; commands change the session host-side | — | — | 0.5 d |
| P20 | Activity Bar / view badge with update count | updates count of the selected project | host can read `catalog.updates` (shared coordinator key with the sidebar's own request) | — | `view.badge` | — | — (a vulnerability count would need enrichment the host does not cache, or a webview → host report request: `C:messages.ts`) | 0.25 d |
| P21 | Main panel restored after a window reload | serializer | n/a | read `getState` on restore | `registerWebviewPanelSerializer` + activation event | — | — | 0.5 d |

---

## 9. Findings

Ledger letters H (constraint, fact) and X (where a constraint forces a UX compromise). `decisionRelevant` is true for
every finding that names a contract change or changes what the plan should build.

1. **H, high, decision-relevant — Native menus, editor-title actions and a sidebar description need no protocol
   change and work on 1.85; nUIget's own `Listbox` blocks the native menu.** Evidence §5.1.
   Proposal: build the main actions menu as `webview/context` (U1a) and treat the sidebar QuickPick menu the same way;
   change `Listbox` to leave the default alone where a native menu is wanted and to dispatch a synthetic `contextmenu`
   for Shift+F10.
2. **X, medium, decision-relevant — Host-run menu, palette and title actions leave a row not-busy while the operation
   is queued, and lose the in-webview CPM dialog.** `ops.tsx:204-209` marks busy from `run()`; host submissions go
   through `operations.*` + `settleOperation` (`SidebarHost.ts:181,216`); the queue reports progress for running
   workflows only (gotcha "An operation that waits in the queue has no `ops/progress`"; `PackageWorkflows.ts:76`).
   Proposal: accept (queue waits are short) and say so in the IA, or add one event that asks the webview to run the
   action itself (contract, bundled in the D6 item).
3. **H, high, decision-relevant — Any user-facing setting the webviews read is a contract change.** `ExtensionConfig`
   (`domain.ts:340-349`). Density and row-style settings cost a D6 item; per-surface toggles in webview state do not.
4. **H, medium, decision-relevant — New row content costs a contract change but little data work.** Download counts
   are fetched and dropped (`search.ts:304` vs `:377-383`); latest-version deprecation is in the same search response
   `[doc:search-api]`; installed-version deprecation needs a registration read per package `[doc:registration-api]`.
   Proposal: one D6 item adding `totalDownloads`, `deprecation` (and, if wanted, `license`) to
   `PackageMetadataLite`/`PackageMetadata`; decide latest-version vs installed-version deprecation with a perf
   measurement.
5. **H, medium, decision-relevant — Contract procedure is the dominant cost of small contract items; bundle them.**
   §1.2 table; P9.9 checklist `src/protocol/STATUS.md:5-68`. A domain-only optional field needs no guard and no
   generated-doc change; a new request or event needs six artefacts and a count-test ruling.
6. **H, medium, decision-relevant — New Catalog reads and new resource kinds are hidden contract changes.**
   ADR-009 `:18`; ADR-002 `:20-47` with `scopes.ts`. Webview aggregates over existing streams (Consolidate) avoid
   both; a host-side badge or diagnostic that reuses existing Catalog methods also avoids them.
7. **H, medium, decision-relevant — G2 is cheaper than estimated: single-project transitive data and its lite
   metadata are already prefetched.** `transitive.tsx:37-65,80-100`. Counting and filtering transitive
   vulnerabilities in the main panel needs no request; only All Projects needs `enableTransitive()`.
8. **H, medium, decision-relevant — Bundles have about 5 % headroom and no shared chunk; the sidebar has 18 kB.**
   §6. A component library crosses both ceilings; a shared chunk needs `esm` + splitting + an ADR-008 amendment and
   only changes what the ceiling measures (the entry files shrink, the bytes per page do not), so it is a ruling
   item, not headroom. The README stack (154,570 bytes) is the only large main-only block.
9. **H, low, decision-relevant — The CSP admits bundled fonts; codicon-as-font is blocked only for `@font-face` in
   the bundled CSS (build loader, `dist/*.ttf` not in the VSIX allow-list), not by the CSP.** §4. A font in
   `resources/` loaded from an `asWebviewUri` URI handed over through `renderWebviewHtml`'s `dataset` with the
   `FontFace` API needs no build or CSP change (not exercised). Inline `style` attributes are blocked by the CSP; the
   repository's cssVars-only rule is stricter than the CSP.
10. **X, medium, decision-relevant — Precise cross-surface navigation (sidebar row → matching main tab and row)
    needs a contract change; a contract-free heuristic is ambiguous.** `ui/viewPackage` / `ui/navigateToPackage`
    carry `{ packageId, version? }` only (`messages.ts:175,202`).
11. **X, low, decision-relevant — Under All Projects every project-less read uses the first workspace folder's
    sources.** `handlers.ts:32-39`. In a multi-root workspace with different `nuget.config` chains, Browse,
    versions, details and lite metadata follow one folder. A per-project details view under All Projects needs a
    `projectPath` on `package/*` payloads (contract).
12. **H, high, decision-relevant — The complete set of proposals that need a frozen-contract change, with the frozen
    target of each.** From §8:

    | Proposal | Frozen target |
    |---|---|
    | Downloads on rows (P1), deprecation (G1/P2/P13), license and size on rows (P14/P15), owners and tags (G14a), release notes (G14b), license acceptance (G12), mapping status (G8a, field route) | `src/protocol/domain.ts` (`PackageMetadataLite`, `PackageMetadata`) |
    | Density / row-style settings (P8/P9), update ignore list (G15b) | `domain.ts` (`ExtensionConfig` or `LayoutPreferences`) |
    | Vulnerable version flags (G4b, and G4c through it), Browse paging (G7), MB3 `found` chunk, precise cross-surface navigation (U7a), `ui/contextMenu` on the main panel (U1b, surface annotation only) | `src/protocol/messages.ts` (+ `docs/protocol.md` regenerated) |
    | Source editing (G11), license text (G12), mapping editor (G8b), `ui/openFile` button (G10a, non-menu route), a "run this action in the webview" event (finding 2) | `messages.ts` + `guards.ts` (new request or event); G11 also `src/core/contracts.ts` (`SourceProvider`); G8b also ADR-003 |
    | Audit sources and `NuGetAuditSuppress` (G3b) | `contracts.ts` (`ProjectExecutionContext`) + ADR-005 (+ ADR-004 for the evaluated item) |
    | Solution scope (G16) | `domain.ts` (session) + ADR-000 (D2) + ADR-001 |
    | `dotnet package update --vulnerable` as an operation (G4c alt) | `messages.ts` + `guards.ts` + ADR-003 |
    | Any new Catalog read; any core-cached new resource (e.g. a "drift" resource) | ADR-009; `domain.ts` `resourceKeys` + ADR-002 + `scopes.ts` |

    Proposal: decide early which of these the overhaul takes, and put all field additions into one D6 item and all
    new requests/events into at most one more.

13. **H, low — Persisted state is split three ways and one protocol slot is dead.** `splitPosition` in
    `globalState`, session in `workspaceState`, tab/sections/sidebar split in webview state; `sidebarSectionSplit`
    has no reader (`handlers.ts:244-258`); no panel serializer, so the main panel is not restored after a reload.
    Section collapse, filters and per-surface density can persist with no contract change.

---

## 10. Not reachable and gaps

Not reachable / not opened:
- `docs/plans/parity-audit-2026-10-16.md` and `docs/plans/findings-ledger.md` were not read in full; parity rows were
  taken from the feature-gaps report, which re-checked them on `e4d6e97`.
- The VS Code release notes for 1.72 (stable `webview/context`) were not fetched; the 1.85 source is the evidence used.
- `src/core/queries/scopes.ts`, `src/core/feeds/registration.ts` beyond greps, `src/core/feeds/vulnerability.ts`
  (relied on feature-gaps' reading for G3).

Gaps (known, not covered):
- No live VS Code: the synthetic-`contextmenu` keyboard path (Shift+F10 → native menu) is inferred from the 1.85
  bootstrap source and the guide, not exercised; same for menu placement at the row's rectangle.
- Relative `url()` resolution from `dist/webview.css` to `resources/` under the webview resource scheme was not
  tested; whether re-assigning `webview.html` preserves `getState` was not tested.
- Whether an Activity Bar container shows a webview view's badge the way it does for tree views was not verified.
- Whether a dynamic `import()` from a nonce'd script is allowed under this CSP in Chromium 114 was not tested.
- Per-proposal costs are estimates by analogy with the parity audit and P9.9, not measurements.
- The 15 capture PNGs and the 1.18.9 screenshots were not opened: no finding here rests on a picture.
- Bundle impact of each proposal was not measured individually; only the current headroom was.

---

## 11. Sources fetched in this session

| Key | Source |
|---|---|
| search-api | https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource (ms.date 2026-08-03) |
| registration-api | https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource |
| webview-guide | context7 `/websites/code_visualstudio_api`, page https://code.visualstudio.com/api/extension-guides/webview ("Context menus", "data-vscode-context", "Dispatch contextmenu event on primary click") |
| when-clause-contexts | `gh api repos/microsoft/vscode-docs/contents/api/references/when-clause-contexts.md` → `scratchpad/research/arch-src/when-clause-contexts.md` (lines 249, 270) |
| 1.85:webviewElement.ts | `gh api repos/microsoft/vscode/contents/src/vs/workbench/contrib/webview/browser/webviewElement.ts?ref=release/1.85` → `arch-src/webviewElement-1.85.ts` |
| 1.85:webviewViewPane.ts | `…/webviewView/browser/webviewViewPane.ts?ref=release/1.85` → `arch-src/webviewViewPane-1.85.ts` |
| 1.85:webviewEditor.ts | `…/webviewPanel/browser/webviewEditor.ts?ref=release/1.85` → `arch-src/webviewEditor-1.85.ts` (line 33) |
| 1.85:webviewWorkbenchService.ts | `…/webviewPanel/browser/webviewWorkbenchService.ts?ref=release/1.85` → `arch-src/webviewWorkbenchService-1.85.ts` (lines 216-268) |
| 1.85:r185/index.html | the 1.85 webview bootstrap, copy at `scratchpad/research/vscode-src/r185/index.html` (fetched by the design-rules dimension, `design-rules.md:40-49`) |
| measure | `scratchpad/arch/scripts/measure.cjs` (production options of `esbuild.mjs`, output to `scratchpad/arch/out/`) |

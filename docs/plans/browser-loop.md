# Browser exploration loop

**Informational and optional.** A session can serve the nUIget VSIX in a locally served VS Code (the VS Code Server
web bundle) and drive it in the desktop app's browser pane. Nothing it sees there certifies anything: the ExTester
captures, the measurements of `src/test/ui/v2/measure.ts`, the lint gate and axe are the gates of record. This
document is the repository copy of the planning session's research note of 2026-10-17 (a nine-agent study plus two
local probes); nothing outside the repository is needed to follow it apart from the toolchain under `~/github/Tools`.

## 1. When to use it, and what comes out

- Use it only when an item's named states cannot show the behaviour (hover, drag, motion, dialogs, the context menu,
  a transition between states), or when the `design-judge` panel and the measurements disagree about a state.
- The webviews are **pixel-only** in the pane. Probe of 2026-10-17: `read_page`, `find`, `get_page_text` and
  `javascript_tool` see only the top document; nUIget's webviews are cross-origin iframes (`*.vscode-cdn.net`) and
  their DOM is opaque. Screenshots, `zoom` and clicks by coordinate work across the frame boundary. DOM-level
  assertions stay with ExTester, which switches into the webview frame.
- The output is a set of **named interactive states** (§6). Their PNGs are scored by the `design-judge` workflow, and
  the item records the judge's JSON in its `STATUS.md` marked "browser loop, informational", never the session's own
  impression of a screenshot.
- A defect found this way becomes first a harness rule that fails on the current captures (a named state in
  `src/test/ui/v2/states.ts` and a measurement), then a fix item. The loop finds candidates; the harness proves them.
- **Open problem, settled by probe step 9 (§5):** the pane's `screenshot` returns an image to the conversation, not a
  file, and the judge reads PNG files. Until that step proves a way to write a pane screenshot under
  `captures/explore-<item>/`, the interactive states the judge scores are captured by ExTester instead (hover with
  `driver.actions().move()`, dialogs and menus as named states in `states.ts`), and the loop only finds candidates.

## 2. Why the server bundle

| Option | What it gives | Why not |
|---|---|---|
| **VS Code Server web bundle, started directly** (used) | Web workbench on `127.0.0.1` with `--disable-workspace-trust`, exit-code VSIX install, `--host`/`--port`, a pinned version | One 205,776,068-byte download per version |
| `code serve-web` (standalone CLI) | The same web UI behind a proxy | Cannot disable Workspace Trust; nUIget declares `untrustedWorkspaces.supported: false`, so the fixture opens silently in Restricted Mode and nUIget never activates; hourly auto-update; one-hour idle kill |
| VS Code.app | The same CLI behind an Electron shim | Nothing extra for this route; not installed and not needed |

Only a directly started server takes `--disable-workspace-trust`; the trust settings are application-scoped and the
web client never reads the server's `data/User/settings.json`.

## 3. Environment

| Item | Value |
|---|---|
| Server | `~/github/Tools/vscode-server/unpacked/vscode-server-darwin-arm64-web/bin/code-server`, VS Code 1.142.0, commit `6d62b1d5`: the version the harness pins with `--code_version 1.142.0` |
| PATH | `~/.zprofile` puts its `bin` first; check with `code-server --version` (the Bash tool is a zsh login shell) |
| Data directory | `~/github/Tools/vscode-server/data`: `server-data/` (extensions and the Machine settings file) and `fixture/` (the workspace copy). Never inside the repository |
| Machine settings file | `~/github/Tools/vscode-server/data/server-data/data/Machine/settings.json`, the only server-side settings file the web client reads |
| Launch entry | `.claude/launch.json`, `nuiget-web`: port 8000, URL `http://127.0.0.1:8000` (from the owner's bundled patch, `patches/settings-and-launch.patch`) |
| Allow rules | `Bash(code-server *)` and `mcp__Claude_Browser__*` (same patch). The 2026-10-17 probe ran pane calls in Auto mode without the second rule |
| Wrapper | `node scripts/browser-loop.mjs` with the steps `prepare`, `theme`, `wait` and `stop`, written by P0's browser item; `curl`, `lsof`, `rm` and `cp` are not pre-approved, so the steps that need them go through it. Until it exists those steps go to the Auto-mode classifier |

A different VS Code version is its own item (re-capture goldens, re-run the negative control); §9 has the owner's
install commands. coder's fork is also called `code-server`: never put both on PATH.

## 4. Session procedure

Rules: start the server from the Bash tool with `run_in_background`, not through `preview_start`'s own command. Shell
state does not persist between Bash calls, so every command spells its paths out. Read files under the data directory
with `ls` and `cat` in Bash (the Read tool prompts outside the working tree). Background processes die with the
session. Keep the origin at `127.0.0.1:8000`: trust, theme and extension state in the pane are kept per origin. Never
start the server from a VS Code integrated terminal.

1. Build the VSIX and note the newest one:
   ```
   npm run package:vsix
   ```
2. Prepare the data directory (fixture copy, restore of every supported project, VSIX install, Machine settings;
   the dense fixture `src/test/ui/fixtures/dense-workspace/` is created by P0):
   ```
   node scripts/browser-loop.mjs prepare --vsix <path to the .vsix> --fixture src/test/ui/fixtures/dense-workspace
   ```
   What it does, for reference and for the time before the wrapper exists:
   - copy the fixture to `~/github/Tools/vscode-server/data/fixture` (fresh copy every run, never the repository
     path) and run `dotnet restore` on each project except `Unsupported/`;
   - `code-server --server-data-dir ~/github/Tools/vscode-server/data/server-data --install-extension <vsix> --force`
     (exit 1 = stop), then `code-server --server-data-dir ~/github/Tools/vscode-server/data/server-data
     --list-extensions --show-versions`, expecting a line ending in `nuiget@<package.json version>`; keep that
     extensions directory nUIget-only (upstream #341226);
   - write the Machine settings file:
     ```json
     {
       "workbench.colorTheme": "Dark Modern",
       "workbench.startupEditor": "none",
       "workbench.sideBar.location": "left",
       "extensions.ignoreRecommendations": true,
       "git.openRepositoryInParentFolders": "never",
       "workbench.experimental.modernUI": true,
       "workbench.reduceMotion": "on"
     }
     ```
     Only window- and resource-scoped keys apply from this file; it overrides the browser-stored user settings, so it
     is the one theme switch (never also the palette). Whether the Modern UI and reduced-motion keys apply from it is
     probe step 8.
3. Start the server (Bash, `run_in_background`):
   ```
   code-server --accept-server-license-terms --server-data-dir ~/github/Tools/vscode-server/data/server-data --host 127.0.0.1 --port 8000 --without-connection-token --disable-workspace-trust --disable-telemetry --default-folder ~/github/Tools/vscode-server/data/fixture
   ```
   Without `--accept-server-license-terms` the server exits 1 under the Bash tool (non-TTY stdin). It prints
   `Server bound to 127.0.0.1:8000 (IPv4)`.
4. Wait for HTTP 200, never for page text:
   ```
   node scripts/browser-loop.mjs wait
   ```
5. Open the pane: `preview_start` with name `nuiget-web`, or `navigate` to `http://127.0.0.1:8000/`.
6. The first time only: the probe checklist of §5.
7. Capture the item's named interactive states (§6). Themes: `node scripts/browser-loop.mjs theme "<theme id>"`
   rewrites the Machine file (`Dark Modern`, `Light Modern`, `Dark High Contrast`, `Light High Contrast`,
   `Dark 2026`, `Light 2026`; the high-contrast pair may be labelled `Default High Contrast` and
   `Default High Contrast Light`, so `theme.ui.test.ts` tries both labels and probe step 1 records which one applied);
   restart the server if a change does not apply. Widths: drag the side-bar sash
   with `left_click_drag` for a narrow sidebar; `resize_window` only at 768 px or wider (below 768 the pane switches to
   an Android user agent with touch emulation), then `preset: desktop`.
8. Errors: the Output panel's `nUIget` channel (`$ dotnet …  (exit N, M ms)`; `Could not start "dotnet"` is an
   environment problem), `Extension Host (Remote)` for stack traces, `Developer: Set Log Level...`. There is no
   Toggle Developer Tools in the web build; use `read_console_messages`. The server's own output is the Bash
   background output.
9. After a VSIX reinstall, restart the server. Always stop it at the end (port collisions across sessions):
   ```
   node scripts/browser-loop.mjs stop
   ```

## 5. First-run probe checklist

Run once, by P0's browser item after the owner's patch is applied; record each verdict as a line of that item in
`docs/plans/STATUS-ux.md` so later sessions skip it.

| # | Check | How | Pass |
|---|---|---|---|
| 0 | Reachability | `navigate` to `http://127.0.0.1:8000/`. "Denied or failed" is the same text for a policy block and a refused connection: look for a site-approval card, re-run step 4 | The workbench loads |
| 1 | Trust and theme | `computer screenshot` | No "Restricted Mode" badge (`--disable-workspace-trust` took effect); dark theme (the Machine file is read; the web default is Light 2026) |
| 2 | Activation | F1, `Developer: Show Running Extensions` (gear menu, Command Palette if F1 is swallowed; never Cmd+W, which closes the tab, or Cmd+Shift+B, which toggles the pane) | nUIget listed on the remote host, no activation error |
| 3 | Views | `find "nUIget"`, click the activity-bar item; F1, `nUIget: Manage NuGet Packages` | Sidebar and main panel render |
| 4 | Webview host | `read_network_requests` with `urlPattern` `vscode-cdn.net`; `read_console_messages` with `onlyErrors` | `index.html` and `service-worker.js` load; no `Could not register service worker` (the pane blocks third-party storage: §8), no `Expected '…' as hostname` or `crypto.subtle` (wrong origin) |
| 5 | Frame geometry | `javascript_tool` on the top document: list `iframe.webview` with `src` origin and bounding rect | Rects recorded; they are the crop and click offsets of §6 |
| 6 | Tree opacity | `find "Installed"`, then `read_page` (it truncates at 50k characters, which can look like opacity: `find` first) | Expected: the tree ends at the iframe, as in the 2026-10-17 probe; record what it shows |
| 7 | Second round-trip | After the installed list renders, open a version selector or run a search (upstream #319896) | The webview answers |
| 8 | Look keys | `javascript_tool` on the top document: the class list of `.monaco-workbench` | It carries `modern-ui` (the Machine file's `workbench.experimental.modernUI` applies) and a reduced-motion class while `workbench.reduceMotion` is `on`; record the class names seen. Unverified until run |
| 9 | PNG to a file | Find out whether a pane screenshot can be written to `captures/explore-<item>/` (no tool option is documented) | Record the method, or "not available": then §1's ExTester route captures the interactive states the judge scores |
| 10 | Version parity | `code-server --version`; Help, About | 1.142.0, the harness's `--code_version` |

## 6. Exploratory script: named interactive states

Each state starts from a named state of `src/test/ui/v2/states.ts`, is reached by the pane steps listed, and is
captured as the webview's iframe rect (probe step 5); the context menu, which the workbench draws outside the
webview, is captured as the window. Name: `explore-<surface>-<what>`; file
`captures/explore-<item>/<state>.<theme>.<width>.png` (gitignored; no decision cites it). Before each capture move the
pointer to a neutral point unless the state is about hover, and wait for transitions to finish unless the state is
about motion.

| State | Starts from | Pane steps | Informs |
|---|---|---|---|
| `explore-main-row-hover` | `main-installed-single` | `hover` the centre of a row that is not selected; wait 300 ms | DS-ROW-3 (actions inside the band), the hover colour role |
| `explore-main-row-hover-selected` | `main-installed-single` | `hover` the selected row | Hover never paints over selection |
| `explore-main-row-focus-keyboard` | `main-installed-single` | Click the search box, Tab to the list, ArrowDown | The focus ring on keyboard focus (DS-FOCUS) |
| `explore-main-row-focus-click` | `main-installed-single` | Click a row | The look's focus rule after a click (DS-FOCUS-3) |
| `explore-main-icon-button-hover` | `main-installed-single` | `hover` the Refresh button | The 22 px hover box (DS-HEIGHT-8), `toolbar.hoverBackground` |
| `explore-main-sash-hover` | `main-installed-single` | `hover` the details sash; capture at once and after 500 ms | V16 (the sash's hover delay and colour role) |
| `explore-main-sash-narrow` | `main-installed-single` | `left_click_drag` the sash until the details pane is at its minimum | The details actions' overflow behaviour (DS-OVERFLOW) |
| `explore-main-uninstall-confirm` | `main-installed-single` | Select a row, press Delete | The dialog, its scrim (V19) and its initial focus |
| `explore-main-dialog-closed-focus` | `explore-main-uninstall-confirm` | Press Escape | Focus returns to the opener with a visible ring (A6) |
| `explore-main-context-menu` | `main-installed-single` | Select a row, press Shift+F10 | The actions menu exists and reads as the workbench's (X1, A3) |
| `explore-main-version-dropdown` | `main-browse-details` | Open the version selector | The control height (DS-HEIGHT-7) and the popup's overflow |
| `explore-main-refresh-progress` | `main-installed-single` | Click Refresh, capture at once | Progress where the work is (DS-STATE-2) |
| `explore-panel-900` | `main-installed-single` | `resize_window` to 900 × 800 | Tab bar and toolbar at a narrow editor (DS-OVERFLOW) |
| `explore-sidebar-row-hover` | `sidebar-sections` | `hover` a row | DS-ROW-3 in the compact row |
| `explore-sidebar-section-header-hover` | `sidebar-sections` | `hover` a section header | The Modern UI header hover tint (DS-HEIGHT-1) |
| `explore-sidebar-narrow-170px` | `sidebar-sections` | `left_click_drag` the side-bar sash to 170 px | No horizontal scroll at 170 px (DS-OVERFLOW-1) |
| `explore-motion-tab-switch` | `main-installed-single` | `theme` step with `workbench.reduceMotion` set to `off`; switch tabs; capture mid-transition | Motion (DS-MOTION); judge-only, durations are never measured from pixels |

Theme pass: repeat the hover, focus and selection states under Light Modern and Dark High Contrast.

Scoring: run the `design-judge` workflow with `runId` `explore-<item>`, one `states` entry per capture, and the
artboard and `spec.json` of the state it starts from (the judge reads the interaction from the state's name). The
item's `STATUS.md` records the returned JSON as informational.

## 7. Caveats: what the browser instance does not prove

The CI ExTester captures remain the gate of record.

| Area | Fact | Consequence |
|---|---|---|
| Webview origin | The web build loads each webview as an `https://<hash>.vscode-cdn.net` iframe with a service worker; Electron uses its own scheme; both use the same `WebviewElement` class | A webview rendering in the pane proves the `asWebviewUri` and CSP wiring, not Electron resource loading; it needs internet; a pane that blocks third-party storage would blank every webview |
| Pane tooling | nUIget's UI is two nested cross-origin iframes; the pane tools have no frame selector | Pixel-only: screenshots and coordinates; ExTester for the DOM |
| Screenshots | A pane screenshot is an image in the conversation, not a file (probe step 9) | Until a file route is proven, the judge scores ExTester captures |
| Theme parity | Body classes are identical in web and desktop; the web default theme is Light 2026; `src/test/ui/settings.json` names `Default Dark Modern`, which works through a migration rewrite | Use the 1.142.0 theme ids; `@media (forced-colors: active)` follows the OS, never a VS Code theme |
| Look | ExTester writes `workbench.experimental.modernUI: false`; the plan's harness writes the key explicitly (Modern UI primary, one classic pass) | Set the same key in the Machine file, or the pane and the captures show different looks |
| Native chrome | No Toggle Developer Tools, no `window.zoomLevel`, simple file dialogs, no native menus; the host app may intercept keyboard chords | Dialog and menu parity unproven; zoom only through `resize_window` and the sash |
| Extension host | A remote Node host; URIs are `file`; its environment is the server's plus a login-shell overlay, resolved once per server process | Restart the server after editing `~/.zprofile`; never start it from a VS Code integrated terminal |
| Extension state | `globalState`, `workspaceState` and palette settings live in the pane's IndexedDB; SecretStorage is in memory (nUIget uses none) | Clearing the pane's site data resets remembered layout; the Machine file is unaffected |
| Trust | Only `--disable-workspace-trust` on a directly started server works | Restricted Mode looks exactly like a broken VSIX: check Running Extensions |
| Network | `*.vscode-cdn.net` on every load, `api.nuget.org` for the fixture | Offline, the extension host runs and the webviews stay blank |
| Security | No connection token: any local process can drive the server | Acceptable on a single-user Mac; keep the bind at `127.0.0.1` |
| Permissions | `Bash(code-server *)` matches commands that start with `code-server`; whether `mcp__Claude_Browser__*` covers the app's built-in pane server is unverified | Expect classifier reviews, not prompts, for anything else |
| Lifecycle | The background server dies with the session; port 8000 can collide across sessions; `--host localhost` may resolve to `::1` | Always stop the server; always pass `127.0.0.1` |
| Upstream bugs | #319896 messaging stall; #326544 service worker loses interception (one tab per server; reload on `ERR_NAME_NOT_RESOLVED`); #341226 an extension with `onFileSystem:file` breaks activation on macOS 27 (keep the extensions directory nUIget-only); #299425 NLS blank page (never change the display language); #339621 (never F5) | Checklist items, not blockers |
| Gatekeeper | A curl-fetched zip carries no quarantine attribute | Unverified on macOS 27; report any dialog |
| Viewport | `resize_window` below 768 px gives an Android user agent with touch | Use 768 px or wider, or the sash |

## 8. Fallbacks

- **coder's `code-server`** (v4.141.0 ships a macOS arm64 build with Node bundled): it serves webviews same-origin
  (its `patches/webview.diff`), the only known way to make the nUIget DOM reachable by `read_page` and
  `javascript_tool`, or to escape a third-party-storage block. Flags: `--install-extension <vsix>`, `--auth none`,
  `--bind-addr 127.0.0.1:8080`, `--disable-workspace-trust`, `?folder=`. A fork, near and not exact parity; never on
  PATH together with Microsoft's `code-server`. Adopting it is a new owner patch.
- **openvscode-server**: Linux-only release assets and cross-origin webviews like upstream; no advantage here.

## 9. Installing or moving the version (owner)

The 1.142.0 bundle is installed. To install another version (its own plan item), run in Terminal, one at a time:

```
mkdir -p ~/github/Tools/vscode-server
```
```
curl -fL -o ~/github/Tools/vscode-server/vscode-server-darwin-arm64-web.zip https://update.code.visualstudio.com/latest/server-darwin-arm64-web/stable
```
```
unzip -q -o ~/github/Tools/vscode-server/vscode-server-darwin-arm64-web.zip -d ~/github/Tools/vscode-server/unpacked
```
```
code-server --version
```

`--version`, `--install-extension` and `--list-extensions` run in CLI mode and skip the licence; starting the server
needs `--accept-server-license-terms`. The download is the whole install: later, only the webview host page is
fetched from `*.vscode-cdn.net` on every page load.

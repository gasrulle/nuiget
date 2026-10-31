# nUIget for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/gasrulle.nuiget)](https://marketplace.visualstudio.com/items?itemName=gasrulle.nuiget)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Visual Studio-style NuGet package manager for VS Code with a modern split-panel UI and Activity Bar sidebar.

![Search results beside the details of Newtonsoft.Json in the nUIget main panel](https://raw.githubusercontent.com/gasrulle/nuiget/main/docs/images/nuiget-browse-details.png)

![The Installed tab with two package cards and the README of the selected package](https://raw.githubusercontent.com/gasrulle/nuiget/main/docs/images/nuiget-installed-readme.png)

![The Updates tab with Update all and each card showing the installed and the new version](https://raw.githubusercontent.com/gasrulle/nuiget/main/docs/images/nuiget-updates.png)

## ✨ Features

- **Visual Studio-style main panel.** Installed and Updates tabs, with the update count on the Updates tab. The
  package list sits beside a details pane with a Details tab (description, authors, downloads, license, size,
  dependencies by framework, vulnerabilities) and a README tab (rendered Markdown, code blocks highlighted, with a copy
  button). A version selector marks the installed version; its button reads Install, Update or Downgrade, and
  Uninstall is a button of its own.
- **Search and filters.** Type a package name and press Enter to search your sources; in the main panel, quick-search
  suggestions appear while you type (see `nuiget.searchDebounceMode`). The results replace the tabs until you clear the box. Prefixes
  filter instead of searching: `@installed`, `@updates` and `@vulnerable` in the main panel, `@installed` and
  `@updates` in the sidebar.
- **Activity Bar sidebar.** Compact Installed and Updates sections that collapse independently, with a draggable
  split between them. Every row has an actions menu (right-click or Shift+F10): install the latest or a chosen
  version, update, uninstall, copy the package ID, or view the package in the main panel. The title bar holds the
  project and source pickers, the prerelease and restore switches, Refresh and Open Full Manager, and the Updates
  header has Update all.
- **All Projects.** With two or more projects, choose **All Projects (N)** in the project selector. Installed and
  Updates show one section per project, grouped by workspace folder when the workspace has several. Each row acts on
  its own project, Update all covers every project, and a search result can be installed into several projects at
  once. From a single project, the details pane of a search result also offers Install in projects….
- **Transitive packages.** The Installed tab lists the transitive packages per target framework, each with the
  top-level packages that require it. A project that has not been restored shows a Restore banner instead.
- **Bulk operations.** Select rows with Space, Ctrl+click (Cmd+click on macOS) or the check mark, then Update all,
  Update selected or Uninstall selected. A confirmation dialog lists exactly the packages that will change.
- **Central Package Management.** Centrally managed packages carry a CPM badge. Before the central version of a
  package changes, nUIget lists every project that the change reaches and asks you to confirm (main panel: a dialog;
  sidebar: the actions menu and a confirmation). Installing a package that already has a central entry is previewed
  the same way. A package whose project overrides the central version with `VersionOverride` updates in that project
  alone. Uninstall removes the project's reference and keeps the central entry. An install into several projects
  leaves out the projects where the package has a central entry and says so.
- **Provisional, then evaluated.** The installed list appears at once, read from the project files, and is marked
  "provisional". MSBuild evaluation then replaces it with the authoritative list (conditions, imported props files,
  references the SDK adds). A version nUIget cannot determine shows as "unresolved", and nUIget does not change that
  package.
- **Package sources.** The gear next to the source selector opens the NuGet sources dialog: enable or disable a
  source, add one (config file, URL, name, credentials), or remove one with a confirmation. Sources are those the
  dotnet CLI reports for the selected project's directory, and package source mapping decides which sources are asked
  about a package.
- **Source health.** A source that cannot be reached is a warning banner with Retry, never an empty "no updates" or
  "no results". The header's source selector marks it "(unreachable)", and the warning button beside the gear
  checks the sources again. nUIget re-checks unreachable sources in the background, and the Updates lists check again
  when a source recovers.
- **Proxy through VS Code.** Feed requests use VS Code's own proxy support, so `http.proxy`, `http.proxySupport` and
  the proxy environment variables apply. nUIget has no proxy setting of its own. The dotnet commands it runs are
  not affected by VS Code's settings and use the dotnet CLI's own proxy configuration.
- **One shared context.** The main panel and the sidebar show the same project, source, prerelease and restore
  choices. An operation started in either view shows its progress in both.
- **Operation queue.** One operation runs at a time and up to five wait behind it; the status bar shows how many are
  running and queued. A bulk operation shows a progress notification, and every operation ends with a toast that says
  how it went.
- **Restore after operations.** On by default, per workspace. Turn it off with the checkbox in the main panel header
  or the shield button in the sidebar's title bar (filled when on); it applies to operations from both views. In a Central Package Management project an
  install or update always restores.
- **Automatic refresh.** Changes to project files, `Directory.Build.props`, `Directory.Packages.props`,
  `nuget.config`, `global.json`, `packages.lock.json` and the restore output refresh the lists.
- **Update suggestions skip unlisted versions.**
- **Verified badges** where the feed marks a package as verified.
- **Accessible.** Every action has a key, lists and dialogs carry the roles screen readers expect, colours come from
  the VS Code theme (high-contrast themes included), and motion is reduced when the system or VS Code asks for it.
- **Output channel.** The "nUIget" channel logs every dotnet command with its exit code and duration. Credentials
  are removed from everything it logs. It opens by itself when an operation fails.

## 🚀 Quick Start

1. **Open** a folder that contains `.csproj`, `.fsproj` or `.vbproj` files.
2. **Run** `nUIget: Manage NuGet Packages` from the Command Palette (`Ctrl+Shift+P`, `Cmd+Shift+P` on macOS).
3. **Search** for a package and press Enter, select it, choose a version in the details pane and click Install.

> 💡 **Tip:** Right-click a project file in the Explorer and choose the nUIget command to open the panel with that project selected.

> 💡 **Tip:** Right-click a project in Solution Explorer for the same command.

> 💡 **Tip:** Click the nUIget icon in the editor title bar when a project file is open.

> 💡 **Tip:** Use the nUIget icon in the Activity Bar for installed packages and updates at a glance.

## ⚙️ Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `nuiget.searchDebounceMode` | `quicksearch` | What typing in the main panel's search box does: `quicksearch` shows suggestions, `full` runs the full search as you type, `off` searches only on Enter. The sidebar searches as you type in every mode. |
| `nuiget.quickSearchResultsPerSource` | `5` | Suggestions per source in the main panel's quick search (1-10). |
| `nuiget.searchResultLimit` | `20` | Maximum number of packages a full search returns (1-100). |
| `nuiget.enablePerformanceLogging` | `false` | Writes the webviews' `[perf]` marks (webview ready, first useful render) to the nUIget output channel at Info level instead of Debug. The duration of every dotnet command is always logged. Keep it off in normal use. |

## 📋 Commands

| Command | Description |
|---------|-------------|
| `nUIget: Manage NuGet Packages` | Open the main panel. From a project file's menu, the panel opens with that project selected. |
| `nUIget: Clear NuGet HTTP Cache` | Run `dotnet nuget locals http-cache --clear`, drop the feed data nUIget cached and reload the lists. Use it when packages or versions look stale. |
| `nUIget: Clear SDK Version Cache` | Forget the .NET SDK versions detected per directory and detect them again, for example after installing a new SDK. |

<details>
<summary><b>⌨️ Keyboard Shortcuts</b></summary>

### Search box

| Key | Action |
|-----|--------|
| `@` | Open the list of filter prefixes |
| `↑` / `↓` | Move through the prefixes, the quick-search suggestions or, after `→`, the versions |
| `→` | Main panel: list the five newest versions of the highlighted suggestion |
| `←` | Back to the suggestions |
| `Enter` | Take the highlighted prefix, suggestion or version (a suggestion or version shows the package's details); with none highlighted, search for the text in the box |
| `Ctrl+Enter` (`Cmd+Enter` on macOS) | Main panel: install the highlighted suggestion's newest version, or the highlighted version, into the selected project |
| `Tab` | Take the highlighted prefix or suggestion |
| `Escape` | Close the list; with the list closed, clear the box; in an empty box, leave it |

### Package lists

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move to the previous or next row |
| `Home` / `End` | Jump to the first or last row |
| `Enter` | Main panel: show the details (Installed, search results) or update the package (Updates). Sidebar: the row's action (Uninstall in Installed, Update in Updates, Install in search results); on a centrally managed update, or a search result with a central entry, it opens the actions menu |
| `Enter`, `←` / `→` on a group row | Main panel: expand or collapse the group (Direct packages, Transitive packages and a target framework inside it, a project under All Projects) |
| `Ctrl+Enter` (`Cmd+Enter` on macOS) | Main panel: install the search result into the selected project. Sidebar: open the package in the main panel |
| `Delete` (`Cmd+Backspace` on macOS) | Uninstall (Installed lists) |
| `Space` | Main panel: select the row for a bulk action, or clear it |
| `Shift+F10` / Menu key | Sidebar: open the actions menu |

</details>

<details>
<summary><b>📁 Configuration</b></summary>

### NuGet Sources

nUIget asks the dotnet CLI for the sources (`dotnet nuget list source`) in the selected project's directory, or in
the first workspace folder when All Projects or no project is selected. The CLI applies the same `nuget.config` files
it uses for that directory, including `<clear />` and disabled sources, so each project sees its own sources.

When the configuration has a `<packageSourceMapping>`, a request that names a package goes only to the enabled
sources whose winning pattern matches that package. If those sources are disabled or missing, nUIget asks no source
about the package.

**Add source** in the sources dialog writes to the file you choose:

- **User:** `~/.nuget/NuGet/NuGet.Config` (macOS and Linux) or `%APPDATA%\NuGet\NuGet.Config` (Windows)
- **Workspace:** the `nuget.config` of the first workspace folder, created when it does not exist

An `http:` source needs the **Allow an insecure (HTTP) connection** option, which .NET SDK 10 requires.

Example `nuget.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
    <add key="MyPrivateFeed" value="https://pkgs.dev.azure.com/myorg/_packaging/myfeed/nuget/v3/index.json" />
  </packageSources>
</configuration>
```

</details>

<details>
<summary><b>🔐 Private Feeds & Credentials</b></summary>

### How Credentials Are Resolved

For an `http:` or `https:` source, nUIget looks for credentials in three places, in this order, and uses the first
it finds:

1. **Environment variables.**
   - `ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS` (or `VSS_NUGET_EXTERNAL_FEED_ENDPOINTS`): JSON with an
     `endpointCredentials` list. The first entry with a password whose `endpoint` is the source URL, or a path above
     or below it, is used.
   - `ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN` (or `VSS_NUGET_ACCESSTOKEN`): a token, used for Azure Artifacts sources
     only.
2. **`nuget.config`.** The `<packageSourceCredentials>` entry of the source's name:
   - `ClearTextPassword`: `%VARIABLE%` placeholders in it and in `Username` are replaced from the environment. When a
     variable is not set, the entry is skipped.
   - `Password`: the encrypted form. On Windows nUIget decrypts it with DPAPI for the current user, with the entropy
     `NuGet` that NuGet itself uses. Elsewhere, or when decryption fails, nUIget goes on to the next step.
3. **Azure Artifacts Credential Provider.** Only for Azure Artifacts sources and for hosts listed in
   `ARTIFACTS_CREDENTIALPROVIDER_HOSTS` (or `NUGET_CREDENTIALPROVIDER_VSTS_HOSTS`, separated by semicolons). nUIget
   uses the cross-platform plugin `CredentialProvider.Microsoft.dll`: the first one found in
   `NUGET_NETCORE_PLUGIN_PATHS` (or `NUGET_PLUGIN_PATHS`), else
   `~/.nuget/plugins/netcore/CredentialProvider.Microsoft/CredentialProvider.Microsoft.dll`. It runs through
   `dotnet`, non-interactively, for at most 10 seconds.

Azure Artifacts sources are recognized by address: `pkgs.dev.azure.com`, `*.pkgs.visualstudio.com`, or a path that
contains `/_packaging/`. Any other feed works with a user name and password (or token) in `nuget.config` or in the
external feed endpoints variable.

Credentials found are kept for 30 minutes, and "no credentials" for 5 minutes. nUIget never writes a password, token
or the credential provider's output to the log.

### Credential Security

When you add a source with credentials in the sources dialog:

| Method | Notes |
|--------|-------|
| **Encrypted (DPAPI)** | Windows only, and the default there. Encrypted for the current user. |
| **Environment variable** | Type `%MY_PASSWORD%` as the password and store it in clear text: the file holds the placeholder, and nUIget reads the variable (the dialog switches encryption off for such a value). |
| **Clear text** | The only choice outside Windows. Stored unencrypted in `nuget.config`. |

Example with credentials:

```xml
<packageSourceCredentials>
  <MyPrivateFeed>
    <add key="Username" value="myuser" />
    <add key="ClearTextPassword" value="%NUGET_FEED_PASSWORD%" />
  </MyPrivateFeed>
</packageSourceCredentials>
```

See [Microsoft's security best practices](https://learn.microsoft.com/en-us/nuget/consume-packages/consuming-packages-authenticated-feeds#security-best-practices-for-managing-credentials) for more details.

</details>

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Something failed and the message is not enough | Open View → Output → **nUIget**. The channel lists every dotnet command nUIget ran, with its exit code, duration and output. |
| A banner says "Some package sources could not be checked" (or searched) | A source did not answer. Check the network or VPN, and the source's URL and credentials in the sources dialog, then click **Retry**. nUIget also re-checks unreachable sources in the background. |
| Packages or versions look stale | Run `nUIget: Clear NuGet HTTP Cache`. |
| A private feed returns nothing | Add credentials for it (see Private Feeds & Credentials). |
| "Could not start dotnet" | Install the .NET SDK and make `dotnet` available on PATH, or point `DOTNET_ROOT` at the installation directory. |
| A project shows "requires .NET SDK 10 or newer" and is read-only | The SDK its directory resolves (for example through `global.json`) is older than 10. Install SDK 10 or change `global.json`; after installing an SDK, run `nUIget: Clear SDK Version Cache`. |
| "Unsupported project" | nUIget manages SDK-style projects with `PackageReference`. `packages.config` and non-SDK-style projects are listed as unsupported. |
| An install or update is refused because of unsaved changes | Save or close the project file or `Directory.Packages.props` in the editor. |
| A version shows "unresolved" | nUIget could not determine the version from the project files. Edit that reference by hand. |
| Transitive packages are missing | Expand **Transitive packages** and click **Restore** in the banner above the list; the project has not been restored. |
| Sidebar not showing | It appears only when the workspace contains a `.csproj`, `.fsproj` or `.vbproj` file. |
| Nothing happens at all | nUIget does not run in Restricted Mode or in a virtual workspace. Trust the workspace and open it from disk. |

## Requirements

- Visual Studio Code 1.90.0 or newer (VS Code 1.85 to 1.89 keep nUIget 1.18.9).
- .NET SDK 10 or newer, with `dotnet` on PATH or in `DOTNET_ROOT`. A project whose directory resolves an older SDK
  is shown read-only.
- SDK-style .NET projects (`.csproj`, `.fsproj` or `.vbproj`).
- A trusted workspace on disk. Restricted Mode and virtual workspaces are not supported.
- Remote development (Remote-SSH, WSL, Dev Containers, Codespaces): nUIget runs where the workspace is, so `dotnet`,
  the project files, the `nuget.config` files, the credentials (DPAPI only when the remote is Windows) and the feed
  connections are all on the remote. The remote case is not verified by the test suite.

## Development with Copilot

Development uses Node.js 24 (see `.nvmrc`; 24.15.0 or newer) and npm 10 or newer.
Run `npm install`, `npm run compile`, and `npm run package:vsix` to install,
build, and package the extension. Validate with `npm test`, `npm run test:coverage`,
`npm run bench`, `npm run test:e2e`, and `npm run test:ui`. The UI tests download
a test copy of VS Code and ChromeDriver and require a graphical desktop and
the .NET SDK. On macOS, use a short temporary download path if the IPC socket
path would be too long: `npm run test:ui -- --storage /tmp/nuiget-ui`.

Start with [the repository instructions](.github/copilot-instructions.md) and
[ARCHITECTURE.md](ARCHITECTURE.md). Scoped instructions in `.github/instructions/`
describe the actual TypeScript build, React webviews, accessibility, and validation
requirements.

The repository includes focused [GitHub Actions efficiency](.github/skills/github-actions-efficiency/SKILL.md)
and [hardening](.github/skills/github-actions-hardening/SKILL.md) skills, a
[Technical Writer agent](.github/agents/se-technical-writer.agent.md), and the
[git-commit skill](.github/skills/git-commit/SKILL.md) for Conventional Commits.
Commit, push, and publish actions still require explicit authorization.

## License

[MIT](LICENSE). Icons: [Visual Studio Code Codicons](https://github.com/microsoft/vscode-codicons), CC-BY-4.0.

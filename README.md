# nUIget for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/gasrulle.nuiget)](https://marketplace.visualstudio.com/items?itemName=gasrulle.nuiget)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Visual Studio-style NuGet package manager for VS Code with a modern split-panel UI.

<a href="https://raw.githubusercontent.com/gasrulle/nuiget/main/docs/images/browse.png">
  <img src="https://raw.githubusercontent.com/gasrulle/nuiget/main/docs/images/browse.png" alt="nUIget - Browse packages" width="800">
</a>

## ✨ Features

- 🎨 **Visual Studio-Style GUI** - Familiar split-panel layout with Browse, Installed, and Updates tabs
- 📦 **Full Package Management** - Install, update, and remove NuGet packages via dotnet CLI
- 🔍 **Quick Search** - Real-time suggestions as you type with recent search history
- ⌨️ **Keyboard Navigation** - Arrow keys to navigate, `Ctrl+Enter` to quick install
- 🚀 **Multi-Project Support** - Manage packages across .csproj, .fsproj, and .vbproj files
- 🔗 **Transitive Dependencies** - View the full dependency graph with "Required by" chains
- 📊 **Bulk Operations** - Update All or Uninstall Selected for batch management
- ⚙️ **Source Management** - Enable, disable, add, or remove NuGet sources via settings cog (⚙️)
- ✅ **Verified Badges** - Shows ✓ for packages with reserved prefix on nuget.org
- 🔐 **Authenticated Private Feeds** - Browse and search packages from private feeds
- 📖 **README Display** - View package docs with syntax-highlighted code blocks and copy button
- ⚠️ **Source Status Warnings** - Visual notification when NuGet sources are unreachable
- � **Sidebar Panel** - Compact Activity Bar panel with Browse, Installed, Updates sections and background update badge
- �🔧 **Output Channel** - "nUIget" channel shows all CLI commands for troubleshooting

## 🚀 Quick Start

1. **Open** a folder containing .NET project files
2. **Press** `Ctrl+Shift+P` → type "nUIget: Manage NuGet Packages"
3. **Search** for a package, select a version, click Install!

> 💡 **Tip:** Right-click any .csproj file in Explorer → "nUIget: Manage Packages"

> 💡 **Tip:** Right-click any project in Solution Explorer → "nUIget: Manage Packages"

## 📸 Screenshots

<table>
<tr>
<td width="50%">

### � Installed Packages
See direct and transitive dependencies with "Required by" chains

<a href="https://raw.githubusercontent.com/gasrulle/nuiget/main/docs/images/installed.png"><img src="https://raw.githubusercontent.com/gasrulle/nuiget/main/docs/images/installed.png" alt="Installed packages"></a>

</td>
<td width="50%">

### 🔄 Updates
One-click updates with version comparison and prerelease support

<a href="https://raw.githubusercontent.com/gasrulle/nuiget/main/docs/images/updates.png"><img src="https://raw.githubusercontent.com/gasrulle/nuiget/main/docs/images/updates.png" alt="Updates available"></a>

</td>
</tr>
</table>

## ⚙️ Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `nuiget.noRestore` | `false` | Skip `dotnet restore` after package operations. Faster but transitive dependencies won't update until next build. |
| `nuiget.searchDebounceMode` | `quicksearch` | `quicksearch`: Show suggestions. `full`: Full search as you type. `off`: Manual only. |
| `nuiget.quickSearchResultsPerSource` | `5` | Suggestions per source in quick search (1-10) |
| `nuiget.recentSearchesLimit` | `5` | Recent searches to remember (0-10, 0 to disable) |

## 📋 Commands

| Command | Description |
|---------|-------------|
| `nUIget: Manage NuGet Packages` | Open the package manager panel |
| `nUIget: Refresh Packages` | Refresh package data |

<details>
<summary><b>⌨️ Keyboard Shortcuts</b></summary>

### Quick Search Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate through suggestions |
| `→` | Open version picker for highlighted package |
| `Enter` | Select package (show details) |
| `Ctrl+Enter` | **Quick Install** latest version |
| `Escape` | Close dropdown |

### Version Picker (after pressing `→`)

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate versions |
| `←` | Back to package list |
| `Enter` | Install selected version |

### Package List Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate packages |
| `Home` / `End` | Jump to first/last |
| `Enter` | Install (Browse) / Update (Updates) |
| `Delete` | Uninstall (Installed tab) |
| `Space` | Toggle checkbox selection |

</details>

<details>
<summary><b>📁 Configuration</b></summary>

### NuGet Sources

The extension reads sources from:
- **User-level:** `%USERPROFILE%\.nuget\NuGet\NuGet.Config` (Windows) or `~/.nuget/NuGet/NuGet.Config` (Mac/Linux)
- **Workspace-level:** `nuget.config` in workspace root

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

### Supported Private Feeds

nUIget provides **browse and search** capabilities for authenticated NuGet feeds:

- **Azure DevOps Artifacts** - Uses Azure Artifacts Credential Provider or nuget.config credentials
- **GitHub Packages** - Personal access token in nuget.config
- **JFrog Artifactory** - Username/password or API key
- **MyGet, ProGet** - Any NuGet v3-compatible feed

### How Credentials Are Resolved

Credentials are resolved in priority order:

1. **nuget.config** - `<packageSourceCredentials>` section (recommended)
2. **Windows Credential Manager** - Cached credentials from `dotnet restore --interactive`
3. **Azure Artifacts Credential Provider** - For Azure DevOps feeds (if installed)

### Credential Security

When adding a source with credentials:

| Method | Security | Notes |
|--------|----------|-------|
| **Encrypted (DPAPI)** | ✅ Best | Windows only. Encrypted per-user, per-machine. |
| **Environment Variable** | ✅ Good | Use `%MY_PASSWORD%` syntax. Resolved at runtime. |
| **Clear Text** | ⚠️ Avoid | Stored unencrypted in nuget.config. |

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
| Private feed shows empty results | Run `dotnet restore --interactive` once to cache credentials, then refresh. |
| "401 Unauthorized" in output | Add credentials to nuget.config `<packageSourceCredentials>` section. |
| Private feed not loading | Check VPN connection. Click ⚙️ to verify source status. |
| "dotnet not found" error | Ensure .NET SDK is installed and `dotnet` is on your PATH. |
| Source shows ⚠️ warning | Source is unreachable. Check network or disable in settings. |
| Transitive packages empty | Click ↻ refresh button. Project needs to be restored first. |
| Packages not updating | Check Output panel (View → Output → "nUIget") for CLI errors. |

## Requirements

- Visual Studio Code 1.85.0+
- .NET SDK installed and on PATH
- .NET projects (.csproj, .fsproj, or .vbproj)

## License

[MIT](LICENSE)


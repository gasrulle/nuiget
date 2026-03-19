<!--
  PR Template — optimized for autonomous coding agent review.
  The reviewing agent should parse each section to build a complete understanding
  of the change before inspecting the diff. Cross-reference ARCHITECTURE.md for
  component interactions and .github/copilot-instructions.md for known gotchas.
-->

## PR Type

<!-- Check exactly ONE box. -->

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Performance
- [ ] Documentation
- [ ] Dependencies / version bumps

## Description

<!-- What changed and why. Be specific — the reviewing agent has no prior context. -->



## Related Issue

<!-- Link the issue this PR addresses. Use closing keywords when applicable. -->
<!-- Examples: Closes #123 | Fixes #456 | Related to #789 -->
<!-- Leave "None" if no issue exists. -->

None

## Change Manifest

<!--
  Structured summary of every file touched, grouped by component.
  The reviewing agent parses this BEFORE reading the diff to understand scope.
  Add or remove rows as needed. Delete components that are not affected.
-->

| Component | Files Modified | Summary of Changes |
|-----------|---------------|-------------------|
| Extension Core | `src/extension.ts` | |
| Main Panel | `src/webview/NuGetPanel.ts` | |
| Main Webview (React) | `src/webview/app/App.tsx`, `src/webview/app/components/…` | |
| Sidebar Backend | `src/webview/NuGetSidebarPanel.ts` | |
| Sidebar Webview (React) | `src/webview/sidebar/SidebarApp.tsx`, `src/webview/sidebar/components/…` | |
| NuGet Service / API | `src/services/NuGetService.ts` | |
| Package Operations | `src/services/NuGetOperations.ts` | |
| Config / Sources | `src/services/NuGetConfigParser.ts`, `src/services/NuGetTypes.ts` | |
| HTTP / Networking | `src/services/Http2Client.ts` | |
| Credentials / Auth | `src/services/CredentialService.ts` | |
| Caching | `src/services/WorkspaceCache.ts` | |
| Utilities | `src/services/NuGetUtils.ts` | |
| Styles | `src/webview/app/App.css`, `src/webview/sidebar/SidebarApp.css` | |
| Types | `src/webview/app/types.ts` | |
| Icons | `src/webview/app/icons.tsx` | |
| Markdown Rendering | `src/webview/app/markdownSetup.ts` | |
| Build / Config | `esbuild.mjs`, `tsconfig.json`, `package.json` | |
| Documentation | `README.md`, `CHANGELOG.md`, `ARCHITECTURE.md` | |

## Testing & Verification Checklist

<!-- ALL boxes must be checked before merge. -->

- [ ] `npm run package:vsix` succeeds without errors
- [ ] Manual testing steps documented in the section below
- [ ] Tested in Extension Host with a workspace containing `.csproj` files
- [ ] `CHANGELOG.md` updated under `## [Unreleased]` following the [changelog rules](/.github/copilot-instructions.md)
- [ ] `ARCHITECTURE.md` updated (if new components, message types, state patterns, or data flows were added)
- [ ] `README.md` updated (if user-facing behavior changed)
- [ ] Screenshots or recordings attached below (if UI changes)
- [ ] Performance impact assessed in the Performance Notes section below

## Manual Testing Steps

<!--
  Numbered steps to reproduce and verify the change in the VS Code Extension Host.
  Be precise — the reviewing agent validates these against the diff.
-->

1. Open a workspace containing `.csproj` / `.fsproj` / `.vbproj` files in the Extension Host (F5)
2. Command Palette → "nUIget: Manage NuGet Packages"
3. <!-- Add your verification steps here -->

## Screenshots / Recordings

<!--
  Required for UI changes. Drag-and-drop images or screen recordings.
  For non-UI changes, write "N/A — no UI changes".
-->

N/A — no UI changes

## Security Review Checklist

<!--
  ALL boxes must be checked. This extension handles credentials, HTTP requests,
  and webview content — security is critical.
-->

- [ ] No new user input processed without validation (see `NuGetUtils.ts` validators)
- [ ] No credentials or secrets exposed in logs, state, or error messages (see `CredentialService.ts` redaction)
- [ ] Webview Content-Security-Policy (CSP) unchanged, or changes reviewed for safety
- [ ] HTTP / external requests use existing safe patterns (`Http2Client`, `fetchJsonHttp1` with redirect limits)
- [ ] No XSS vectors introduced — `renderMarkdownToHtml()` pipeline (`DOMPurify` + `marked`) intact
- [ ] No new `innerHTML` or `dangerouslySetInnerHTML` usage outside the sanitized pipeline
- [ ] No new `eval()`, `Function()`, or dynamic code execution

## Performance Notes

<!--
  Brief assessment of performance impact. Examples:
  - "No performance impact — documentation-only change"
  - "Added LRU cache for X to reduce redundant API calls"
  - "New DOM elements added to list rendering — tested with 500+ packages, no jank"
  If uncertain, describe what was measured and how.
-->



## Additional Context

<!--
  Anything else the reviewing agent should know: design decisions, trade-offs,
  alternatives considered, migration notes, or links to relevant discussions.
-->



---

<details>
<summary><strong>Agent Routing Hints</strong> (expand for component-to-file mapping)</summary>

Use these hints to locate relevant source files when reviewing the diff:

| Component | Primary Files |
|-----------|--------------|
| Main Panel | `src/webview/NuGetPanel.ts`, `src/webview/app/App.tsx`, `src/webview/app/components/` |
| Sidebar | `src/webview/NuGetSidebarPanel.ts`, `src/webview/sidebar/SidebarApp.tsx`, `src/webview/sidebar/components/` |
| NuGet Service / API | `src/services/NuGetService.ts`, `src/services/NuGetOperations.ts` |
| Config / Sources | `src/services/NuGetConfigParser.ts`, `src/services/NuGetTypes.ts` |
| CLI / dotnet Integration | `src/services/NuGetService.ts` (search for `exec`/`spawn` calls) |
| Extension Core | `src/extension.ts` |
| HTTP / Networking | `src/services/Http2Client.ts` |
| Credentials / Auth | `src/services/CredentialService.ts` |
| Caching | `src/services/WorkspaceCache.ts` |
| Utilities / Validators | `src/services/NuGetUtils.ts` |
| Shared Types | `src/services/NuGetTypes.ts`, `src/webview/app/types.ts` |
| Package Operations | `src/services/NuGetOperations.ts` |
| Markdown Rendering | `src/webview/app/markdownSetup.ts` |
| Icons (SVG) | `src/webview/app/icons.tsx` |

**Key references:**
- [`ARCHITECTURE.md`](/ARCHITECTURE.md) — Component interactions, message protocol, state management, caching strategies, auth flow
- [`.github/copilot-instructions.md`](/.github/copilot-instructions.md) — Known gotchas, pitfalls, build commands, verification steps
- Cross-panel sync: operations use `notifySidebarOfChange(operation)` (not `refreshSidebar()`). See `NuGetOperations.ts`.
- Bulk results include `failedPackageIds` / `perProjectFailedIds` for optimistic UI updates.
- `.csproj` parsing is primary; `dotnet list package` is fallback (NU1900 workaround).

</details>

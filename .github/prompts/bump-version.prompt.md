# Bump Version

Analyze the current `## [Unreleased]` section in `CHANGELOG.md` and determine the appropriate version bump, then apply it to both `package.json` and `CHANGELOG.md`.

## Step 1 — Read current state

1. Read `package.json` to get the current `"version"` field.
2. Read the `## [Unreleased]` section in `CHANGELOG.md` to see what changes are pending.
3. If `## [Unreleased]` is empty (no entries), stop and tell the user there is nothing to release.

## Step 2 — Determine version bump type

Apply [Semantic Versioning](https://semver.org/spec/v2.0.0.html) rules to the unreleased changes:

| Bump | When |
|------|------|
| **Major** | Breaking changes, removed public APIs, backwards-incompatible behavior changes |
| **Minor** | New features (`### Added`), new commands/settings, significant non-breaking `### Changed` |
| **Patch** | Bug fixes (`### Fixed`), performance improvements, internal refactors, docs-only changes |

If the unreleased section contains a mix, use the **highest applicable** bump (major > minor > patch).

Present your analysis to the user: list what you found in `[Unreleased]`, state which bump type you chose, and show the old → new version. Proceed with the bump.

## Step 3 — Validate changelog integrity

Before bumping, check for changelog issues and fix them if found:

1. **Missing version entries**: Run `git log --format="%H %ai %s" --all -- package.json | Select-String "version"` to find version-bump commits. Compare against `## [X.Y.Z]` headers in `CHANGELOG.md`. If versions are missing, reconstruct them from git history using diffs between version commits (e.g., `git diff <commit1>..<commit2> -- CHANGELOG.md`).
2. **Duplicate content**: Check if two adjacent version sections have identical entries. Remove duplicates.
3. **Out-of-order versions**: Ensure versions are in descending order (newest first).
4. **Missing dates**: If any version header lacks a date, look up the commit date from git history and add it.

## Step 4 — Apply the version bump

### 4a. Update `package.json`

Change the `"version"` field from the old version to the new version.

### 4b. Update `CHANGELOG.md`

1. Rename the existing `## [Unreleased]` header to `## [X.Y.Z] - YYYY-MM-DD` using today's date.
2. Add a fresh empty `## [Unreleased]` section above the new version entry.
3. Ensure the content under the new version header follows the changelog format rules:
   - `### Added` entries: **bold headline** followed by a brief description (e.g., `- **New Feature** — Short explanation`).
   - `### Fixed` and `### Changed` entries: **bold headline** only per bullet (e.g., `- **Some Fix**`). No descriptions after the headline.
   - Never edit content under previously released version sections.

The result should look like:

```markdown
## [Unreleased]

## [X.Y.Z] - YYYY-MM-DD

### Added
- ...

### Changed
- ...
```

### 4c. Store memory

After bumping, check if `/memories/version-bump-workflow.md` exists. If not, create it with:

```
# Version Bump Workflow

When the user says "bump patch version" (or minor/major), ALWAYS do BOTH:

1. **package.json**: Bump the `"version"` field
2. **CHANGELOG.md**: Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` (today's date), then add a fresh empty `## [Unreleased]` section above it

Never bump only package.json without updating the changelog.
```

## Step 5 — Verify

1. Confirm `package.json` has the new version.
2. Confirm `CHANGELOG.md` has an empty `## [Unreleased]` at the top, followed by the new `## [X.Y.Z] - YYYY-MM-DD` section with the moved content.
3. Run `Select-String "## \[" CHANGELOG.md | Select-Object -First 10` to show the version header structure.

Report the final version number to the user.

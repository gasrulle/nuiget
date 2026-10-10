---
description: 'Bump the extension version consistently without publishing or committing'
---

# Bump Version

Perform this workflow only when the user requests a version bump. A version bump
does not authorize committing, pushing, tagging, publishing, or writing memory.

## Read and decide

1. Read `package.json`, `package-lock.json`, the repository release instructions,
   and the `## [Unreleased]` section in `CHANGELOG.md`.
2. If there are no unreleased entries, stop and explain that there is nothing to
   release.
3. Honor an explicitly requested bump. Otherwise choose the highest applicable
   Semantic Versioning level: major for breaking changes, minor for new features,
   patch for fixes or internal changes. Explain the old and new version.
4. Inspect changelog headers using `git log --format="%H %ai %s" -- package.json`
   and `git diff` as needed. Report missing, duplicate, or out-of-order historical
   entries; do not reconstruct or edit already released sections automatically.

## Apply

- Use `npm version <new-version> --no-git-tag-version --ignore-scripts` to update
  the manifest and lockfile together without a Git commit, tag, or lifecycle
  script execution.
- Rename the current `## [Unreleased]` header to
  `## [<new-version>] - YYYY-MM-DD` with today's date and insert a fresh empty
  `## [Unreleased]` above it.
- Preserve the repository's changelog format: Added bullets have a bold headline
  and brief description; Fixed and Changed bullets have a bold headline only.
- Do not modify previously released sections or bump the version again during
  a later packaging/publishing step.

## Verify

Confirm `package.json.version`, `package-lock.json.version`, and
`package-lock.json.packages[""].version` agree. Inspect the diff for unrelated
changes and confirm the fresh Unreleased section precedes the new release.
Report the version and whether any release-history inconsistencies remain.

See [npm version](https://docs.npmjs.com/cli/commands/npm-version) for versioning
and Git integration options.

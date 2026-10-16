# Release checklist — nUIget 2.0.0

Plan item P8.3 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`), ADR-000 D9: CI builds the VSIX and uploads it as
the `vsix` artifact; the owner merges the release pull request and publishes by hand. Sessions and agents never
publish, tag a release or merge the release pull request.

## Filled by the session

| Check | Result |
|---|---|
| Version | `2.0.0` in `package.json`, `package-lock.json` (`version` and `packages[""].version`) |
| CHANGELOG | `## [2.0.0] - 2026-10-16` with `### Breaking changes`, `### Added`, `### Changed`; empty `## [Unreleased]` above it |
| Release commit | pending, filled by the follow-up commit |
| `npx tsc --noEmit` | exit 0 |
| `npm run check-types` | exit 0 |
| `npx eslint src` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0; 129 files, 1910 passed, 9 skipped (platform and `NUIGET_SDK_TESTS` predicates) |
| `npm run bench` | exit 0 |
| `npm run docs:check` | exit 0 |
| `node esbuild.mjs --production --analyze` | extension 293183, webview 525241, sidebar 319313 bytes, all under their ceilings |
| `npm run package:vsix` | exit 0; `nuiget-v2.0.0.vsix`, 17 files, 564.82 KB |
| `npm run check:vsix` | OK |
| `npm run test:e2e`, `npm run test:ui` | SKIPPED locally: no product code changed; CI runs both on the push |
| `labs/2.0` CI run and `vsix` artifact | pending, filled by the follow-up commit |
| Release pull request | pending, filled by the follow-up commit |

## Owner

### 1. Merge the release pull request

- `main` allows squash merges only, so all of 2.0 lands as one commit. The per-item history stays on `labs/2.0` and
  its `labs/2.0-P*-done` tags: keep the branch and the tags.
- Required checks on `main` (ruleset 12524593): `Lint`, `Build & Package`, `Test (ubuntu-latest)`,
  `Test (windows-latest)`, strict. The rules "extra approval for unattributed changes" and "review thread resolution"
  are on and were not checked against this pull request; the admin bypass covers them if they block.
- Branch 2.0.1 work from `main` after the merge, never from `labs/2.0`, or its pull request shows every 2.0 commit
  again.

### 2. Get the VSIX

Download the `vsix` artifact (`nuiget-v2.0.0.vsix`) from the last CI run of the release pull request
(Actions → the run → Artifacts).

### 3. Publish: pick one route

The CI artifact is packaged without `--pre-release` (`.github/workflows/ci.yml`, `npx vsce package`), and vsce 4.0.0
refuses `vsce publish --pre-release` for a VSIX that was not packaged as a pre-release. The Marketplace also needs
different versions for a pre-release and a regular release ("Versions must be different between pre-release and
regular releases", VS Code publishing docs).

**Route A — pre-release first (ADR-000 D9 as written).** On the merged `main`:

```bash
npm ci --no-audit --no-fund
```

```bash
npx vsce package --pre-release --out nuiget-v2.0.0-pre-release.vsix
```

```bash
npm run check:vsix
```

```bash
npx vsce publish --pre-release --packagePath nuiget-v2.0.0-pre-release.vsix
```

The Marketplace upload page works too; the VSIX carries the pre-release flag.
**The regular release must then be 2.0.1 or later**, through a new `bump-version` pull request branched from
`main`, whose CI `vsix` artifact is the release.

**Route B — regular release directly.** Publish the CI artifact `nuiget-v2.0.0.vsix` as the regular release (upload
page, or `npx vsce publish --packagePath nuiget-v2.0.0.vsix`). This skips D9's "pre-release first"; only the owner
may elect it.

### 4. Tag and GitHub release

After publishing, tag the merged commit on `main` `v2.0.0` (route A: `v2.0.0` for the pre-release, `v2.0.1` for the
later release) and create the GitHub release with the CHANGELOG section. Open VSX, if used, is the owner's too.

### 5. Known after the release

- 1.18.9 users have the truncation of long prerelease versions in CLI search; 2.0.0 does not (it reads
  `dotnet package search --format json`), but its CHANGELOG does not say so: the bullet was removed with the eleven
  fixes of unshipped 2.0 code.
- Released CHANGELOG history has older inconsistencies, left as released: 1.15.0 is listed above 1.15.1, 1.12.0 and
  1.11.0 have no date, 1.13.0 is dated 2025-03-12.

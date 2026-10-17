# Release checklist — nUIget 2.0.0

Plan item P8.3 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`), ADR-000 D9: CI builds the VSIX and uploads it as
the `vsix` artifact; the owner merges the release pull request and publishes by hand. Sessions and agents never
publish, tag a release or merge the release pull request.

## Filled by the session

Refilled at P10.1 (2026-10-17) after phase P9 (1.x parity, owner-approved) and P10.0 (regression matrix).

| Check | Result |
|---|---|
| Version | `2.0.0` in `package.json`, `package-lock.json` (`version` and `packages[""].version`); unchanged since P8.3 |
| CHANGELOG | `## [2.0.0] - 2026-10-17` with `### Breaking changes`, `### Added`, `### Changed`, `### Fixed`; the P9 entries folded in from `[Unreleased]`, which is empty above it |
| Release commit | the P10.1 commit on `labs/2.0` (its SHA and CI run are in `docs/plans/STATUS.md`, row P10.1, and in the release pull request's description) |
| `npx tsc --noEmit` | exit 0 |
| `npm run check-types` | exit 0 |
| `npx eslint src` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0; 137 files, 2030 passed, 9 skipped (platform and `NUIGET_SDK_TESTS` predicates) |
| `npm run bench` | exit 0 |
| `npm run docs:check` | exit 0 |
| `npm run check:matrix` | exit 0; 168 rows: 165 covered, 0 gap, 3 manual-credentials (`docs/plans/regression-matrix.md`) |
| `node esbuild.mjs --production --analyze` | extension 297018, webview 548943, sidebar 333252 bytes, all under their ceilings (322502 / 577766 / 351245) |
| `npm run package:vsix` | exit 0; `nuiget-v2.0.0.vsix`, 17 files, 581.31 KB |
| `npm run check:vsix` | OK |
| `npm run test:e2e`, `npm run test:ui` | run by CI on every push; the UI job screenshots 15 named states |
| Approved screenshots | CI run [39025149785](https://github.com/gasrulle/nuiget/actions/runs/39025149785), artifact `ui-screenshots`; the owner wrote "P9 approved" on 2026-10-17 |
| Release pull request | [#18](https://github.com/gasrulle/nuiget/pull/18), `labs/2.0` → `main`, not a draft |

## Manual checks before publishing — the only ones

Everything else is automated (`docs/plans/regression-matrix.md`). These three rows need a real credentialed package
source, which CI does not have; they are copied from the matrix verbatim. For each: configure the source as the row
says, open a project that uses it, and check that search, the version list, the details, the icon and an install work
with no authentication error in the nUIget output channel. The manual screen-reader pass (plan item P7.4) is a 2.0.1
item, not a release check.

| Matrix row | Check | Automated part |
|---|---|---|
| R166 | A private feed with a clear-text `nuget.config` credential: search, versions, details, icons and install against the real feed | `src/core/credentials/DefaultCredentialProvider.test.ts`: config: clear-text password becomes a Basic header |
| R167 | A Windows `nuget.config` password encrypted by `dotnet nuget add source --password` (DPAPI): the real feed answers | `src/core/sources/NuGetConfigReader.test.ts`: dpapi (Windows, SDK 10): a password that dotnet nuget add source encrypted decrypts to the value that was stored |
| R168 | An Azure Artifacts feed through the credential provider plugin: the real feed answers | `src/core/credentials/DefaultCredentialProvider.test.ts`: provider: runs the netcore plugin through the runner with the URL as one argv element |

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

- The CHANGELOG lists no fix of a bug that only unreleased 2.0 code had (owner's rule, P8.3): the eleven of P8.3 and
  the seven of P9 (package size, a project bounced after discovery, the sidebar's transitive prefetch, and the four
  P9.fix layouts) were left out; their end state is in `### Changed`. The prerelease-version fix that 1.18.9 users lack
  stays under `### Fixed` (owner, 2026-10-16).
- Released CHANGELOG history has older inconsistencies, left as released: 1.15.0 is listed above 1.15.1, 1.12.0 and
  1.11.0 have no date, 1.13.0 is dated 2025-03-12.

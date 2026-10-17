# ADR-000: Release and compatibility policy

Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P0.9: decisions D2, D4, D9, D10, D11, D13)

## Context

The 1.x line accumulated incremental fixes on an architecture that was never redesigned for
two surfaces, all-projects mode, streaming and cross-panel sync (see
`docs/plans/2026-10-10-audit-and-modernization-plan.md`). The owner has stated that breaking
changes are acceptable and no backward compatibility is required.

The amendments of 2026-10-12 record owner decisions taken in
`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` (§1). That plan supersedes the execution
sections of the audit plan named above.

## Decision

- 2.0.0 is a clean break. The webview ↔ host protocol, persisted storage keys and internal module
  layout are replaced without migration shims. Legacy handlers, the `nuiget.noRestore` migration
  and compatibility aliases are deleted rather than kept.
- Persisted state moves from `nuget.*` to `nuiget.*` keys. Users re-select project/source once.
- `engines.vscode` stays at `^1.85.0` for 2.0; `@types/vscode` is pinned to the same minimum.
  Raising the floor requires a concrete API need recorded in an ADR.
- **.NET SDK floor is 10 (D13).** 2.0 uses the noun-first CLI only (`dotnet package add/remove/list
  --project`); verb-first syntax and per-SDK capability detection are removed. The gate is the SDK
  that **each project resolves**, so a `global.json` pin wins over the newest installed SDK. A project
  that resolves an SDK below 10 is shown as `unsupported` with the message "requires .NET SDK 10 or
  newer" and is read-only; browsing and searching still work. .NET 8 and 9 leave Microsoft support on
  2026-11-10, before 2.0 ships.
- **Extension-host baseline is VS Code 1.85: Node 18.15 and Chromium 114 (D10).** The main program
  (`tsconfig.json`) type-checks against Node 18 declarations: the dev dependency `@types-host/node`
  is an npm alias of `@types/node@18.19.130`, pinned exactly, and `typeRoots` lists
  `node_modules/@types-host` before `node_modules/@types`. The alias folder is named `node` on purpose,
  so that `types: ["node"]` and every transitive `/// <reference types="node" />` resolve to it and no
  Node 24 declaration enters the main program. Tests (`tsconfig.test.json`) and tooling type-check
  against `@types/node@24`. `engines.node` in `package.json` is the development-toolchain floor and
  says nothing about the host. Known residual: the 18.19 declarations also describe APIs added in
  Node 18.16 to 18.19; the end-to-end run on VS Code 1.85.0 covers that gap at runtime. Bundles target
  `node18` and `chrome114`.
- **"All Projects" means the discovered projects grouped by workspace folder (D2).** 2.0 does not
  parse solution files.
- **The 2.0 user interface is English only (D11).** `vscode.l10n` is deferred.
- Unsupported project formats (`packages.config`, non-SDK-style) are detected and shown as
  unsupported instead of rendering an empty list.
- Install reproducibility: CI and `package:vsix` use `npm ci`.
- **Release procedure (D9).** CI builds the VSIX and uploads it as an artifact; the owner publishes it
  manually, as a pre-release first. Automated sessions and agents never publish, tag a release or
  merge the release pull request.

## Consequences

- No dual-protocol period: the 2.0 webviews and host speak only the 2.0 protocol, and no shim, alias
  or legacy handler bridges 1.x messages or storage. Until the flip (D4), 1.x and 2.0 coexist in the
  tree as separate build entries (`node esbuild.mjs --v2` selects 2.0; the default selects legacy),
  a 2.0 feature never replaces a legacy route in place, and the legacy code is deleted in one step
  after both 2.0 webviews are complete (plan items P8.1 and P8.2).
- CHANGELOG 2.0.0 carries a "Breaking changes" section (storage reset, removed setting migration).
- Until that section is assembled at release, a breaking change is recorded under `## [Unreleased]`
  `### Changed` as a headline that starts with `**Breaking:**`.
- Users whose projects resolve .NET SDK 8 or 9 can browse but not modify packages in 2.0; they stay
  on 1.18.x or install SDK 10.
- A Node API newer than 18.15 fails type-checking in the main program unless it exists in the 18.19
  declarations; reviewers check such additions against the Node 18.15 documentation.

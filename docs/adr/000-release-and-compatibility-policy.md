# ADR-000: Release and compatibility policy

Status: accepted · Date: 2026-10-10

## Context

The 1.x line accumulated incremental fixes on an architecture that was never redesigned for
two surfaces, all-projects mode, streaming and cross-panel sync (see
`docs/plans/2026-10-10-audit-and-modernization-plan.md`). The owner has stated that breaking
changes are acceptable and no backward compatibility is required.

## Decision

- 2.0.0 is a clean break. The webview ↔ host protocol, persisted storage keys and internal module
  layout are replaced without migration shims. Legacy handlers, the `nuiget.noRestore` migration
  and compatibility aliases are deleted rather than kept.
- Persisted state moves from `nuget.*` to `nuiget.*` keys. Users re-select project/source once.
- `engines.vscode` stays at `^1.85.0` for 2.0; `@types/vscode` is pinned to the same minimum.
  Raising the floor requires a concrete API need recorded in an ADR.
- Supported .NET SDKs: 8, 9, 10 (noun-first CLI syntax detection stays). Older SDKs are
  best-effort.
- Unsupported project formats (`packages.config`, non-SDK-style) are detected and shown as
  unsupported instead of rendering an empty list.
- Install reproducibility: CI and `package:vsix` use `npm ci`.

## Consequences

- No dual-protocol period; features migrate one at a time but the old route is deleted in the
  same change that lands its replacement.
- CHANGELOG 2.0.0 carries a "Breaking changes" section (storage reset, removed setting migration).

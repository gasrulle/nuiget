# ADR-004: Three-tier project model and Central Package Management

Status: accepted · Date: 2026-10-10

## Context

Regex `.csproj` parsing produced `version: 'unknown'` for CPM references (which then compared as
`0.0.0` → everything "updatable"), ignored `Update=`, `VersionOverride`, conditions, imports and
property expansion. Static XML cannot evaluate MSBuild; only the nearest `Directory.Packages.props`
is imported automatically and conditions must be evaluated, not captured.

## Decision

Three tiers with explicit fidelity:

1. **Inspect** (`ProjectInspector`, fast): `fast-xml-parser` over the project file plus the nearest
   `Directory.Packages.props` (walking up until found or a drive/workspace root). Produces
   `fidelity: 'provisional'`. Handles `PackageReference` `Include`/`Update`, `Version`
   attribute/element, `VersionOverride`, `Condition` captured as `targetFrameworks` when it is a
   simple `'$(TargetFramework)' == 'x'` comparison, CPM `PackageVersion`, `ManagePackageVersionsCentrally`.
   Unresolvable versions (`$(Prop)`, unknown conditions) are `declaration: 'unresolved'` and are
   **excluded from update checks** and shown as unresolved.
2. **Evaluate** (`ProjectEvaluator`, authoritative): `dotnet msbuild <proj> -getItem:PackageReference
   -getProperty:TargetFramework;TargetFrameworks;ManagePackageVersionsCentrally -nologo`
   per target framework, cached by project revision (project + imported props/targets +
   `global.json` + `Directory.*.props` mtimes). Produces `fidelity: 'authoritative'`. Runs off the
   render path; the UI upgrades from provisional to authoritative when it lands.
3. **Mutate** (`ProjectMutator`): only SDK-verified commands. Non-CPM: `dotnet package add/remove`.
   CPM: verified per SDK major whether `dotnet package add` updates the central version
   (`cpmAwareAdd`); when not verified the UI offers read-only with an explanation. CPM mutations
   show an **affected-projects preview** (every project importing the props file without an
   override), distinguish central update vs project `VersionOverride`, invalidate and restore all
   consumers, refuse when the props file has unsaved editor changes, and never delete a central
   entry because one project uninstalled.

Unsupported formats (`packages.config`, non-SDK-style) are detected and reported as
`unsupported` with a reason.

## Consequences

- `InstalledResult` carries `fidelity`, `isCpm`, `centralPropsPath`, per-package `declaration`.
- Update checks skip `unresolved` packages; CPM packages compare the central version.

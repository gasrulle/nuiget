# ADR-004: Three-tier project model and Central Package Management

Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: `props` declaration, `PackageVersion` items, runs per target framework, SDK floor, CPM edits refused until the mutator) · Amended: 2026-10-15 (plan item P6.3: the decision carries isCpm, the dirty check covers the project file, override and unresolved rows refused until probed) · Amended: 2026-10-15 (plan item P6.2b: the evaluator's properties, mapping and cache) · Amended: 2026-10-15 (plan item P6.4a: the preview reaches the webviews; the override choice waits for N74) · Amended: 2026-10-16 (plan item P7.2c: the combined first run)

## Context

Regex `.csproj` parsing produced `version: 'unknown'` for CPM references (which then compared as
`0.0.0` → everything "updatable"), ignored `Update=`, `VersionOverride`, conditions, imports and
property expansion. Static XML cannot evaluate MSBuild; only the nearest `Directory.Packages.props`
is imported automatically and conditions must be evaluated, not captured.

The amendment of 2026-10-12 records the contract changes of plan item P1.1b and plan decisions D7 and
D13 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`, §1).

## Decision

Three tiers with explicit fidelity:

1. **Inspect** (`ProjectInspector`, fast): `fast-xml-parser` over the project file plus the nearest
   `Directory.Packages.props` (walking up until found or a drive/workspace root). Produces
   `fidelity: 'provisional'`. Handles `PackageReference` `Include`/`Update`, `Version`
   attribute/element, `VersionOverride`, `Condition` captured as `targetFrameworks` when it is a
   simple `'$(TargetFramework)' == 'x'` comparison, CPM `PackageVersion`, `ManagePackageVersionsCentrally`.
   A `PackageReference` declared in an imported props file such as `Directory.Build.props` has
   `declaration: 'props'`; `InstalledPackage.definedIn` holds the absolute path of the declaring file
   whenever that is not the project file.
   Unresolvable versions (`$(Prop)`, unknown conditions) are `declaration: 'unresolved'` and are
   **excluded from update checks** and shown as unresolved.
2. **Evaluate** (`ProjectEvaluator`, authoritative): one run that returns the four properties and the
   `PackageReference` and `PackageVersion` items with no global property (`dotnet msbuild <proj> -nologo
   -getItem:PackageReference,PackageVersion
   -getProperty:TargetFramework;TargetFrameworks;ManagePackageVersionsCentrally;CentralPackageVersionOverrideEnabled`);
   when `TargetFrameworks` is empty that run is the whole evaluation (probe row `cpm-combined`: the
   properties of `cpm-properties` and the items of `cpm-items-net8.0`), and when it is set the run is
   the outer build, whose items lack the conditional and SDK-implicit references (probe row
   `multitfm-combined`) and are discarded for one item run per target framework with
   `-p:TargetFramework=<tfm>` (plan items P6.2 and P7.2c). The properties run reads `TargetFramework`, `TargetFrameworks`, `ManagePackageVersionsCentrally` and `CentralPackageVersionOverrideEnabled` (the probe of `004-sdk-probes.md`, SDK 10.0.401 `evaluations`); the item runs read `Identity`, `Version`, `VersionOverride`, `IsImplicitlyDefined` and `DefiningProjectFullPath`. A reference whose defining file is not the project is `props` with `definedIn` set, an SDK-injected one also `isImplicit`; under CPM `VersionOverride` wins while overrides are enabled, else the `PackageVersion` item, else `unresolved`; rows are merged across frameworks by id, version, declaration and implicitness, and `targetFrameworks` is set only where a row is absent from some framework. Successes are cached per project and revision; a failure is not. Cached by project revision (project + imported props/targets + `global.json` +
   `Directory.*.props` mtimes). Produces `fidelity: 'authoritative'`. Runs off the render path; the
   UI upgrades from provisional to authoritative when it lands.
3. **Mutate** (`ProjectMutator` in `src/core/contracts.ts`: `canMutate`, `previewCpmImpact`): only
   SDK-verified commands, on SDK 10 only (plan decision D13). Non-CPM: `dotnet package add/remove`.
   CPM: `cpmAwareAdd` and `cpmAwareAddProvenance` say whether `dotnet package add` updates the
   central version and how that is known; they come from the tracked probe fixture
   ([SDK probes](004-sdk-probes.md)), and the provenance is `'verified'` only when a fixture proves
   it. When it is not verified the UI offers read-only with an explanation. CPM mutations show an
   **affected-projects preview** (every project importing the props file without an override),
   distinguish central update vs project `VersionOverride` (the UI offers the central update alone until finding N74 is probed; a `central-override` row is read-only for updates and the `cpm/preview` request carries the preview to the webviews), invalidate and restore all consumers,
   refuse when the props file has unsaved editor changes, or the project file, and never delete a central entry because
   one project uninstalled. SDK 10 rewrites the props file on every `package add --version`, even
   without a version change (finding 2 of the SDK probes); the mutator treats the file as modified
   after any add. An `install` or `update` of a reference that carries `VersionOverride`, or whose version the inspection cannot resolve, is refused until a probe row shows what `dotnet package add --version` edits there (finding N74); the admitting decision carries `isCpm`, and the workflow builds the command from that value alone.

   2.0 never passes `--no-restore` to `package add` on a CPM project, in any phase (plan decision D7).
   Until the mutator lands (plan item P6.3), it also refuses `add` and `update` on CPM projects
   unconditionally; `remove` stays allowed, because it edits only the project's own reference.

Unsupported formats (`packages.config`, non-SDK-style) and a project whose resolved SDK is below 10
(`sdk-too-old`, read-only, D13) are detected and reported as `unsupported` with a reason.

## Consequences

- `InstalledResult` carries `fidelity`, `isCpm`, `centralPropsPath`, per-package `declaration`.
- Update checks skip `unresolved` packages; CPM packages compare the central version.

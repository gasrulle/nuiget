# ADR-004 supplement: SDK probes for Central Package Management mutation

Status: evidence for [ADR-004](004-project-model.md) tier 3 (`ProjectMutator`) · Probed: 2026-10-12

This file is not a separate decision. It records what `dotnet package add` and `dotnet package remove`
were **measured** to do on a Central Package Management (CPM) project, so that the `cpmAwareAdd`
capability in ADR-004 rests on a tracked fixture instead of on documentation or memory.

Machine-readable result: [`src/core/cli/__fixtures__/sdk-probes/10.0.401.json`](../../src/core/cli/__fixtures__/sdk-probes/10.0.401.json).

## What was probed

- SDK 10.0.401 (MSBuild 18.9.11), macOS 27.0, `osx-arm64`; no `global.json`, so the newest installed SDK
  was resolved. `dotnet --version` in the probe directory printed `10.0.401`.
- Every command ran in a **fresh copy** of the fixture below, so each diff belongs to one command. The two
  `restore` rows are the exception: each continues in the directory its predecessor left behind
  (`continueFrom` in the JSON).
- Package source: nuget.org only, through a local `nuget.config` with `<clear />`.

The quarry's parser fixture (`src/core/project/__fixtures__/cpm`) cannot be restored: it references
`Not.Central`, which has no central version, and a project reference whose target sets `Version` under
CPM. The probe therefore used its two relevant files reduced to what restores:

```xml
<!-- Directory.Packages.props -->
<Project>

  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>

  <ItemGroup>
    <PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
    <PackageVersion Include="Serilog" Version="4.0.0" />
  </ItemGroup>

</Project>
```

```xml
<!-- App/App.csproj -->
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" />
    <PackageReference Include="Serilog" />
  </ItemGroup>

</Project>
```

## Results on SDK 10.0.401

All commands are `dotnet package … --project App/App.csproj` and all exited 0. "Reformatted" means the
file was rewritten with no semantic change (see [Findings](#findings)).

| Row (`id` in the JSON) | Command | `App.csproj` | `Directory.Packages.props` |
|---|---|---|---|
| `add-same-version` | `add Serilog --version 4.0.0` | unchanged | reformatted only |
| `add-same-version-no-restore` | `add Serilog --version 4.0.0 --no-restore` | unchanged | reformatted only |
| `add-newer-version` | `add Serilog --version 4.1.0` | unchanged | `Serilog` 4.0.0 → 4.1.0 |
| `add-newer-version-no-restore` | `add Serilog --version 4.1.0 --no-restore` | unchanged | `Serilog` 4.0.0 → 4.1.0 |
| `restore-after-no-restore-add` | `dotnet restore App/App.csproj` afterwards | unchanged | unchanged; restore succeeds |
| `add-no-version` | `add Newtonsoft.Json` | unchanged | unchanged (not even reformatted) |
| `add-absent` | `add Polly --version 8.4.2` | bare `<PackageReference Include="Polly" />` added | `<PackageVersion Include="Polly" Version="8.4.2" />` added |
| `add-absent-no-restore` | `add Polly --version 8.4.2 --no-restore` | same as above | same as above |
| `restore-after-no-restore-add-absent` | `dotnet restore App/App.csproj` afterwards | unchanged | unchanged; restore succeeds |
| `remove` | `remove Serilog` | reference removed | unchanged (central entry kept) |

Verdict recorded in the fixture:

| Key | Value | Proved by |
|---|---|---|
| `addUpdatesCentralVersion` | `true` | `add-newer-version` |
| `noRestoreWritesProjectVersion` | `false` | `add-newer-version-no-restore` and the restore that follows it |
| `addWithoutCentralEntryCreatesIt` | `true` | `add-absent` |
| `removeKeepsCentralEntry` | `true` | `remove` |

## Control on SDK 8.0.425

The same fixture, pinned with `global.json` (`"version": "8.0.425"`, `"rollForward": "disable"`), was given
the verb-first equivalent of the `add-newer-version-no-restore` row on the same day:

```text
$ dotnet add App/App.csproj package Serilog --version 4.1.0 --no-restore
info : PackageReference for package 'Serilog' version '4.1.0' updated in file '<probe>/App/App.csproj'.

$ dotnet restore App/App.csproj
<probe>/App/App.csproj : error NU1008: Projects that use central package version management should not
define the version on the PackageReference items but on the PackageVersion items: Serilog.
```

`App.csproj` gained `<Version>4.1.0</Version>` inside the `Serilog` reference and
`Directory.Packages.props` was left untouched. This reproduces finding N1 on the fixture that SDK 10
handles correctly, so the difference is the SDK and not the fixture. The control is prose only: SDK 8 and 9
are below the 2.0 floor (plan D13) and get no tracked probe.

## Findings

1. **`--no-restore` no longer corrupts a CPM project on SDK 10.0.401.** The CPM-aware write no longer depends
   on the restore preview: the central file is updated with or without `--no-restore`, the project never
   receives a `Version`, and the next restore succeeds. Finding N1 as measured is an SDK 8 behaviour; SDK 9
   was not probed.
2. **SDK 10 rewrites `Directory.Packages.props` on every `package add --version`, including a no-op.** Blank
   lines between elements and the final newline are stripped even when the requested version already equals
   the central one, and also under `--no-restore`. The `propsDiff` of the two `add-same-version` rows is
   therefore non-empty although nothing changed semantically. Only `add` without `--version` left the file
   alone. The SDK 8 notes had recorded just the lost final newline.
3. **A package absent from the central file is added to both files**, as a bare reference in the project and a
   `PackageVersion` in the props file. In both files `Polly` landed between `Newtonsoft.Json` and `Serilog`.
4. **`remove` edits only the project.** The central entry stays, which is what ADR-004 requires ("never
   delete a central entry because one project uninstalled").

## Consequences

- Plan decision D7 is unchanged: until the mutator lands (P6.3), 2.0 refuses `add` and `update` on CPM
  projects, and 2.0 never passes `--no-restore` to `package add` on a CPM project. One SDK patch on one
  platform with one project shape does not justify relaxing a rule whose failure corrupts a project file.
- `sdk.ts` (P1.6) reads `verdict` from the fixture to set `cpmAwareAdd` and its provenance for SDK 10.
- The mutator (P6.3) has to treat the props file as rewritten after any `add --version`, because of
  finding 2: dirty-file refusal, consumer invalidation and the diff a user sees in source control are all
  affected even when the version did not change.
- The 1.x line still supports SDK 8, where N1 is reproduced above. This probe does not change the case for
  the optional guard P0.14.

## Limits of this evidence

One SDK patch (10.0.401), one platform (macOS arm64), one single-target project, exact versions only. Not
covered: multi-targeted projects and conditional references, `VersionOverride`, CPM enabled outside
`Directory.Packages.props`, nested props files, floating versions, Windows. P6.1 (`scripts/probe-sdk.mjs`)
extends the probe; a result there that contradicts this file is a stop-and-ask.

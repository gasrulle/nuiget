# STATUS — src/core/cli   commit 16831f4 (parent of the P0.0 commit)   2026-10-12T06:50:00Z

git status --short src/core/cli: `?? src/core/cli/` (this note and `__fixtures__/sdk-probes/10.0.401.json`, both added by the P0.0 commit)

Item: **P0.0 SDK 10 CPM probe**. Nothing else exists in this directory yet; P1.6 salvages the CLI module
from the quarry and rewrites this note.

## Verified by running

```text
baseline npx tsc --noEmit        → exit 0, no output
baseline npx eslint src          → exit 0, no output
baseline npx vitest run          → Test Files 40 passed (40) · Tests 1491 passed (1491)
probe driver (scratchpad, 10 commands on SDK 10.0.401) → every command exit 0
schema validator (node -e, keys and types of the P0.0 schema)
                                 → VALID: sdk=10.0.401 probedOn=2026-10-12 platform=darwin-arm64 commands=10
                                   verdict={"addUpdatesCentralVersion":true,"noRestoreWritesProjectVersion":false,
                                   "addWithoutCentralEntryCreatesIt":true,"removeKeepsCentralEntry":true}
                                   optionalCommandKeys=[id,continueFrom]
redaction grep (/Users/, home, scratchpad, toolchain path) → 0 matches
npx tsc --noEmit                 → exit 0, no output
npx eslint src                   → exit 0, no output
npm test                         → Test Files 40 passed (40) · Tests 1491 passed (1491)
npm run bench                    → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npm run package:vsix             → SKIPPED: no host, service or esbuild change (plan §2.2 step 5)
npm run test:ui                  → SKIPPED: no source change; not in the plan §2.2 gate list for this item
targeted vitest for src/core/cli → SKIPPED: the item adds no test file; backend include gains src/core in P0.11
```

## Done (tested)

- `__fixtures__/sdk-probes/10.0.401.json`: tracked, redacted probe in the P0.0 schema. The four `verdict`
  booleans are derived by the driver from the diffs, not typed by hand.
- `docs/adr/004-sdk-probes.md`: prose, fixture XML, result table, SDK 8.0.425 control, findings, limits.

## Done (untested)

- Nothing.

## Not started

- Everything P1.6 owns: `DotnetRunner.ts`, `commands.ts`, `sdk.ts`, `validate.ts`, `powershell.ts`,
  `index.ts` and their tests. `sdk.ts` is expected to read `verdict` from the fixture.

## Deviations from contract/ADR (file:line each)

- `docs/adr/README.md:19-22`: added a "Supplements" list linking `004-sdk-probes.md`. The file is under the
  frozen `docs/adr/**` and P0.0 does not name it; it was touched so the new ADR file is indexed, which the
  directory's own convention requires. No decision text changed.
- `docs/adr/004-sdk-probes.md` is named by P0.0, but the name collides with the number of
  `004-project-model.md`. It was written as an evidence supplement to ADR-004 (its tier 3 is the
  `cpmAwareAdd` clause), not as a new ADR number; 009 stays free for P2.8.
- D6 sentinel procedure: the guard hook arrives in P0.5 and `.claude/.contract-change` is not gitignored
  until then, so no sentinel file was created. Authorization is P0.0 naming the ADR file.
- Fixture JSON, `commands[]`: two keys beyond the schema, `id` (row name used by the ADR table) and
  `continueFrom` (present only on the two `restore` rows, which run in the directory the named row left
  behind). The five schema keys are present and typed on every row.
- The quarry fixture `src/core/project/__fixtures__/cpm` cannot be restored (`Not.Central` has no central
  version; `Lib.csproj` sets `Version` under CPM). The probe ran on its `Directory.Packages.props` and
  `App/App.csproj` reduced to `Newtonsoft.Json` 13.0.3 and `Serilog` 4.0.0, with a local nuget.org-only
  `nuget.config`. Exact XML is in the ADR supplement.
- `stdoutTail` holds the last 10 non-empty stdout lines; stderr lines would be appended with a `[stderr] `
  prefix (none occurred).

## Advisor decisions (date, item, question, answer verbatim)

The L1 `architecture-advisor` subagent does not exist until P0.3, so the two questions below went to the
ambient session advisor (plan §2.3 L3). Its replies are not available as quotable text to this note, so they
are recorded as the decisions taken, not verbatim.

- 2026-10-12, P0.0, "The quarry CPM fixture does not restore, the ADR filename reuses number 004, and the
  ledger file does not exist yet: how should the probe, the ADR file and the N1 update be shaped?" →
  Reduce the fixture and isolate sources; fresh copy per command; add a differing-version add because the
  literal `--version 4.0.0` is a no-op; write the ADR file at the literal path as an ADR-004 supplement and
  index it in the README; update the N1 row in plan Appendix A and let P0.13 fold it into the ledger; keep
  the driver out of `scripts/` (P6.1 owns `scripts/probe-sdk.mjs`); do not extend the schema's `verdict`.
- 2026-10-12, P0.0, "SDK 10.0.401 does not write `<Version>` under `--no-restore`, unlike the SDK 8 prose:
  is the verdict sound and does anything else change?" → Verdict confirmed against the four diffs; the
  SDK 8.0.425 control goes in the ADR prose only; record the props reformatting as a finding without
  assigning an N-id; D7, `sdk.ts` capabilities and the P0.14 rationale are not touched by this item.

## Candidate findings for P0.13 (no ID assigned yet)

- SDK 10 rewrites `Directory.Packages.props` (blank lines and final newline stripped) on every
  `package add --version`, including a no-op and under `--no-restore`. Relevant to P6.3 and to the P0.2
  `## 2.0 gotchas` seed.

## Exact next step (one item ID)

P0.2

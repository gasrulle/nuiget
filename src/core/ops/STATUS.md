# STATUS — src/core/ops   commit 08f94e3 (P1.10; parent of the P1.fix-1 commit)   2026-10-12T15:23:42Z

git status --short src/core/ops: ` M src/core/ops/PackageWorkflows.ts`, ` M src/core/ops/PackageWorkflows.test.ts`,
` M src/core/ops/STATUS.md` (they belong to the P1.fix-1 commit, together with ` M ARCHITECTURE.md`,
` M docs/plans/STATUS.md` and ` M docs/plans/findings-ledger.md`)

Items: **P1.10 `src/core/ops/PackageWorkflows.ts` (+test) with uncommitted edits; D7/D13 admission gate**
(⚑ on CPM semantics), landed as `08f94e3`, and **P1.fix-1**, the one blocking finding of the P1 phase
review: `single()` and the bulk workflows now agree when the restore is switched off and the signal is
aborted after the edit.

The quarry has no `STATUS.md` for `src/core/ops`. Its tree holds two files: `PackageWorkflows.ts` (344 lines,
modified and uncommitted there, which is what "with uncommitted edits" means) and `PackageWorkflows.test.ts`
(208 lines, 16 tests). Both were copied from the working tree. There is no `OperationQueue.ts` and no
`index.ts` in the quarry directory; both are P2.1 and neither was written or stubbed.

## Verified by running

P1.10, on `d3abc12` (line numbers in this block are those of `08f94e3`):

```text
The gates ran with DOTNET_ROOT set to the SDK directory and NUIGET_SDK_TESTS=1 (N48).
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0, no output
baseline npx vitest run      → Test Files 62 passed (62) · Tests 2073 passed (2073)
copy from the quarry tree    → cmp: PackageWorkflows.ts and PackageWorkflows.test.ts identical to the quarry
                               working tree
unmodified copy              → npm run check-types: 2 errors in the main program, TS2554 at
                               PackageWorkflows.ts(188,42) and (189,39) (the builders lost their `sdk`
                               argument in P1.6; the later programs were not reached) ·
                               npx eslint src/core/ops exit 0 ·
                               npx vitest run --project backend src/core/ops: 13 failed | 3 passed (16)
                               (every test that reaches a builder; the three that passed are `rejects invalid
                               package ids`, `bulkInstall with every edit failing` and `restore()`)
npm run check-types          → exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src               → exit 0, no output
npm run lint                 → exit 0
npx vitest run --project backend src/core/ops → Test Files 1 passed (1) · Tests 57 passed (57)   (item gate:
                               at least 24, and the three named titles are in the verbose output)
npm test                     → Test Files 63 passed (63) · Tests 2130 passed (2130)
npx vitest run --coverage    → exit 0 · All files 75.98 % statements, 65.74 % branches, 71.4 % functions,
                               77.49 % lines · PackageWorkflows.ts 173 of 177 lines, 97.74 % ·
                               src/core/** 1558 of 1585 lines, 98.30 % (floor 85 %)
npm run bench                → Test Files 16 passed (16) · Tests 101 passed | 1 skipped (102)
npm run package:vsix         → exit 0 · Tests 2129 passed · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 528.84 KB)
                               (run before the last test was added; check-types, lint, npm test and the
                               coverage run were repeated after it, with the results above)
npm run check:vsix           → check:vsix: OK
npm run docs:protocol:check  → exit 0
negative control             → nine single mutations of PackageWorkflows.ts, each run against the tests (56 at
                               that point) and each caught: CPM refusal removed (4 tests fail), SDK floor not applied to
                               remove (1), undetected SDK admitted (1), no abort check between edit and
                               restore (1), transcript not redacted (2), error not redacted (1), bulk status
                               ignores cancellation (3), restoring report without its scope (2), CPM lookup
                               failure admitted (1). The file was restored and compared (cmp) afterwards.
grep "no-restore\|isCpm" PackageWorkflows.ts → `--no-restore` does not occur (the builder emits it);
                               `isCpm: false` occurs once (:225), under the comment that admitEdit ran first
grep "cpmAwareAdd\|nounFirstSyntax\|180_000\|RESTORE_TIMEOUT_MS" src/core/ops/*.ts → the import from '../cli'
                               (:17) and the two uses in runRestore (:257 the limit, :263 its message)
grep redact PackageWorkflows.ts → :302 onCommand receives redactArgv(result.argv), redact(result.stdout),
                               redact(result.stderr); every error string and every logger.warn text passes
                               redact
grep -rln child_process src/core --include='*.ts' → only files under src/core/cli
ls src/core/ops              → PackageWorkflows.ts, PackageWorkflows.test.ts, STATUS.md; no index.ts
git status --short src/core/contracts.ts src/protocol docs/adr → empty (no contract change, no sentinel)
grep Thenable, vscode in src/core/ops → no match
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → run 38267328292 for 08f94e3: success on all required jobs
```

P1.fix-1, on `08f94e3`:

```text
baseline                     → the P1 gate run at 08f94e3 (docs/plans/STATUS.md, "Phase gates"): check-types 0,
                               eslint 0, 63 files and 2130 tests green
grep -n "ctx.signal.aborted" PackageWorkflows.ts → four hits: :90 restore(), :171 editSequence,
                               :250 restoreStep, :291 restoreChanged; none in single()
npx vitest run --project backend src/core/ops → Test Files 1 passed (1) · Tests 59 passed (59); the verbose
                               output lists both new titles
npx tsc --noEmit / npm run check-types → exit 0 / exit 0
npx eslint src / npm run lint → exit 0, no output / exit 0
npm test                     → Test Files 63 passed (63) · Tests 2132 passed (2132)
npx vitest run --coverage    → exit 0 · All files 76.04 % statements, 65.78 % branches, 71.5 % functions,
                               77.54 % lines · PackageWorkflows.ts 175 of 179 lines, 97.77 % ·
                               src/core/** 1560 of 1587 lines, 98.30 % (floor 85 %)
npm run bench                → Test Files 16 passed (16) · Tests 101 passed | 1 skipped (102)
npm run package:vsix         → exit 0 · Tests 2132 passed · DONE  Packaged: nuiget-v1.18.9.vsix (17 files,
                               528.84 KB)
npm run check:vsix           → check:vsix: OK
npm run docs:protocol:check  → exit 0
git status --short src/core/contracts.ts src/protocol docs/adr → empty
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P1.fix-1
```

## Done (tested)

- `PackageWorkflows.ts`, rewritten from the quarry text along the ruling below.
  - `admitEdit(request)`: one private gate before any argv is built, in the order SDK detection, SDK floor,
    CPM. An SDK that cannot be detected (the probe answers `undefined`, or rejects) refuses with `could not
    detect the .NET SDK for this project`; `!sdk.supported` refuses every edit, `remove` included, with
    `requires .NET SDK 10 or newer`; `isCpmProject` is asked for `install` and `update` only, a rejection
    refuses with `could not determine whether the project uses Central Package Management: …`, and `true`
    refuses with `Central Package Management edits arrive with the project mutator`. Nothing is spawned for
    a refused request. The method has the shape of `ProjectMutator.canMutate`, which replaces its body in
    P6.3.
  - A refusal is an ordinary failed edit: `status: 'failed'`, `edit` the refusal, no `restore`, `message` the
    same text. In a bulk the other requests run, a project whose edits were all refused is not restored, a
    mixed batch ends `partial` and a batch refused as a whole ends `failed`.
  - CPM `remove` is allowed and followed by the normal restore. Restore steps and the explicit `restore()`
    workflow are gated by nothing.
  - Noun-first argv only, through `addPackageArgs(options)` and `removePackageArgs(options)` of
    `src/core/cli`. A non-CPM add keeps `--no-restore` and the separate restore step.
  - Cancel between the steps: after a successful edit the restore step checks the signal and reports
    `restore: { ok: false, skipped: true, error: 'cancelled' }`, so `single()` ends `cancelled`; a bulk marks
    every request not yet started cancelled and, when the signal is aborted before the restore phase, every
    project that would have been restored. The option decides before the signal in both paths (P1.fix-1): with
    the restore switched off the step is `{ ok: true, skipped: true }` and the operation is `completed`,
    because nothing remained to cancel. `restoreStep` is the one place that decides it for `single()`.
  - `stepStatus` and `outcomeStatus`, exported, replace `editStatus` and `statusFor`. Bulk status: `cancelled`
    when any result or restore is cancelled, `completed` when every result is completed and every restore is
    ok, `failed` when no result is completed, otherwise `partial`.
  - Progress: every report carries `kind`, `projectPaths` and `packageIds`. A bulk opens with one `running`
    report that lists every project and package of the batch; a `restoring` report lists the ids whose edits
    succeeded in that project.
  - Redaction: `onCommand` receives `redactArgv(argv)`, `redact(stdout)` and `redact(stderr)`; every error
    string in a `StepOutcome` and every `logger.warn` text passes `redact`.
  - `RESTORE_TIMEOUT_MS` comes from `src/core/cli`; `EditRequest` is exported and uses `MutationKind`.
- `PackageWorkflows.test.ts`, 59 tests (46 declarations: 44 `it` and two `it.each` tables of 6 and 9 rows).
  - The 16 quarry tests, all kept and rewritten for the noun-first argv, the required `isCpmProject` (a
    `makeDeps` helper supplies `async () => false`) and `sdk10 = sdkInfoFromVersion('10.0.401')`. By title:
    `installs then restores and reports both steps`;
    `skips restore when the toggle is off and marks the step skipped`;
    `reports a failed edit from the exit code with a summarized error and does not restore`;
    `reports partial when the edit succeeds but restore fails`;
    `rejects invalid package ids without spawning anything`;
    `returns cancelled when the signal aborts during the edit`;
    `forwards the CLI transcript to onCommand`;
    `bulkUpdate orders packages dependencies-first and restores once`;
    `bulkRemove orders dependents-first and reports partial when one removal fails`;
    `bulkInstall orders projects dependencies-first and restores each changed project`;
    `bulkInstall with every edit failing is failed and never restores`;
    `bulkUpdateAllProjects edits all projects before restoring and keeps dependency order`;
    `bulkRemoveAllProjects restores dependencies-first after dependents-first removals`;
    `skipRestore marks every restore skipped`;
    `cancellation mid-sequence marks remaining edits cancelled and skips restores`;
    `restore() restores the given projects in order and reports per project`.
    What changed in them: expected argv (`['package', 'add', id, '--project', path, …]`, `['package',
    'remove', id, '--project', path]`) and the argv indexes the assertions read (id at 2, project at 4);
    `outcome.edit.ok` became `outcome.edit?.ok` (the field is optional in `OperationOutcome`; the quarry line
    did not type-check); the three `projectDependencies` fakes answer with `normalizeProjectPath` keys, as
    the dependency declares, because the raw keys of the quarry would not match on Windows; three tests
    gained one assertion each (`skipRestore` the status, `bulkInstall orders…` the first argv, `restore()`
    the per-result statuses). No assertion was removed or weakened.
  - The three named tests: `cpm: refuses add and update until the mutator`, `cpm: never emits --no-restore`
    (all eight edit workflows and `restore()` against a CPM project: no argv contains `--no-restore`, the only
    `package` commands are the 5 removes, 6 restores ran), `requires .NET SDK 10 or newer` (install, update
    and remove on SDK 8.0.425; `isCpmProject` is not reached).
  - The other additions of the ruling: `refuses when the SDK cannot be detected`, `refuses add when the
    project cannot be inspected for CPM`, `remove skips the CPM lookup`, `cancel between edit and restore
    yields cancelled`, `bulk: mixed CPM and non-CPM projects end partial`, spawn rejection (`a spawn rejection
    becomes a failed edit and nothing is thrown`, with `DotnetSpawnError`), `timedOut` (`reports a timed-out
    edit as failed and a timed-out restore as partial`, which also pins both 120 s limits), `--source`
    (`passes --source and hands onCommand the URL without its userinfo`), redaction (`redacts the transcript
    and the reported error before they leave the workflow`), progress (three tests under `PackageWorkflows
    progress`), and the `stepStatus` and `outcomeStatus` tables.
  - Further tests: `cpm: remove is allowed and followed by the restore`, `restore is gated neither by the SDK
    floor nor by CPM`, `asks for the SDK of the project directory`, `bulk: every request refused is failed
    and restores nothing`, `bulk: a failed restore after completed edits is partial`, `bulk: an abort before
    the restore phase marks every restore cancelled`, `restore() marks the projects after an abort
    cancelled`, `a spawn rejection of the restore leaves the edit reported and the outcome partial`, `falls
    back to the given order and warns redacted when a dependency lookup fails`, `a throwing onCommand does
    not change the outcome`, `returns cancelled when the signal aborts during the restore`.
  - P1.fix-1, two tests: `a cancel after the edit with the restore switched off is completed` and `bulk: a
    cancel after the last edit with the restore switched off is completed`. `cancel between edit and restore
    yields cancelled` (restore wanted) is unchanged and keeps the `cancelled` shape.

## Done (untested)

- Nothing constructs `PackageWorkflows` yet. `OperationQueue` (P2.1) runs the workflows, the host (P2.9,
  P2.10) supplies `isCpmProject`, `packageDependencies`, `projectDependencies` and `onCommand`.
- `isCpmProject` and `runner.sdkVersion` are asked once per request, so a bulk of n updates in one project
  asks n times. The runner caches the SDK per directory; whoever implements `isCpmProject` (P2.4 or P2.9)
  should cache per project for the duration of an operation.
- Four lines have no test: `:134` and `:152` (the `continue` for a project that `orderProjects` returned
  but the request list does not contain, which cannot happen because the order is built from that list) and
  `:358-359` (the `restore` and `default` branches of `verb`, which no edit request reaches).

## Not started

- `OperationQueue.ts`, `index.ts` and their tests: P2.1.
- The project mutator (`ProjectMutator.canMutate`, `previewCpmImpact`): P6.3. Until then every CPM `add` and
  `update` is refused here.
- N47 (a leading `-` in a positional argument): P2.6, by the ruling. No check was added in the workflow.

## Deviations from contract/ADR (file:line each)

- Restore time limit 180 s → 120 s. The quarry declared `RESTORE_TIMEOUT_MS = 180_000` locally; the item row
  says "`RESTORE_TIMEOUT_MS` from cli", and `src/core/cli/DotnetRunner.ts:11` exports `120_000`. The local
  constant is gone (`PackageWorkflows.ts:17`, `:259`, `:265`).
- Behaviour changes against the quarry that the ruling orders: a bulk with completed edits and a
  cancellation is `cancelled` (the quarry said `partial`); `restore()` reports a cancelled step as
  `cancelled` (the quarry said `failed`); an undetectable SDK refuses the edit (the quarry logged a warning
  and spawned).
- The ruling contradicts itself on one point. Step 4 says in prose "passing the lookup result and never a
  literal for `isCpm`", its code sample passes `isCpm: false`, its VERIFY expects `isCpm: false` exactly
  once, and step 3 fixes the return type of `admitEdit` so that the lookup result cannot reach `edit()`.
  The code sample and VERIFY were followed (`PackageWorkflows.ts:220-223`); the comment there says why
  `false` is right. The phase review confirmed the code and retracted the prose. Consequence: in this path the guard of `addPackageArgs` (`noRestore` with `isCpm`,
  `src/core/cli/commands.ts:71-73`) is not what refuses a CPM add; `admitEdit` is. P6.3, which admits CPM
  adds, has to pass the real value and `noRestore: false` for them (N51, note in the tracker row of P6.3).
- Readings of the ruling where it leaves a choice: the opening `running` report of a bulk is new (the quarry
  had per-request reports only) and carries no `current` or `total`; the explicit `restore()` workflow has no
  opening report and its reports carry `packageIds: []`; `bulkInstall` runs through the shared
  `editSequence` instead of its own copy of that loop (same order, same reports).
- Beyond the ruling, in the item's file: `forwardCommand` (`PackageWorkflows.ts:301-308`) catches an
  exception of the `onCommand` hook and logs a warning. In the quarry the call stood inside the `try` of the
  step, so a throwing output channel turned a finished `dotnet package add` into `edit: { ok: false }` (N50).
  Accepted by the phase review.
- Admission runs before the arguments are validated (ruling, step 3), so for an invalid package id the SDK
  and the CPM state are looked up first and the refusal, if any, wins over the validation error.
- No bench: the item names none. No `index.ts`: P2.1.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-12, P1.10, ⚑ on CPM semantics. Brief in the form of plan §2.4, sent on `labs/2.0` @ `d3abc12` before
any file was copied, with the quarry's `PackageWorkflows.ts` and its test pasted. It asked eleven questions:
A what a failing `isCpmProject` means; B the shape of a refusal and whether one CPM project refuses a whole
bulk; C whether a non-CPM add keeps `--no-restore`; D CPM `remove`; E whether the SDK floor covers `remove`
(E1) and restores (E2); F the outcome of a cancel between the steps; G the shared status helpers; H the
progress payload; I redaction; J the constants and exports; K rewriting the 16 quarry tests. It also asked
whether N47 belongs to this item. Answer of the `architecture-advisor`, verbatim:

````text
DECISION: Option 1, with corrections: rule A to K as asked; A fails closed with its own message and is consulted only for `install`/`update`; E applies to every edit including `remove` and never to a restore, and an undetectable SDK refuses with its own message; `RESTORE_TIMEOUT_MS` from cli is 120 s (not the quarry's 180 s); N47 is not touched here. Nothing is the owner's.

WHY: The tree matches the brief on every point I checked: `src/core/cli/commands.ts:69-75` throws `InvalidArgumentError` for `noRestore && isCpm` and `removePackageArgs` has no restore flag; `src/core/cli/DotnetRunner.ts:11` exports `RESTORE_TIMEOUT_MS = 120_000`, `:305-332` resolves `undefined` for transient probe failures and never rejects, `:189` rejects `run()` only when the binary cannot be started; `src/core/contracts.ts:87-91` `OperationRunContext`, `:199-208` `SdkInfo`, `:333-343` `MutationKind`/`MutationRequest`/`MutationDecision`; `src/protocol/domain.ts:262-318` `OperationKind`, `OperationStatus`, `StepOutcome { ok; skipped?; error? }`, `OperationOutcome`, `OperationProgress { kind?; projectPaths?; packageIds?; current?; total?; detail? }`, `BulkOutcome`; `src/core/logging/redact.ts:35,59` `redact`/`redactArgv`. D7 (plan line 51) and ADR-004 tier 3 refuse CPM `add`/`update` per project and keep `remove`, so a batch refuses per request, not as a whole; ADR-003 "Edit success and restore success are reported separately … partial results are reported … even after failure/cancel" fixes the cancel-between-steps shape (`edit` ok, `restore` not run) and the bulk status rule. D13 (plan line 57) and ADR-003 "Workflows refuse an edit when `!sdk.supported`" make the project read-only, which covers `remove` (it edits the project file) but not `restore` (it edits nothing; D13 says browsing still works and transitive data needs `project.assets.json`). `ProjectMutator.canMutate(context, request): Promise<MutationDecision>` (`contracts.ts:350-354`) is what P6.3 swaps in for this gate, so the gate is one private method with that shape, not three inline checks. The ledger's N47 row names P1.10 but the item row (plan line 217) does not name `src/core/cli/validate.ts`; §2.1 makes that a stop-and-ask, and a duplicate validator inside the workflow would put validation outside `validate.ts`, so N47 stays with P2.6.

DO:
1. Declare on `WorkflowDeps` (required):
   ```ts
   /** Whether `projectPath` uses Central Package Management (D7 gate until the mutator, P6.3). Consulted only for `install` and `update`. A rejection refuses the edit (fail closed). */
   isCpmProject: (projectPath: string) => Promise<boolean>;
   ```
   Keep `runner`, `packageDependencies`, `projectDependencies`, `logger?`, `onCommand?` as in the quarry.
2. Export the request type, using the contract alias instead of a second `Exclude<…>`:
   ```ts
   import type { DotnetRunner, Logger, MutationKind, OperationRunContext, SdkInfo } from '../contracts';
   export interface EditRequest { kind: MutationKind; projectPath: string; packageId: string; version?: string; sourceUrl?: string; }
   ```
3. Replace the SDK detection inside `edit()` with one gate, called at the top of `edit()` before any argv is built, in this order: SDK detection, SDK floor, CPM (only for `install`/`update`). P6.3 replaces this method's body with `mutator.canMutate`; keep its shape:
   ```ts
   /** D13 and D7 admission for one reference edit. `undefined` admits; a `StepOutcome` refuses and nothing is spawned. */
   private async admitEdit(request: EditRequest): Promise<StepOutcome | undefined> {
       const projectDir = path.dirname(request.projectPath);
       let sdk: SdkInfo | undefined;
       try {
           sdk = await this.deps.runner.sdkVersion(projectDir);
       } catch (error) {
           return { ok: false, error: `could not detect the .NET SDK for this project: ${redact(describe(error))}` };
       }
       if (sdk === undefined) {
           return { ok: false, error: 'could not detect the .NET SDK for this project' };
       }
       if (!sdk.supported) {
           return { ok: false, error: 'requires .NET SDK 10 or newer' };
       }
       if (request.kind === 'remove') {
           return undefined;
       }
       let isCpm: boolean;
       try {
           isCpm = await this.deps.isCpmProject(request.projectPath);
       } catch (error) {
           return { ok: false, error: `could not determine whether the project uses Central Package Management: ${redact(describe(error))}` };
       }
       return isCpm ? { ok: false, error: 'Central Package Management edits arrive with the project mutator' } : undefined;
   }
   ```
   Messages are exact strings; the test `requires .NET SDK 10 or newer` and the test `cpm: refuses add and update until the mutator` assert `error` with `toBe`. The SDK gate refuses `remove` too (E1). The workflow never reads `sdk.cpmAwareAdd` or `sdk.cpmAwareAddProvenance` (plan: no provenance logic here).
4. `edit()` builds argv only after admission, always noun-first through the existing builders, passing the lookup result and never a literal for `isCpm` so the builder's guard stays live:
   ```ts
   private async edit(ctx: OperationRunContext, request: EditRequest, flags: { noRestore: boolean }): Promise<StepOutcome> {
       const refusal = await this.admitEdit(request);
       if (refusal) { return refusal; }
       const projectDir = path.dirname(request.projectPath);
       let argv: string[];
       try {
           argv = request.kind === 'remove'
               ? removePackageArgs({ projectPath: request.projectPath, packageId: request.packageId })
               : addPackageArgs({ projectPath: request.projectPath, packageId: request.packageId, version: request.version, sourceUrl: request.sourceUrl, noRestore: flags.noRestore, isCpm: false });
       } catch (error) { return { ok: false, error: redact(describe(error)) }; }
       …run as today…
   }
   ```
   `isCpm: false` is correct here only because `admitEdit` has already refused every CPM `add`/`update`; put that sentence in the comment above the call. Non-CPM `add` keeps `--no-restore` plus the separate restore step (C confirmed; it is what makes `edit` and `restore` separately reportable per ADR-003). The restore-step selection stays the quarry's: `single()` restores only when `edit.ok`; bulk workflows restore each project that has at least one `edit.ok`; a project whose every edit was refused gets no restore entry.
5. CPM `remove` (D): allowed, then the normal restore step (`skipRestore` honoured). `dotnet package remove` does not restore implicitly, so the restore is wanted.
6. Restore steps and the explicit `restore()` workflow (E2): no SDK check, no CPM check, unchanged from the quarry except the timeout constant (step 12).
7. Cancel between steps (F), in `single()`:
   ```ts
   const edit = await this.edit(ctx, request, { noRestore: true });
   let restore: StepOutcome | undefined;
   if (edit.ok) {
       restore = ctx.signal.aborted
           ? { ok: false, skipped: true, error: 'cancelled' }
           : await this.restoreStep(ctx, request.projectPath, options);
   }
   return { opId: ctx.opId, kind: request.kind, status: outcomeStatus(edit, restore), projectPath: request.projectPath, packageId: request.packageId, version: request.version, edit, restore, message: edit.ok ? restore?.error : edit.error };
   ```
   So `restore` is always present after a successful edit (ran, skipped by option `{ ok: true, skipped: true }`, or skipped by cancel). Bulk workflows keep today's `cancelledOutcome` for every request not yet started (`status: 'cancelled'`, `edit: { ok: false, skipped: true, error: 'cancelled' }`), and when the signal is aborted before the restore phase every project that would have been restored gets `{ projectPath, ok: false, skipped: true, error: 'cancelled' }` in `restores` instead of a run. Delete the `ctx.signal.aborted` branch from the old `statusFor`.
8. Shared status helpers (G), exported from the module:
   ```ts
   /** `completed` when the step succeeded, `cancelled` when it was cancelled, otherwise `failed`. */
   export function stepStatus(step: StepOutcome): OperationStatus {
       return step.ok ? 'completed' : step.error === 'cancelled' ? 'cancelled' : 'failed';
   }
   /** Status of one edit plus its restore: a failed restore after a successful edit is `partial` (ADR-003). */
   export function outcomeStatus(edit: StepOutcome, restore: StepOutcome | undefined): OperationStatus {
       const editStatus = stepStatus(edit);
       if (editStatus !== 'completed' || restore === undefined) { return editStatus; }
       const restoreStatus = stepStatus(restore);
       return restoreStatus === 'failed' ? 'partial' : restoreStatus;
   }
   ```
   Replace `editStatus` and `statusFor` with these. Bulk status: `cancelled` when any result or restore has status `cancelled`; `completed` when every result is `completed` and every restore is ok (including skipped); `failed` when no result is `completed`; otherwise `partial`. A refused CPM request in a mixed batch therefore yields `partial`; a batch where every request was refused yields `failed`; the other requests run (B confirmed; do not refuse the batch).
9. Refusal outcome (B): `status: 'failed'`, `edit` = the refusal, no `restore`, `message` = `edit.error` (the existing formula repeats it; keep it, the host shows `message`). Never `rejected`: that word belongs to the queue.
10. Progress (H): every `ctx.report` carries `kind`, `projectPaths` and `packageIds`. `kind` is the workflow's kind: `'install'` for `single()` with an install request including its `restoring` report, the bulk's kind for bulk workflows, `'restore'` only for the explicit `restore()` workflow. Per-request reports carry `projectPaths: [request.projectPath]`, `packageIds: [request.packageId]`, `current`, `total`; a `restoring` report carries `projectPaths: [projectPath]` and `packageIds` = the ids whose edits succeeded in that project; the opening `running` report of a bulk carries every project path and every package id of the batch.
11. Redaction (I): `this.deps.onCommand?.(redactArgv(result.argv), result.exitCode, redact(result.stdout), redact(result.stderr), result.durationMs)`; every `error` string placed in a `StepOutcome` (`summarize(...)`, `describe(error)`, the two SDK/CPM detection messages) and every `logger.warn` text goes through `redact` first. Import: `import { redact, redactArgv } from '../logging';`.
12. Constants and exports (J): `import { RESTORE_TIMEOUT_MS } from '../cli';` and delete the local `RESTORE_TIMEOUT_MS = 180_000`; the restore timeout becomes 120 s, which the row orders ("from cli"); record the change in the directory `STATUS.md` under Deviations with `src/core/cli/DotnetRunner.ts:11`. `EDIT_TIMEOUT_MS = 120_000` stays local. No `src/core/ops/index.ts` (P2.1, plan line 225).
13. Tests (K): rewriting the quarry's 16 tests is covered by the row ("noun-first argv") and D13; no separate brief. Replace the `sdk8` constant with `const sdk10 = sdkInfoFromVersion('10.0.401')!` (from `'../cli'`), and add `const sdk8 = sdkInfoFromVersion('8.0.425')!` used only by the SDK-floor test; every expected argv becomes `['package', 'add', 'Newtonsoft.Json', '--project', '/w/App/App.csproj', '--version', '13.0.3', '--no-restore']` and `['package', 'remove', id, '--project', path]`. List each rewritten test by title in `STATUS.md`. Named tests to add, with what they assert: `cpm: refuses add and update until the mutator` (install and update on a project where `isCpmProject` resolves true: `edit` equals `{ ok: false, error: 'Central Package Management edits arrive with the project mutator' }`, status `failed`, the fake runner recorded no `package add` spawn); `cpm: never emits --no-restore` (run `single` install/update/remove, `bulkInstall`, `bulkUpdate`, `bulkRemove`, `bulkUpdateAllProjects`, `bulkRemoveAllProjects` and `restore` against a CPM project with a recording fake runner; assert no recorded argv contains `'--no-restore'` and that the only `package` argv recorded are `package remove`); `requires .NET SDK 10 or newer` (sdk8 on install, update and remove: that exact `error`, no spawn); `refuses when the SDK cannot be detected` (`sdkVersion` resolves `undefined`, and a second case where it rejects: no spawn, error starts with `could not detect the .NET SDK for this project`); `refuses add when the project cannot be inspected for CPM` (`isCpmProject` rejects: no spawn, error starts with `could not determine whether the project uses Central Package Management`); `remove skips the CPM lookup` (`isCpmProject` fake never called for remove); `cancel between edit and restore yields cancelled` (abort inside the fake runner after the edit resolves: status `cancelled`, `edit.ok === true`, `restore` equals `{ ok: false, skipped: true, error: 'cancelled' }`); `bulk: mixed CPM and non-CPM projects end partial`; plus the row's spawn rejection (`runner.run` rejects with `DotnetSpawnError`: `edit.ok === false`, status `failed`, nothing thrown), `timedOut`, `--source` (argv contains `'--source', url` and `onCommand` receives the URL with userinfo redacted), noun-first argv, partial bulk, progress payload (`kind`, `projectPaths`, `packageIds` on every report), `onCommand` redaction (a `--password` in stderr arrives as `[REDACTED]`), `stepStatus`/`outcomeStatus` table. The `WorkflowDeps` fake supplies `isCpmProject: async () => false` by default.
14. Docs: ARCHITECTURE.md gets a `src/core/ops/**` row under "2.0 Architecture (in progress)" stating the gate order (SDK detection, SDK floor, CPM until P6.3), the edit/restore split and the cancel shape; CHANGELOG `[Unreleased]` nothing user-facing beyond the existing 2.0 line unless the session's convention adds one per item; ledger: C-cli-logging-3 and C-ops-2/3/4/6 closed for the workflow side (C-ops-1/5 close at P2.1), N47 row keeps P2.6 and notes P1.10 did not take it.

DO NOT:
- Do not treat a rejected `isCpmProject` or an undetectable SDK as "not CPM" / "supported" and spawn anyway (fail closed; the SDK probe result is transient and the next attempt re-probes).
- Do not reuse the mutator message for the "could not inspect" case; the UI would tell the user a non-CPM project is CPM.
- Do not refuse a whole bulk because one project is CPM; do not restore a project whose edits were all refused.
- Do not gate `restoreStep`, `runRestore` or the explicit `restore()` workflow on `sdk.supported` or on CPM.
- Do not drop `--no-restore` for non-CPM adds; do not pass `isCpm: true` or a literal into `addPackageArgs`.
- Do not read `cpmAwareAdd` or `cpmAwareAddProvenance` anywhere in `src/core/ops`.
- Do not use `rejected` for a refusal, and do not add a new `OperationStatus` or widen `StepOutcome`.
- Do not keep a local `RESTORE_TIMEOUT_MS`, and do not change `src/core/cli/DotnetRunner.ts:11` to 180 s.
- Do not edit `src/core/cli/validate.ts` for N47 in this item, and do not add a leading-`-` check inside the workflow.
- Do not write `src/core/ops/index.ts`, and do not import `OperationQueue` or stub it.
- Do not skip, delete or `.only` any of the 16 quarry tests; rewrite them and list them.

CONTRACT CHANGE: none. `src/core/contracts.ts`, `src/protocol/domain.ts` and `docs/adr/**` are not touched; `WorkflowDeps`, `WorkflowOptions`, `EditRequest`, `stepStatus` and `outcomeStatus` are module-local exports of `src/core/ops/PackageWorkflows.ts`. P6.3 is the item that replaces `admitEdit` with `ProjectMutator.canMutate`.

VERIFY:
- `npx vitest run --project backend src/core/ops` → Tests ≥ 24 passed, and the output lists the titles `cpm: refuses add and update until the mutator`, `cpm: never emits --no-restore`, `requires .NET SDK 10 or newer`.
- `grep -n "no-restore\|isCpm" src/core/ops/PackageWorkflows.ts` → `--no-restore` appears only in comments or not at all (the builder emits it), `isCpm: false` appears exactly once, next to the comment that `admitEdit` ran first.
- `grep -n "cpmAwareAdd\|nounFirstSyntax\|180_000\|RESTORE_TIMEOUT_MS" src/core/ops/*.ts` → only the import of `RESTORE_TIMEOUT_MS` from `'../cli'` and its use in `runRestore`.
- `grep -n "redact" src/core/ops/PackageWorkflows.ts` → the `onCommand` call passes `redactArgv(result.argv)`, `redact(result.stdout)`, `redact(result.stderr)`.
- `grep -rln child_process src/core` → only `src/core/cli/*`; `ls src/core/ops` → `PackageWorkflows.ts`, `PackageWorkflows.test.ts`, `STATUS.md` and no `index.ts`.
- `npx tsc --noEmit` → 0; `npx eslint src` → 0; `npm test` and `npm run bench` green; `git status --short src/core/contracts.ts src/protocol docs/adr` → empty.

Files checked (absolute): /Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md (lines 41-160, 217, 225, 229-230, 296, 399, 424-436), /Users/mattias/github/nuiget/docs/adr/003-operation-queue-and-dotnet-runner.md, /Users/mattias/github/nuiget/docs/adr/004-project-model.md, /Users/mattias/github/nuiget/docs/adr/004-sdk-probes.md, /Users/mattias/github/nuiget/src/core/contracts.ts, /Users/mattias/github/nuiget/src/protocol/domain.ts (255-336), /Users/mattias/github/nuiget/src/core/cli/commands.ts, /Users/mattias/github/nuiget/src/core/cli/DotnetRunner.ts, /Users/mattias/github/nuiget/src/core/cli/sdk.ts, /Users/mattias/github/nuiget/src/core/cli/index.ts, /Users/mattias/github/nuiget/src/core/cli/STATUS.md, /Users/mattias/github/nuiget/src/core/logging/redact.ts, /Users/mattias/github/nuiget/src/core/logging/index.ts, /Users/mattias/github/nuiget/docs/plans/findings-ledger.md (N1, N45, N47, C-ops-1..6, C-cli-logging-3), /Users/mattias/github/nuiget/docs/plans/STATUS.md (P1.6, P1.9, P1.10, P2.1 rows). The ambient advisor tool was overloaded and could not be consulted; the ruling rests on the files above.
````

The ambient advisor (L3) was consulted before the first edit; its notes on the test helpers, the argv
indexes and the cancel test were followed. It did not rule on the `isCpm` contradiction recorded above.

2026-10-12, P1 phase review (`PHASE REVIEW P1`, sent on `labs/2.0` @ `08f94e3` with the commit list, the
gate output and three questions about this module: (a) the `single()`/bulk difference with the restore
switched off and an abort after the edit, (b) the `isCpm: false` literal against the ruling's prose, (c)
`forwardCommand`). Verdict PASS WITH FIXES; its one blocking finding is P1.fix-1. Answer of the
`architecture-advisor`, verbatim (also in `docs/plans/STATUS.md`, "Phase gates"):

````text
VERDICT: PASS WITH FIXES

The brief is correct about the tree. Every path:line it cites matched what I read: `/Users/mattias/github/nuiget/src/core/ops/PackageWorkflows.ts:66-70` (abort check before `restoreStep` in `single()`), `:222-225` (`isCpm: false` under the comment that `admitEdit` ran first), `:283-292` (`restoreChanged`: `skipRestore` at :285-288, then the abort at :289-292), `:299-306` (`forwardCommand`), `/Users/mattias/github/nuiget/src/core/cli/DotnetRunner.ts:11` (`RESTORE_TIMEOUT_MS = 120_000`); the four frozen-path commits (`git log labs/2.0-P0-done..HEAD -- docs/adr src/protocol src/core/contracts.ts` lists exactly ac64e72, dd1ed73, 32642aa, 91d1144; the P1.7 hunk is comment-only on `SessionStore.reconcile`, the P1.8 hunk is `InvalidationEvent.keys` plus the two JSDoc lines); `.claude/.contract-change` absent; 64 tracked files outside `__fixtures__`; 19 test files under `src/core` and `src/protocol` (cache 1, cli 5, http 1, logging 1, ops 1, queries 2, session 1, util 5, versioning 1, protocol 1); no deleted file in the range and no added `.only(`/`.skip(`/`.todo(` under `src`; `git status --short` shows only ` M docs/plans/STATUS.md`. The claim "no test pins the `single()` side" is right: `skips restore when the toggle is off and marks the step skipped` (test :91) never aborts, and `cancel between edit and restore yields cancelled` (:157) runs with `skipRestore: false`.

BLOCKING:
1. `/Users/mattias/github/nuiget/src/core/ops/PackageWorkflows.ts:66-70` and `:247-253` — `single()` reports `cancelled` with `restore: { ok: false, skipped: true, error: 'cancelled' }` when `options.skipRestore` is true and the signal aborts after a finished edit; the bulk path (`restoreChanged`, :285-292) reports `{ ok: true, skipped: true }` and `completed` in the same situation. The asymmetry is not intended; it is a slip in my P1.10 ruling, whose step-7 code sample was written for the `skipRestore: false` path and did not consider the option. Neither ADR-003:26-27 nor ADR-007:21-22 fixes a precedence between "skipped by option" and "cancelled", so this ruling does: a step the user switched off was never going to run, so a cancel cannot have skipped it, and `{ ok: false, skipped: true, error: 'cancelled' }` for that step tells the UI (and `ops/completed`, `messages.ts:190`) that the cancel prevented work it did not. The bulk order is right and `single()` aligns to it. Item `P1.fix-1`, files: `src/core/ops/PackageWorkflows.ts`, `src/core/ops/PackageWorkflows.test.ts`, `src/core/ops/STATUS.md`, `ARCHITECTURE.md` (2.0 section, ops row at :87), `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`. The exact fix, so that one place decides:
   - `restoreStep` (:247-253): after the `if (options.skipRestore) { return { ok: true, skipped: true }; }` return, insert `if (ctx.signal.aborted) { return { ok: false, skipped: true, error: CANCELLED }; }` before the `restoring` report.
   - `single()` (:66-71): replace the ternary with `if (edit.ok) { restore = await this.restoreStep(ctx, request.projectPath, options, scope); }`. The `ctx.signal.aborted` check then lives only in `restore()`, `editSequence`, `restoreStep` and `restoreChanged`.
   - Tests, two new titles, nothing removed or weakened: `a cancel after the edit with the restore switched off is completed` (single: `makeRunner(() => ({}), { afterRun: () => ctx.controller.abort() })`, `{ skipRestore: true }`; expect `status 'completed'`, `edit { ok: true }`, `restore { ok: true, skipped: true }`, `runner.calls` length 1, reports `['running']`) and `bulk: a cancel after the last edit with the restore switched off is completed` (`bulkUpdate` with two packages, abort in `afterRun` of the second add, `{ skipRestore: true }`; expect both results `completed`, `restores` equal to `[{ projectPath: projectA, ok: true, skipped: true }]`, status `completed`, no restore spawned). `cancel between edit and restore yields cancelled` (`skipRestore: false`) stays as it is and keeps the `cancelled` shape.
   - `ARCHITECTURE.md:87`: the sentence "an abort between the two yields `cancelled` with the edit reported as done and the restore as skipped" gains "when a restore was wanted; with the restore switched off the operation is `completed`, because nothing remained to cancel".
   - `src/core/ops/STATUS.md`: rewrite per §2.5 with the fix commit, drop the asymmetry entry under Deviations, add this answer under Advisor decisions. No CHANGELOG entry (the 2.0 ops line at `CHANGELOG.md:14` stands; nothing user-facing changes before 2.0 ships). No gotcha row.
   - VERIFY: `grep -n "ctx.signal.aborted" src/core/ops/PackageWorkflows.ts` → four hits, none inside `single()`; `npx vitest run --project backend src/core/ops` → 59 passed and the two new titles listed; `npm run check-types` → 0; `npx eslint src` → 0; `npm test`, `npm run bench` green; `npx vitest run --coverage` keeps `src/core/**` ≥ 85 %; CI green on the fix commit; then the P1 gate line is re-run and pasted (RUN.md §6 step 2) before the tag `labs/2.0-P1-done`.

NON-BLOCKING:
1. (question b) `PackageWorkflows.ts:222-225`, the `isCpm: false` literal. My P1.10 ruling contradicted itself: step 3 fixed `admitEdit` to `Promise<StepOutcome | undefined>` (mirroring `MutationDecision`, `contracts.ts:343`), which cannot carry the lookup result, while the step-4 prose and the DO NOT line asked for "never a literal"; the code sample and VERIFY are the operative text, the implementer followed them correctly, and the prose is retracted. The code stays as it is. D7 is live and tested across all eight edit workflows and `restore()` (`cpm: never emits --no-restore`); what is dead in this path is only the builder's defence in depth (`src/core/cli/commands.ts:71-73`), and the hazard date is P6.3, when the gate starts admitting CPM adds. Assigned to P6.3. In `P1.fix-1`'s commit: add a ledger row N51 ("the builder guard of `addPackageArgs` is fed a literal `isCpm: false` by the workflow; correct while `admitEdit` refuses every CPM add/update, a trap from P6.3 on") and a P6.3 tracker note: "when `admitEdit`'s body becomes `ProjectMutator.canMutate`, the literal `isCpm: false` at `PackageWorkflows.ts:225` must become the project's real value and a CPM add must run with `noRestore: false` (D7, in any phase); the test `cpm: never emits --no-restore` is rewritten in the same item and must still assert that no argv contains `--no-restore`; N51 closes there."
2. (question c) `forwardCommand` (`:299-306`) is accepted. The change is inside the item's named source (§2.1), it restores ADR-003's rule that output is logged but never decides success, it is tested (`a throwing onCommand does not change the outcome`) and recorded (N50, closed). No action.
3. N44 (the fixed 10 s sleep in `src/test/e2e/update-flow.e2e.test.ts:45`). The re-run rule stands for P2: two sightings in about a dozen runs, both green on re-run, nothing in the tree builds on the test, and no P2 item names either candidate file. One amendment, because the trigger "a second identical failure on the same SHA" may never fire when re-runs pass: on the third sighting on any SHA, the session adds a warm-up step to the `e2e` job of `.github/workflows/ci.yml` (after `setup-dotnet`, before the tests: `run: dotnet --version && dotnet msbuild -version`, which pays the first-use setup and the MSBuild load the first `dotnet add` otherwise pays inside the 10 s) as its own one-line commit citing N44, updates the N44 ledger row and the "A red CI run is not always a code failure" gotcha row in the same commit, re-runs, and needs no further brief. The polling rewrite of the legacy test stays with P5.12; the owner may elect it earlier (as with P0.14). This is not an `OWNER MUST DECIDE` stop.
4. `isCpmProject` and `runner.sdkVersion` are asked once per request (n times for a bulk of n in one project). The runner caches the SDK per directory (`DotnetRunner.ts:155,307`), so only `isCpmProject` costs; P2.9, which supplies it from the host, memoizes it per project for the duration of one operation (or P2.4's inspector result is reused). No change in `src/core/ops`.
5. The three behaviour changes against the quarry (bulk with a cancellation is `cancelled`, `restore()` reports a cancelled step as `cancelled`, an undetectable SDK refuses) are what the ruling ordered and what ADR-003's outcome set and D13's fail-closed reading require; no action. The restore limit of 120 s is what the row orders ("`RESTORE_TIMEOUT_MS` from cli"); P7.2 measures whether a cold restore of a multi-TFM project fits and, if not, changes `src/core/cli/DotnetRunner.ts:11` (cli's file), never a local constant in the workflow.
6. The opening `running` report of a bulk without `current`/`total`, the explicit `restore()` with `packageIds: []` and no opening report, admission before argument validation, and `bulkStatus` returning `completed` for an empty batch are all acceptable readings of the ruling; P2.9's empty-`packages` guards keep an empty batch from reaching the workflow. No action.
7. The `projectDependencies` fakes keyed by `normalizeProjectPath` are right (the dependency's comment at `PackageWorkflows.ts:27` says "normalized"), and CI on windows-latest confirms it. No action.
8. Handoff notes: all ten have the seven §2.5 sections; eight are headed with the parent commit ("parent of the P1.x commit") and two with their own commit. Consistent enough to read; P7.5 may standardise the header. No action now; `P1.fix-1` rewrites the ops note with its own SHA.

QUESTION (a): not intended. The bulk order is right (option first, then cancel); align `single()` as blocking 1 says. It is a `P1.fix`, not a P2.1 note: P2.1's row names `OperationQueue.ts`, `index.ts` and their tests only, so P2.1 editing `PackageWorkflows.ts` would be a stop-and-ask under §2.1, and P2.11's harness scenarios ("surface disposed with pending ops") would otherwise pin the asymmetric shape.

QUESTION (b): confirmed as coded; the ruling's prose is retracted (non-blocking 1); P6.3 takes the real value with N51 and the tracker note.

QUESTION (c): accepted (non-blocking 2).

CHECKED:
- `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; plan §1-§3 (lines 41-159), P1 rows and gate (203-219), P2 rows (221-238), Appendix B (424-436); `docs/plans/RUN.md` §5-§9; `docs/plans/STATUS.md` whole file (tracker rows P1.1a-P1.10, P1 gate block, the P1.1b checkpoint and diff review, the P1.7 and P1.8 rulings); `docs/plans/findings-ledger.md` N38-N50 (both tables) and every C row; the ten handoff notes' headers and sections; `src/core/ops/STATUS.md` whole file including the P1.10 ruling.
- Commits: `git log --oneline labs/2.0-P0-done..HEAD` (13), `git diff --stat` (86 files, +14056/-158), `git diff --name-only` filtered outside `src/core`, `src/protocol`, `docs/plans` (17 files: `.github/copilot-instructions.md`, `ci.yml`, `ARCHITECTURE.md`, `CHANGELOG.md`, seven ADRs, `docs/protocol.md`, `package.json`, `scripts/gen-protocol-docs.mjs`, two bench files, `vitest.config.mts`; each named by a P1 row or a docs duty), `git show` of 32642aa and 91d1144 on the frozen paths, `--diff-filter=D` (none), grep of the range for `.only(`/`.skip(`/`.todo(` (none).
- Per item: P1.1a `satisfies Record<RequestType, true>` and `Record<EventType, true>` (`guards.ts:33,39`), `docs:protocol`/`docs:protocol:check` scripts (`package.json:305-306`), the CI step (`ci.yml:79`), `PromiseLike` in `contracts.ts:31`; P1.1b both blocking fixes of its diff review present (`docs/adr/004-project-model.md:49-51`, `003:42-47`); P1.2 `concurrency.ts:79` and the empty/diamond topo tests; P1.3 `isUpdateCandidate` `exact` branch and the named test; P1.4 `deleteByPrefix`, `clearPackages`, `invalidationToCacheScopes`, `packageKeyPrefixes`, `DEFAULT_STORE_BYTES = 8 * 1024 * 1024`; P1.5 the four named redact tests; P1.6 `capabilitiesFor` (`supported = major >= 10`, `'verified'` only with a fixture), `{ ...process.env, ...options.env, ...FIXED_ENV }` (`DotnetRunner.ts:188`), transient probes not cached (`:302-317`), `it.skipIf` at `:237` and `:806`, the `no-throw-literal` and `no-control-regex` directives, `never builds the verb-first form`, no `nounFirstSyntax` anywhere in `src/core`, the inverted validator cases (`validate.test.ts:108-121,176`), the named titles `caches a non-zero probe`, `retries after a spawn failure or timeout`, `forces the fixed CLI environment over caller variables`, `cpm: addPackageArgs rejects --no-restore`; P1.7 `scopes.ts` normalizes with `platform` (`:65-74,100`), the win32 test, the `reconcile` JSDoc; P1.8 the seven literal titles plus the two carry-over titles, `keys: Map<ResourceKey, number>` (`QueryCoordinator.ts:99`), the `entry.current !== computation` guard, 13 `carried` hits, `InvalidationEvent` as ruled; P1.9 `http/index.ts` exports ssrf only, the eight named additions by title; P1.10 the whole source and test file, `AddPackageOptions.isCpm?` and the guard (`commands.ts:12-24,68-73`), `OperationStatus`/`StepOutcome`/`OperationOutcome`/`BulkOutcome` (`domain.ts:262-318`), `OperationRunContext`/`ProjectMutator` (`contracts.ts:87-91,343-354`), ADR-003 whole, ADR-007:17-22, `messages.ts:152-160,188-190`.
- Salvage gate (plan §3) over `src/core` and `src/protocol`: `grep -rn Thenable` → none; `vscode` value imports → none; imports from host/services/webview/extension → none; React → none; `grep -rln child_process --include='*.ts'` → `src/core/cli/*` only; stub markers (`not implemented`, `TODO: stub`, `throw new Error('stub`, `TODO`, `FIXME`) → none in sources; a heuristic grep for Node ≥ 20 globals found only the `Transport.fetch` interface method name (`contracts.ts:260`); the authoritative Node-18 check is `npx tsc --noEmit` with `@types-host/node@18` (P0.9), which the brief reports at 0. No module of a later item exists (`ls src/core`: cache, cli, contracts.ts, http, logging, ops, queries, session, util, versioning; no `src/host`).
- `ARCHITECTURE.md` 2.0 module map rows for every P1 directory (`:79-90`); `CHANGELOG.md` `[Unreleased]` entries for every P1 item (`:12-21,40`); `vitest.config.mts` coverage floor for `src/core/**` (`:48-50`); `.github/copilot-instructions.md` 2.0 gotchas (from the system context).
- Taken from the brief, not run by me (inspection only): every gate exit code and count (tsc, check-types, eslint, `npm test` 63/2130, bench 16/101+1, package:vsix, check:vsix, docs:protocol:check), the coverage percentages, the verbose 19-file listing, the CI conclusions (38267328292 and the three red runs with their re-runs), and the quarry excerpts cited in the P1.10 ruling. The gate conditions of the plan line are consistent with the tree I inspected.
````

## Exact next step (one item ID)

P2.1 (`src/core/ops/OperationQueue.ts`, `index.ts` and tests), after the tag `labs/2.0-P1-done`, which is
set once CI is green for the P1.fix-1 commit.

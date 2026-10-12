# ADR-003: Operation queue outcomes and shell-free CLI execution

Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: `rejected(reason, opId)`, `onProgress`, fixed environment, SDK floor)

## Context

`operationQueue.enqueue()` returned `false` when full and every install/update/remove ignored it;
errors thrown inside queued work never reached the webview; restores ran outside the queue; all
CLI calls were shell strings classified by a locale-dependent stderr regex.

The amendment of 2026-10-12 records the contract changes of plan item P1.1b and plan decisions D7 and
D13 (`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`, §1).

## Decision

### Queue
- `OperationQueue.submit(label, run, rejected)` returns an `OperationTicket` with `admitted`,
  `opId`, `cancel()` and a `completion` promise that resolves **exactly once and never rejects**
  with a typed outcome (`queued → running → restoring → completed | partial | failed | cancelled |
  rejected`). When the queue refuses the work it calls `rejected(reason, opId)` with the ticket's
  `opId`, so a refused outcome is correlated like any other.
- `OperationQueue.onProgress: Event<OperationProgress>` fires for every progress report of a running
  workflow, with its `opId`; the host forwards it to the webviews as the `ops/progress` event.
- Only **top-level workflows** are queued. Nested steps (per-package edits, restores inside a bulk
  workflow) call services directly. Submitting from inside a workflow is a programming error.
- Edit success and restore success are reported separately (`edit`, `restore` step outcomes).
  Partial results are reported and affected files are reconciled even after failure/cancel.
- Mutating requests are never auto-retried on response timeout.
- Capacity: 1 running + 5 waiting; beyond that `admitted: false` and a `rejected` outcome.

### Dotnet runner
- `DotnetRunner.run(args, { cwd, timeoutMs, signal })` uses `execFile`/`spawn` with argv —
  **no shell, ever**. Fixed environment: `DOTNET_CLI_UI_LANGUAGE=en`, `DOTNET_NOLOGO=1`,
  `DOTNET_CLI_TELEMETRY_OPTOUT=1`, `NO_COLOR=1`, `TERM=dumb`. It is applied last,
  `{ ...process.env, ...options.env, ...FIXED_ENV }`: a caller's `env` adds variables and never
  overrides the fixed ones.
- Success is `exitCode === 0`. Stderr/stdout are logged (redacted) but never used to decide success.
- `cwd` is always the project directory for project-scoped commands (SDK/`global.json` and
  `nuget.config` resolution), including `restore` and `nuget list source`.
- The runner is the only module that touches `child_process`. PowerShell (DPAPI) uses `execFile`
  with `-EncodedCommand`.
- SDK floor (plan decision D13): package references are added, removed and listed only with the
  noun-first commands `dotnet package add/remove/list --project`; the verb-first forms
  `dotnet add/remove/list <proj> package` are never issued. `sdkVersion()` returns `SdkInfo` with
  `supported = major >= 10`, and `undefined` only when `dotnet` is missing or its output cannot be
  parsed. Workflows refuse an edit when `!sdk.supported`, with the message "requires .NET SDK 10 or
  newer".

## Consequences

- Every `ops/*` request gets progress chunks and exactly one terminal response.
- `dotnet package list` is issued only with `--no-restore` (D13 closes M3); without it the command
  restores implicitly and is never used.

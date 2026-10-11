# ADR-003: Operation queue outcomes and shell-free CLI execution

Status: accepted · Date: 2026-10-10

## Context

`operationQueue.enqueue()` returned `false` when full and every install/update/remove ignored it;
errors thrown inside queued work never reached the webview; restores ran outside the queue; all
CLI calls were shell strings classified by a locale-dependent stderr regex.

## Decision

### Queue
- `OperationQueue.submit(label, run, rejected)` returns an `OperationTicket` with `admitted`,
  `opId`, `cancel()` and a `completion` promise that resolves **exactly once and never rejects**
  with a typed outcome (`queued → running → restoring → completed | partial | failed | cancelled |
  rejected`).
- Only **top-level workflows** are queued. Nested steps (per-package edits, restores inside a bulk
  workflow) call services directly. Submitting from inside a workflow is a programming error.
- Edit success and restore success are reported separately (`edit`, `restore` step outcomes).
  Partial results are reported and affected files are reconciled even after failure/cancel.
- Mutating requests are never auto-retried on response timeout.
- Capacity: 1 running + 5 waiting; beyond that `admitted: false` and a `rejected` outcome.

### Dotnet runner
- `DotnetRunner.run(args, { cwd, timeoutMs, signal })` uses `execFile`/`spawn` with argv —
  **no shell, ever**. Environment: `DOTNET_CLI_UI_LANGUAGE=en`, `DOTNET_NOLOGO=1`,
  `DOTNET_CLI_TELEMETRY_OPTOUT=1`, `NO_COLOR=1`.
- Success is `exitCode === 0`. Stderr/stdout are logged (redacted) but never used to decide success.
- `cwd` is always the project directory for project-scoped commands (SDK/`global.json` and
  `nuget.config` resolution), including `restore` and `nuget list source`.
- The runner is the only module that touches `child_process`. PowerShell (DPAPI) uses `execFile`
  with `-EncodedCommand`.

## Consequences

- Every `ops/*` request gets progress chunks and exactly one terminal response.
- `.NET 10 package list` (implicit restore) is not used as a read fallback.

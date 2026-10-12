---
description: 'Import boundaries between the nUIget 2.0 layers (core, protocol, host, webview) and the legacy 1.x code'
applyTo: 'src/core/**,src/protocol/**,src/host/**,src/webview/main/**,src/webview/sidebar-next/**,src/webview/shared/**,src/extension.next.ts'
---

# 2.0 Layer Boundaries

nUIget 2.0 is built next to the 1.x code on the `labs/2.0` branch. 2.0 code does not import legacy code, and
the 2.0 layers import each other in one direction only. Source of truth: §3 of
`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` and ADR-007 and ADR-008 in `docs/adr/`.

## Which code is which

| Set | Paths |
| --- | --- |
| 2.0 | `src/core/**`, `src/protocol/**`, `src/host/**`, `src/webview/{main,sidebar-next,shared}/**`, `src/extension.next.ts` |
| Legacy 1.x | `src/services/**`, `src/webview/{app,sidebar}/**`, `src/webview/NuGet*.ts`, `src/extension.ts` |

Legacy code is deleted at the flip (plan P8.2). Do not extend it for 2.0 features and do not move files
between the sets outside the plan item that names the move.

## Allowed imports

| Layer | Must not import |
| --- | --- |
| Core (`src/core/**`, `src/protocol/**`) | `src/host/**`, `src/extension*`, `src/webview/**`, `src/services/**`, `react`, `react-dom`, and `vscode` **values** (type-only imports of `vscode` are allowed) |
| Webview 2.0 (`src/webview/{main,sidebar-next,shared}/**`) | `src/core/**`, `src/services/**`, `vscode` |
| Host (`src/host/**`) | `src/services/**`, `react`, `react-dom` |

- A webview talks to the host only through the typed protocol in `src/protocol/**`.
- The only exception to the legacy rule is `LEGACY_IMPORT_ALLOWLIST` in `eslint.config.mjs`: explicit file
  paths, initially empty, kept minimal by a self-pruning unit test (plan P0.7). It is empty again at P8.2.
- `sidebar-next` follows the same rules as `main`; it has no exemption.

## Rules ESLint does not catch

- Core runs in the VS Code 1.85 extension host: Node 18.15. Do not use an API that needs Node 20 or newer.
- Core uses `PromiseLike`. `Thenable` appears only in `src/core/contracts.ts`.
- `src/protocol/**`, `src/core/contracts.ts` and `docs/adr/**` are frozen. Change them only in a plan item
  that names them, behind the `.claude/.contract-change` sentinel. Never widen a contract to fix a type error.
- Never stub a module that a later plan item creates. A missing neighbour means the item is blocked.

## Enforcement

`eslint.config.mjs` enforces the import table from plan item P0.7 onwards. Until then the table is a
convention: check new imports by hand and run `npx eslint src` before committing.

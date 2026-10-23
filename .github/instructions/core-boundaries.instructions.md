---
description: 'Import boundaries between the nUIget 2.0 layers (core, protocol, host, webview)'
applyTo: 'src/core/**,src/protocol/**,src/host/**,src/webview/**,src/extension.ts'
---

# 2.0 Layer Boundaries

The 2.0 layers import each other in one direction only. Source of truth: §3 of
`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` and ADR-007 and ADR-008 in `docs/adr/`.

## Layers

| Layer | Paths |
| --- | --- |
| Core | `src/core/**`, `src/protocol/**` |
| Host | `src/host/**` |
| Webview | `src/webview/**` (`shared`, `main`, `sidebar`) |
| Composition root | `src/extension.ts` |

## Allowed imports

| Layer | Must not import |
| --- | --- |
| Core (`src/core/**`, `src/protocol/**`) | `src/host/**`, `src/extension*`, `src/webview/**`, `react`, `react-dom`, and `vscode` **values** (type-only imports of `vscode` are allowed) |
| Webview (`src/webview/**`) | `src/core/**`, `vscode` |
| Host (`src/host/**`) | `react`, `react-dom` |

- A webview talks to the host only through the typed protocol in `src/protocol/**`.
- The main panel and the sidebar follow the same rules; neither has an exemption.

## Rules ESLint does not catch

- Core runs in the VS Code 1.90 extension host: Node 20.9. Do not use an API newer than Node 20.9.
- Core uses `PromiseLike`. `Thenable` appears only in `src/core/contracts.ts`.
- `src/protocol/**`, `src/core/contracts.ts` and `docs/adr/**` are frozen. Change them only in a plan item
  that names them, behind the `.claude/.contract-change` sentinel. Never widen a contract to fix a type error.
- Never stub a module that a later plan item creates. A missing neighbour means the item is blocked.

## Enforcement

`eslint.config.mjs` enforces the import table with one fence per layer, and `npm run lint` also covers
`scripts/`, `esbuild.mjs` and the root configuration files.

- Each fence is built from the `LAYERS` array. ESLint's flat configuration replaces rule options instead of
  merging them, so never add a second `@typescript-eslint/no-restricted-imports` block for files a fence
  already covers: extend the layer's arrays.
- `src/test/lint/import-boundaries.test.ts` checks the fences through the ESLint API.
